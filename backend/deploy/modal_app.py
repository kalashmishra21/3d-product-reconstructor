"""Modal ASGI deployment for the verified Pixel3Mesh inference API.

CPU is the safe default. To use the optional GPU image, set
PIXEL3MESH_MODAL_GPU=T4 (or another Modal GPU name) before deploying.
"""

from pathlib import Path
import os

import modal


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DEPLOYMENT_ROOT = Path(__file__).resolve().parent
MODEL_MOUNT = "/models"
EXPECTED_SHA256 = "ea861cc8f2120d80a8509b2581949445ca8aa73e1d274ba2882ed37e770f3500"
GPU_TYPE = os.getenv("PIXEL3MESH_MODAL_GPU", "").strip() or None
DEVICE = "cuda" if GPU_TYPE else "cpu"
PYTORCH_INDEX = "https://download.pytorch.org/whl/cu130" if GPU_TYPE else "https://download.pytorch.org/whl/cpu"
REQUIREMENTS = DEPLOYMENT_ROOT / ("requirements-gpu.txt" if GPU_TYPE else "requirements-cpu.txt")

app = modal.App("pixel3mesh-inference")
model_volume = modal.Volume.from_name("pixel3mesh-model-artifacts", create_if_missing=True)

runtime_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install_from_requirements(
        str(REQUIREMENTS),
        index_url="https://pypi.org/simple",
        extra_index_url=PYTORCH_INDEX,
        gpu=GPU_TYPE,
    )
    .add_local_dir(str(REPOSITORY_ROOT / "backend" / "app"), remote_path="/app/backend/app", copy=True)
    .env({
        "PYTHONPATH": "/app/backend",
        "RECONSTRUCTION_ENGINE": "six_category",
        "PIXEL3MESH_CHECKPOINT": f"{MODEL_MOUNT}/best_model.pt",
        "PIXEL3MESH_CONFIG": f"{MODEL_MOUNT}/inference_config.json",
        "PIXEL3MESH_DEVICE": DEVICE,
        "PIXEL3MESH_EXPECTED_SHA256": EXPECTED_SHA256,
        "CORS_ORIGINS": "https://3d-product-reconstructor.pages.dev",
    })
)


@app.function(
    image=runtime_image,
    cpu=2.0,
    memory=(2048, 4096),
    gpu=GPU_TYPE,
    timeout=180,
    startup_timeout=240,
    scaledown_window=60,
    min_containers=0,
    max_containers=1,
    volumes={MODEL_MOUNT: model_volume},
    secrets=[modal.Secret.from_name("pixel3mesh-api")],
)
@modal.concurrent(max_inputs=1)
@modal.asgi_app()
def fastapi_app():
    """Serve the existing FastAPI routers with one serialized model worker."""
    from app.main import app as reconstruction_api

    return reconstruction_api


@app.local_entrypoint()
def upload_verified_model_bundle(bundle_directory: str):
    """Copy only the checkpoint and inference config into the private Modal volume."""
    import hashlib
    import shutil
    import tempfile

    source = Path(bundle_directory).expanduser().resolve()
    checkpoint = source / "best_model.pt"
    config = source / "inference_config.json"
    if not checkpoint.is_file() or not config.is_file():
        raise SystemExit("Bundle directory must contain best_model.pt and inference_config.json")
    digest = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        raise SystemExit(f"Checkpoint SHA-256 mismatch: {digest}")
    with tempfile.TemporaryDirectory(prefix="pixel3mesh-model-volume-") as staging:
        staging_path = Path(staging)
        shutil.copy2(checkpoint, staging_path / "best_model.pt")
        shutil.copy2(config, staging_path / "inference_config.json")
        with model_volume.batch_upload() as upload:
            upload.put_directory(staging_path, "/")
    print(f"Uploaded verified checkpoint ({checkpoint.stat().st_size} bytes, SHA-256 {digest}) and inference config.")
