"""Regression checks for calibrated camera input and predicted mesh geometry."""

from io import BytesIO

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

from app.auth import verified_user
from app.main import app
from app.six_category_adapter import validate_camera, visible_geometry


def camera_metadata():
    return {
        "pose": [0, 1, 0, 1],
        "camera_to_world": [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]],
        "intrinsics": {"fx": 248, "fy": 248, "cx": 111.5, "cy": 111.5, "width": 224, "height": 224},
    }


def test_camera_requires_rigid_calibrated_transform():
    assert validate_camera(camera_metadata())["intrinsics"]["fx"] == 248
    for change in (
        lambda camera: camera.update(pose=[0, 0, 0, 1]),
        lambda camera: camera["camera_to_world"][0].__setitem__(0, 2),
        lambda camera: camera["intrinsics"].update(width=512),
    ):
        camera = camera_metadata()
        change(camera)
        try:
            validate_camera(camera)
        except ValueError:
            pass
        else:
            raise AssertionError("Invalid camera was accepted")


def test_visible_geometry_uses_predicted_depth_and_foreground_only():
    camera = validate_camera(camera_metadata())
    prediction = {
        "global_points": np.zeros((2048, 3)),
        "depth": np.full((224, 224), 0.75),
        "mask": np.ones((224, 224), dtype=bool),
        "camera_to_world": camera["camera_to_world"],
        "intrinsics": camera["intrinsics"],
    }
    vertices, faces = visible_geometry(prediction)
    assert len(vertices) == 112 * 112
    assert len(faces) == 2 * 111 * 111
    assert max(max(face) for face in faces) < len(vertices)
    assert all(abs(vertex[2] + 0.75) < 1e-6 for vertex in vertices)
    prediction["mask"][:] = False
    try:
        visible_geometry(prediction)
    except ValueError as error:
        assert "surface" in str(error)
    else:
        raise AssertionError("Empty predicted foreground was accepted")


def test_infer_rejects_malformed_camera_json_without_model_call(monkeypatch):
    def fail_if_called(*_args):
        raise AssertionError("Worker must not run")

    monkeypatch.setattr("app.inference.infer_image", fail_if_called)
    app.dependency_overrides[verified_user] = lambda: {"id": "test", "email": "test@example.invalid", "role": "authenticated"}
    image = BytesIO()
    Image.new("RGB", (224, 224)).save(image, "PNG")
    try:
        response = TestClient(app).post(
            "/api/v1/reconstructions/infer",
            files={"image": ("speaker.png", image.getvalue(), "image/png")},
            data={"camera": "{not-json"},
        )
        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()
