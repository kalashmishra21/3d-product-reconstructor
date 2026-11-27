"""Calibrated RGB inference for the frozen six-category research model."""

import math
import time
from pathlib import Path

import numpy as np

from app.model_readiness import SELECTED_SHA256


def validate_camera(camera: object) -> dict:
    """Reject missing or incompatible calibration instead of inventing a pose."""
    if not isinstance(camera, dict):
        raise ValueError("A calibrated camera JSON object is required")
    pose = np.asarray(camera.get("pose"), dtype=np.float64)
    transform = np.asarray(camera.get("camera_to_world"), dtype=np.float64)
    intrinsics = camera.get("intrinsics")
    if pose.shape != (4,) or transform.shape != (4, 4) or not isinstance(intrinsics, dict):
        raise ValueError("Camera pose, camera_to_world and intrinsics are required")
    if not np.isfinite(pose).all() or not np.isfinite(transform).all():
        raise ValueError("Camera values must be finite")
    if not np.allclose(transform[3], [0, 0, 0, 1], atol=1e-5):
        raise ValueError("Invalid homogeneous camera transform")
    rotation = transform[:3, :3]
    if not np.allclose(rotation @ rotation.T, np.eye(3), atol=2e-3) or not math.isclose(
        float(np.linalg.det(rotation)), 1.0, abs_tol=2e-3
    ):
        raise ValueError("Camera rotation is not rigid")
    for offset in (0, 2):
        if not math.isclose(float(np.linalg.norm(pose[offset:offset + 2])), 1.0, abs_tol=2e-3):
            raise ValueError("Camera pose sine/cosine values are invalid")
    values = {}
    for name in ("fx", "fy", "cx", "cy"):
        value = intrinsics.get(name)
        if type(value) not in (int, float) or not math.isfinite(value):
            raise ValueError("Camera intrinsics must be finite numbers")
        values[name] = float(value)
    if values["fx"] <= 0 or values["fy"] <= 0:
        raise ValueError("Camera focal lengths must be positive")
    if not (0 <= values["cx"] < 224 and 0 <= values["cy"] < 224):
        raise ValueError("Camera principal point is outside the image")
    if intrinsics.get("width") != 224 or intrinsics.get("height") != 224:
        raise ValueError("This checkpoint requires calibrated 224x224 images")
    return {"pose": pose.astype(np.float32), "camera_to_world": transform, "intrinsics": values}


def visible_geometry(prediction: dict) -> tuple[list, list]:
    """Backproject only predicted valid depth using the saved export convention."""
    depth = np.asarray(prediction["depth"], dtype=np.float64)
    mask = np.asarray(prediction["mask"], dtype=np.bool_)
    global_points = np.asarray(prediction["global_points"], dtype=np.float64)
    if depth.shape != (224, 224) or mask.shape != depth.shape or global_points.shape != (2048, 3):
        raise ValueError("Unexpected prediction tensor shapes")
    if not np.isfinite(depth).all() or not np.isfinite(global_points).all() or np.any(depth <= 0):
        raise ValueError("Nonfinite or invalid predicted geometry")
    intrinsics = prediction["intrinsics"]
    camera = prediction["camera_to_world"]
    rows, columns = np.mgrid[0:224:2, 0:224:2]
    sampled_depth = depth[rows, columns]
    camera_points = np.stack(
        (
            (columns - intrinsics["cx"]) * sampled_depth / intrinsics["fx"],
            (intrinsics["cy"] - rows) * sampled_depth / intrinsics["fy"],
            -sampled_depth,
        ),
        axis=-1,
    ).reshape(-1, 3)
    world_points = camera_points @ camera[:3, :3].T + camera[:3, 3]
    height, width = rows.shape
    indices = np.arange(height * width).reshape(height, width)
    first = indices[:-1, :-1].ravel()
    right = indices[:-1, 1:].ravel()
    below = indices[1:, :-1].ravel()
    diagonal = indices[1:, 1:].ravel()
    faces = np.concatenate((np.stack((first, right, below), 1), np.stack((right, diagonal, below), 1)))
    valid_pixels = mask[rows, columns].ravel()
    faces = faces[valid_pixels[faces].all(axis=1)]
    if not len(faces):
        raise ValueError("The model predicted no visible surface")
    triangles = world_points[faces]
    edge_lengths = np.linalg.norm(triangles - np.roll(triangles, 1, axis=1), axis=2)
    area_doubled = np.linalg.norm(np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0]), axis=1)
    faces = faces[(edge_lengths.max(axis=1) < 0.03) & (area_doubled > 1e-10)]
    if not len(faces):
        raise ValueError("The model predicted no valid triangles")
    used, inverse = np.unique(faces, return_inverse=True)
    return world_points[used].tolist(), inverse.reshape(-1, 3).tolist()


class SixCategoryAdapter:
    """Load the verified model once and return its genuine point and visible-mesh output."""

    def __init__(self, checkpoint: Path, config: Path, device: str):
        from app.six_category_model import infer, load_model

        self.model = load_model(checkpoint, config, device=device)
        self._infer_model = infer

    def infer(self, image_path: Path, camera: dict, model_init_ms: float = 0) -> dict:
        calibration = validate_camera(camera)
        started = time.perf_counter()
        prediction = self._infer_model(self.model, image_path, **calibration)
        vertices, faces = visible_geometry(prediction)
        latency_ms = round((time.perf_counter() - started) * 1000, 1)
        return {
            "schema_version": 2,
            "status": "complete",
            "model": "Pixel3Mesh",
            "model_version": SELECTED_SHA256,
            "output_type": "point_cloud_and_visible_surface",
            "global_points": prediction["global_points"].tolist(),
            "vertices": vertices,
            "faces": faces,
            "vertices_count": len(vertices),
            "faces_count": len(faces),
            "latency_ms": latency_ms,
            "model_init_ms": model_init_ms,
        }
