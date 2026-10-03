"""Preflight checks use generated image bytes and a test-only verified identity."""

from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image, features

from app.auth import verified_user
from app.main import app
from app.preflight import MAX_IMAGE_BYTES


PATH = "/api/v1/reconstructions/preflight"
TEST_USER = {"id": "test-verified-user", "email": "user@example.com", "role": "authenticated"}


def image_bytes(image_format: str, size: tuple[int, int] = (13, 7)) -> bytes:
    stream = BytesIO()
    Image.new("RGB", size, "#84936b").save(stream, format=image_format)
    return stream.getvalue()


@pytest.fixture
def authenticated_client():
    app.dependency_overrides[verified_user] = lambda: TEST_USER
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(verified_user, None)


def post_image(client: TestClient, data: bytes, mime: str = "image/png", name: str = "object.png"):
    return client.post(PATH, files={"image": (name, data, mime)})


def test_preflight_requires_verified_authentication(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    client = TestClient(app)
    upload = image_bytes("PNG")
    assert post_image(client, upload).status_code == 401
    assert client.post(PATH, headers={"Authorization": "Bearer invalid"}, files={"image": ("object.png", upload, "image/png")}).status_code == 401


@pytest.mark.parametrize("image_format,mime", [
    ("PNG", "image/png"),
    ("JPEG", "image/jpeg"),
    ("WEBP", "image/webp"),
])
def test_valid_image_returns_verified_metadata(authenticated_client, image_format: str, mime: str):
    if image_format == "WEBP" and not features.check("webp"):
        pytest.skip("This Pillow build has no WebP decoder")
    data = image_bytes(image_format)
    response = post_image(authenticated_client, data, mime, f"item.{image_format.lower()}")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "filename": f"item.{image_format.lower()}",
        "content_type": mime,
        "format": image_format,
        "width": 13,
        "height": 7,
        "size_bytes": len(data),
        "user_id": TEST_USER["id"],
    }


def test_declared_mime_and_decoded_format_must_match(authenticated_client):
    assert post_image(authenticated_client, image_bytes("PNG"), "image/jpeg").status_code == 415
    assert post_image(authenticated_client, image_bytes("PNG"), "image/gif").status_code == 415


def test_fake_image_bytes_are_rejected(authenticated_client):
    assert post_image(authenticated_client, b"not an image").status_code == 422


def test_oversized_and_empty_uploads_are_rejected(authenticated_client):
    assert post_image(authenticated_client, b"x" * (MAX_IMAGE_BYTES + 1)).status_code == 413
    assert post_image(authenticated_client, b"").status_code == 422


def test_health_and_me_remain_usable(authenticated_client):
    assert authenticated_client.get("/api/v1/health").status_code == 200
    assert authenticated_client.get("/api/v1/me").json() == TEST_USER
