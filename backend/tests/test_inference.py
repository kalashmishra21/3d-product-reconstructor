"""Fast endpoint and model-boundary checks; no real checkpoint is loaded here."""

from io import BytesIO, StringIO
from queue import Queue

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.auth import verified_user
from app.inference import InferenceUnavailable, InvalidMeshOutput, ModelWorker, validate_mesh
from app.main import app


PATH = "/api/v1/reconstructions/infer"
TEST_USER = {"id": "test-verified-user", "email": "user@example.com", "role": "authenticated"}


def image_bytes():
    stream = BytesIO()
    Image.new("RGB", (13, 7), "#84936b").save(stream, format="PNG")
    return stream.getvalue()


def valid_mesh():
    return {
        "status": "complete", "model": "Pixel2Mesh", "stage": 3,
        "vertices_count": 2466, "faces_count": 4928,
        "latency_ms": 948.2, "model_init_ms": 312.4,
        "vertices": [[0.0, 0.0, 0.0] for _ in range(2466)],
        "faces": [[0, 1, 2] for _ in range(4928)],
    }


@pytest.fixture
def client():
    app.dependency_overrides[verified_user] = lambda: TEST_USER
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(verified_user, None)


def post(client, data=None, mime="image/png"):
    return client.post(PATH, files={"image": ("object.png", image_bytes() if data is None else data, mime)})


def test_infer_requires_authentication(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    anonymous = TestClient(app)
    assert post(anonymous).status_code == 401
    assert anonymous.get("/api/v1/health").status_code == 200


def test_infer_revalidates_image_before_worker(client, monkeypatch):
    called = False

    def must_not_run(*_args):
        nonlocal called
        called = True

    monkeypatch.setattr("app.inference.infer_image", must_not_run)
    assert post(client, b"not an image").status_code == 422
    assert post(client, image_bytes(), "image/gif").status_code == 415
    assert post(client, b"").status_code == 422
    assert called is False


def test_infer_returns_real_adapter_output_and_keeps_auth_private(client, monkeypatch):
    expected = valid_mesh()
    captured = []

    def fake_adapter(data, image_format):
        captured.append((len(data), image_format))
        return expected

    monkeypatch.setattr("app.inference.infer_image", fake_adapter)
    response = post(client)
    assert response.status_code == 200
    assert response.json() == expected
    assert captured == [(len(image_bytes()), "PNG")]
    assert "test-verified-user" not in response.text
    assert "Bearer" not in response.text
    assert client.get("/api/v1/me").json() == TEST_USER
    assert client.post("/api/v1/reconstructions/preflight", files={"image": ("object.png", image_bytes(), "image/png")}).status_code == 200


def test_worker_failure_maps_to_service_unavailable(client, monkeypatch):
    def fail(*_args):
        raise InferenceUnavailable("internal worker detail")

    monkeypatch.setattr("app.inference.infer_image", fail)
    response = post(client)
    assert response.status_code == 503
    assert "internal worker detail" not in response.text


def test_malformed_worker_protocol_is_rejected():
    class FakeProcess:
        stdin = StringIO()

        def poll(self):
            return None

    model_worker = ModelWorker()
    model_worker._process = FakeProcess()
    model_worker._responses = Queue()
    model_worker._responses.put("[]")
    with pytest.raises(InvalidMeshOutput):
        model_worker.infer("ignored-image-path")


@pytest.mark.parametrize("damage", [
    lambda mesh: mesh["vertices"].pop(),
    lambda mesh: mesh["vertices"][0].__setitem__(0, float("nan")),
    lambda mesh: mesh["faces"][0].__setitem__(0, 2466),
    lambda mesh: mesh.update({"stage": 2}),
])
def test_malformed_stage_three_mesh_is_rejected(client, monkeypatch, damage):
    from app.inference import InvalidMeshOutput

    mesh = valid_mesh()
    damage(mesh)

    def fake_adapter(*_args):
        return validate_mesh(mesh)

    monkeypatch.setattr("app.inference.infer_image", fake_adapter)
    response = post(client)
    assert response.status_code == 502
    assert "invalid mesh" in response.text
    with pytest.raises(InvalidMeshOutput):
        validate_mesh(mesh)
