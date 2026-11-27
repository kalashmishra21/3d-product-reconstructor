"""Focused API tests for the optional authenticated TripoSR engine."""

from io import BytesIO
import json

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from app.auth import verified_user
from app.triposr_inference import TripoSRUnavailable, router, worker


def make_client() -> TestClient:
    application = FastAPI()
    application.include_router(router)
    application.dependency_overrides[verified_user] = lambda: {"id": "owner"}
    return TestClient(application)


def jpeg() -> bytes:
    image = Image.new("RGB", (32, 32), "white")
    output = BytesIO()
    image.save(output, format="JPEG")
    return output.getvalue()


def prediction() -> dict:
    return {
        "schema_version": 3,
        "status": "complete",
        "model": "TripoSR",
        "engine": "stabilityai/TripoSR",
        "model_version": "429e2c6b22a0923967459de24d67f05962b235f79cde6b032aa7ed2ffcd970ee",
        "output_type": "colored_triangle_mesh",
        "vertices_count": 3,
        "faces_count": 1,
        "latency_ms": 12.3,
        "model_init_ms": 0,
        "resolution": 128,
        "vertices": [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
        "faces": [[0, 1, 2]],
        "vertex_colors": [[255, 0, 0, 255]] * 3,
    }


def test_triposr_readiness_returns_503_when_worker_is_offline(monkeypatch):
    def offline():
        raise TripoSRUnavailable("offline")

    monkeypatch.setattr(worker, "ready", offline)
    response = make_client().get("/api/v1/triposr/readiness")
    assert response.status_code == 503
    assert response.json()["detail"] == "TripoSR inference is unavailable."


def test_triposr_accepts_one_rgb_image_and_returns_variable_geometry(monkeypatch):
    calls = []

    def infer(path):
        calls.append(path.read_bytes())
        assert path.suffix == ".jpg"
        return prediction()

    monkeypatch.setattr(worker, "infer", infer)
    response = make_client().post(
        "/api/v1/triposr/reconstruct",
        files={"image": ("speaker.jpg", jpeg(), "image/jpeg")},
    )
    assert response.status_code == 200
    assert response.json()["schema_version"] == 3
    assert response.json()["model"] == "TripoSR"
    assert response.json()["vertices_count"] == 3
    assert len(calls) == 1


def test_triposr_rejects_unauthenticated_request(monkeypatch):
    application = FastAPI()
    application.include_router(router)
    response = TestClient(application).post(
        "/api/v1/triposr/reconstruct",
        files={"image": ("speaker.jpg", jpeg(), "image/jpeg")},
    )
    assert response.status_code == 401


def test_remote_worker_requires_https_and_a_long_token(monkeypatch):
    monkeypatch.setenv("TRIPOSR_REMOTE_URL", "http://worker.example")
    monkeypatch.setenv("TRIPOSR_REMOTE_TOKEN", "short")
    try:
        worker._remote_request("ready")
    except TripoSRUnavailable as error:
        assert "Secure remote" in str(error)
    else:
        raise AssertionError("Insecure remote worker configuration was accepted")


def test_remote_worker_prediction_checks_provenance_and_geometry():
    value = prediction()
    assert worker._validate_prediction(value) == value
    invalid = {**value, "faces": [[0, 1, 3]]}
    try:
        worker._validate_prediction(invalid)
    except TripoSRUnavailable as error:
        assert "invalid mesh geometry" in str(error)
    else:
        raise AssertionError("Out-of-range remote face index was accepted")
