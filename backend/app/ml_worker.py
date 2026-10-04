"""Headless Pixel2Mesh worker, launched with the existing .venv-p2m interpreter.

The only stdout output is one JSON response per request. Model diagnostics use
stderr so the parent FastAPI process can keep the worker alive between images.
"""

import contextlib
import json
import os
import sys
import time
import traceback
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
P2M = ROOT / "Pixel2Mesh"
sys.path.insert(0, str(P2M))
os.chdir(P2M)

_model = None
_faces = None


def load_model_once():
    """Load verified V3 weights and ellipsoid topology once per worker."""
    global _model, _faces
    if _model is not None:
        return 0.0

    started = time.perf_counter()
    import torch
    from models.p2m import P2MModel
    from options import options, update_options
    from utils.mesh import Ellipsoid

    torch.set_num_threads(4)
    update_options("configs/reconstructor_v3.yml")
    ellipsoid = Ellipsoid(options.dataset.mesh_pos)
    model = P2MModel(
        options.model,
        ellipsoid,
        options.dataset.camera_f,
        options.dataset.camera_c,
        options.dataset.mesh_pos,
    )
    checkpoint = torch.load(
        P2M / "checkpoints" / "260000_000010.pt",
        map_location="cpu",
        weights_only=False,
    )
    if checkpoint.get("epoch") != 10 or checkpoint.get("total_step_count") != 260000:
        raise ValueError("The local checkpoint is not the finalized V3 checkpoint")
    keys = model.load_state_dict(checkpoint["model"], strict=False)
    if len(keys.missing_keys) != 43 or not all(
        name.endswith(".adj_mat") for name in keys.missing_keys
    ) or keys.unexpected_keys:
        raise ValueError("Checkpoint and model state do not match")
    if tuple(ellipsoid.faces[2].shape) != (4928, 3):
        raise ValueError("Stage-3 topology is not the expected 4,928 triangles")
    model.eval()
    _model = model
    _faces = ellipsoid.faces[2]
    return round((time.perf_counter() - started) * 1000, 1)


def infer_image(image_path: Path):
    """Reuse ReconstructorDemoDataset preprocessing and return actual Stage 3."""
    init_ms = load_model_once()
    import torch
    from datasets.reconstructor import ReconstructorDemoDataset
    from options import options

    with contextlib.redirect_stdout(sys.stderr):
        dataset = ReconstructorDemoDataset(
            image_path.parent, options.dataset.normalization, options.dataset.shapenet
        )
        images = dataset[0]["images"].unsqueeze(0)
    if tuple(images.shape) != (1, 3, 224, 224):
        raise ValueError("Preprocessed image has the wrong shape")

    started = time.perf_counter()
    with torch.no_grad():
        output = _model(images)
    latency_ms = round((time.perf_counter() - started) * 1000, 1)
    stages = output.get("pred_coord")
    if not isinstance(stages, list) or [tuple(stage.shape) for stage in stages] != [
        (1, 156, 3), (1, 618, 3), (1, 2466, 3)
    ]:
        raise ValueError("Pixel2Mesh did not return the expected three stages")
    final = stages[2][0]
    if not bool(torch.isfinite(final).all()) or final.requires_grad:
        raise ValueError("Stage-3 coordinates are not finite detached values")
    if int(_faces.min()) < 0 or int(_faces.max()) >= 2466:
        raise ValueError("Stage-3 face indices are out of range")
    return {
        "status": "complete",
        "model": "Pixel2Mesh",
        "stage": 3,
        "vertices_count": 2466,
        "faces_count": 4928,
        "latency_ms": latency_ms,
        "model_init_ms": init_ms,
        "vertices": final.tolist(),
        "faces": _faces.tolist(),
    }


def main():
    for line in sys.stdin:
        try:
            request = json.loads(line)
            response = {"ok": True, "mesh": infer_image(Path(request["image_path"]))}
        except Exception:
            traceback.print_exc(file=sys.stderr)
            response = {"ok": False}
        sys.stdout.write(json.dumps(response, allow_nan=False, separators=(",", ":")) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
