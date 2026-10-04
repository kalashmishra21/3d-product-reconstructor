"""Explicit real-checkpoint smoke: run manually, never in the fast pytest suite.

From the repository root: backend/.venv/Scripts/python.exe backend/tests/integration_smoke.py
"""

import sys
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.inference import infer_image, validate_mesh


stream = BytesIO()
Image.new("RGB", (224, 224), "#84936b").save(stream, format="PNG")
data = stream.getvalue()

first = validate_mesh(infer_image(data, "PNG"))
second = validate_mesh(infer_image(data, "PNG"))
assert second["model_init_ms"] == 0, "Checkpoint was reloaded for a second image"
assert first["vertices_count"] == second["vertices_count"] == 2466
assert first["faces_count"] == second["faces_count"] == 4928
print(
    "REAL_MODEL_SMOKE_PASS",
    "initialization_ms=", first["model_init_ms"],
    "first_inference_ms=", first["latency_ms"],
    "reused_inference_ms=", second["latency_ms"],
)
