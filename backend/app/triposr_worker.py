"""Long-lived, isolated TripoSR process; stdout is reserved for JSON responses."""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
import traceback
from pathlib import Path


ROOT = Path(os.environ.get("TRIPOSR_ROOT", "" )).resolve()
CHECKPOINT = ROOT / "model" / "model.ckpt"
EXPECTED_SHA256 = os.environ.get("TRIPOSR_CHECKPOINT_SHA256", "")
DEVICE = os.environ.get("TRIPOSR_DEVICE", "cuda")
RESOLUTION = int(os.environ.get("TRIPOSR_RESOLUTION", "256"))
_model = None
_rembg_session = None
_model_init_ms = 0.0


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_model_once() -> float:
    global _model, _rembg_session, _model_init_ms
    if _model is not None:
        return _model_init_ms
    if not CHECKPOINT.is_file() or not EXPECTED_SHA256:
        raise RuntimeError("TripoSR checkpoint configuration is missing")
    actual = _sha256(CHECKPOINT)
    if actual != EXPECTED_SHA256:
        raise RuntimeError("TripoSR checkpoint SHA-256 does not match configuration")
    if DEVICE.startswith("cuda"):
        import torch

        if not torch.cuda.is_available():
            raise RuntimeError("Configured TripoSR CUDA device is unavailable")
    elif DEVICE != "cpu":
        raise RuntimeError("TRIPOSR_DEVICE must be cpu or a CUDA device")

    sys.path.insert(0, str(ROOT / "compat"))
    sys.path.insert(0, str(ROOT / "upstream"))
    os.environ["U2NET_HOME"] = str(ROOT / "inference")
    started = time.perf_counter()
    from tsr.system import TSR
    import rembg

    model = TSR.from_pretrained(
        str(ROOT / "model"), config_name="config.yaml", weight_name="model.ckpt"
    )
    model.eval().to(DEVICE)
    model.renderer.set_chunk_size(8192)
    session = rembg.new_session("u2netp", providers=["CPUExecutionProvider"])
    _model = model
    _rembg_session = session
    _model_init_ms = round((time.perf_counter() - started) * 1000, 1)
    return _model_init_ms


def infer(image_path: Path) -> dict:
    init_ms = load_model_once()
    import numpy as np
    import torch
    from PIL import Image
    from tsr.utils import remove_background, resize_foreground

    started = time.perf_counter()
    with Image.open(image_path) as source:
        original = source.convert("RGB")
    foreground = remove_background(original, _rembg_session)
    foreground = resize_foreground(foreground, 0.85)
    rgba = np.asarray(foreground, dtype=np.float32) / 255.0
    rgb = rgba[:, :, :3] * rgba[:, :, 3:4] + (1.0 - rgba[:, :, 3:4]) * 0.5
    processed = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8))

    if DEVICE.startswith("cuda"):
        torch.cuda.synchronize()
        torch.cuda.reset_peak_memory_stats()
    with torch.inference_mode():
        scene = _model([processed], device=DEVICE)
        if DEVICE.startswith("cuda"):
            torch.cuda.synchronize()
        meshes = _model.extract_mesh(scene, True, resolution=RESOLUTION)
        if DEVICE.startswith("cuda"):
            torch.cuda.synchronize()
    mesh = meshes[0]
    vertices = np.asarray(mesh.vertices, dtype=np.float32)
    faces = np.asarray(mesh.faces, dtype=np.int64)
    colors = np.asarray(mesh.visual.vertex_colors, dtype=np.uint8)
    if vertices.ndim != 2 or vertices.shape[1] != 3 or not len(vertices):
        raise ValueError("TripoSR returned empty or malformed vertices")
    if faces.ndim != 2 or faces.shape[1] != 3 or not len(faces):
        raise ValueError("TripoSR returned empty or malformed faces")
    if not np.isfinite(vertices).all() or faces.min() < 0 or faces.max() >= len(vertices):
        raise ValueError("TripoSR returned invalid geometry")
    if colors.shape[0] != vertices.shape[0] or colors.shape[1] < 3:
        raise ValueError("TripoSR returned incompatible vertex colors")
    checkpoint = EXPECTED_SHA256
    return {
        "schema_version": 3,
        "status": "complete",
        "model": "TripoSR",
        "engine": "stabilityai/TripoSR",
        "model_version": checkpoint,
        "output_type": "colored_triangle_mesh",
        "vertices_count": int(vertices.shape[0]),
        "faces_count": int(faces.shape[0]),
        "latency_ms": round((time.perf_counter() - started) * 1000, 1),
        "model_init_ms": init_ms,
        "resolution": RESOLUTION,
        "vertices": vertices.tolist(),
        "faces": faces.tolist(),
        "vertex_colors": colors[:, :4].tolist(),
    }


def main() -> None:
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            if request.get("operation") == "ready":
                init_ms = load_model_once()
                response = {
                    "ok": True,
                    "ready": True,
                    "model": "TripoSR",
                    "checkpoint_sha256": EXPECTED_SHA256,
                    "device": DEVICE,
                    "model_init_ms": init_ms,
                }
            else:
                response = {"ok": True, "prediction": infer(Path(request["image_path"]))}
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            response = {"ok": False, "error": type(exc).__name__}
        sys.stdout.write(json.dumps(response, allow_nan=False, separators=(",", ":")) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
