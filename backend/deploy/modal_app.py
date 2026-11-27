"""Scale-to-zero Modal deployment for authenticated TripoSR inference.

The checkpoint and U2NETP preprocessing model are downloaded once into a
persistent private Modal Volume, then SHA-256 checked before serving requests.
No Modal resource is created until this app is explicitly deployed.
"""

from pathlib import Path
import os

import modal


APP_NAME = "pixel3mesh-triposr"
UPSTREAM_REVISION = "107cefdc244c39106fa830359024f6a2f1c78871"
MODEL_REVISION = "5b521936b01fbe1890f6f9baed0254ab6351c04a"
CHECKPOINT_SHA256 = "429e2c6b22a0923967459de24d67f05962b235f79cde6b032aa7ed2ffcd970ee"
BACKGROUND_SHA256 = "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8"
VOLUME_PATH = "/model-cache"
TRIPOSR_ROOT = "/opt/triposr"
GPU = "T4"

ROOT = Path(__file__).resolve().parents[2]
app = modal.App(APP_NAME)
model_volume = modal.Volume.from_name("pixel3mesh-triposr-model-cache", create_if_missing=True)


def sha256_file(path: Path) -> str:
    """Hash large model artifacts without reading them all into RAM."""
    import hashlib

    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

# Python 3.10 and these core pins match the verified Colab T4 bundle. The
# complete Colab lock also contains notebook-only packages; this image installs
# only inference/runtime dependencies. The CPU marching-cubes shim avoids the
# incompatible torchmcubes CUDA extension while neural inference remains CUDA.
runtime_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git")
.pip_install_from_requirements(
        str(ROOT / "backend" / "deploy" / "requirements-modal-triposr.txt"),
        index_url="https://pypi.org/simple",
        extra_index_url="https://download.pytorch.org/whl/cu121",
        gpu=GPU,
    )
    .run_commands(
        f"git clone https://github.com/VAST-AI-Research/TripoSR.git {TRIPOSR_ROOT}",
        f"git -C {TRIPOSR_ROOT} checkout {UPSTREAM_REVISION}",
    )
    .add_local_file(str(ROOT / "backend" / "deploy" / "triposr_compat" / "torchmcubes.py"), "/opt/pixel3mesh-compat/torchmcubes.py")
    .add_local_dir(str(ROOT / "backend" / "app"), remote_path="/app/backend/app", copy=True)
    .env({
        "PYTHONPATH": "/app/backend:/opt/pixel3mesh-compat",
        "TRIPOSR_ROOT": VOLUME_PATH,
        "TRIPOSR_UPSTREAM": TRIPOSR_ROOT,
        "TRIPOSR_DEVICE": "cuda",
        "TRIPOSR_RESOLUTION": "256",
        "TRIPOSR_CHECKPOINT_SHA256": CHECKPOINT_SHA256,
        "TRIPOSR_BACKGROUND_SHA256": BACKGROUND_SHA256,
        "U2NET_HOME": f"{VOLUME_PATH}/inference",
        "RECONSTRUCTION_ENGINE": "triposr",
        "CORS_ORIGINS": "https://3d-product-reconstructor.pages.dev",
    })
)


@app.function(
    image=runtime_image,
    gpu=GPU,
    cpu=4,
    memory=12288,
    timeout=600,
    startup_timeout=600,
    scaledown_window=60,
    min_containers=0,
    max_containers=1,
    volumes={VOLUME_PATH: model_volume},
    secrets=[modal.Secret.from_name("pixel3mesh-triposr-api")],
)
@modal.concurrent(max_inputs=1)
@modal.asgi_app()
def reconstruction_api():
    """Serve only the existing signed-Supabase FastAPI routes."""
    from huggingface_hub import hf_hub_download
    import shutil

    model_dir = Path(VOLUME_PATH) / "model"
    inference_dir = Path(VOLUME_PATH) / "inference"
    model_dir.mkdir(parents=True, exist_ok=True)
    inference_dir.mkdir(parents=True, exist_ok=True)

    artifacts = {
        "model.ckpt": ("model.ckpt", CHECKPOINT_SHA256),
        "config.yaml": ("config.yaml", "74ca708ce086bf68e97709ea6b3d91f14717921c04691e84043f0eb8fcc68e62"),
    }
    for filename, (repo_file, expected_hash) in artifacts.items():
        destination = model_dir / filename
        if not destination.exists():
            downloaded = hf_hub_download(
                "stabilityai/TripoSR", repo_file, revision=MODEL_REVISION,
                cache_dir=f"{VOLUME_PATH}/hf-cache",
            )
            shutil.copyfile(downloaded, destination)
            model_volume.commit()
        digest = sha256_file(destination)
        if digest != expected_hash:
            raise RuntimeError(f"TripoSR artifact hash mismatch: {filename}")

    # Match rembg's documented cache filename and verify the same U2NETP file
    # used by the Colab bundle before the worker creates its inference session.
    background_file = inference_dir / "u2netp.onnx"
    if not background_file.exists():
        from urllib.request import urlopen

        background_url = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx"
        temporary = inference_dir / "u2netp.onnx.download"
        with urlopen(background_url, timeout=120) as response, temporary.open("wb") as output:
            shutil.copyfileobj(response, output)
        temporary.replace(background_file)
        model_volume.commit()
    if sha256_file(background_file) != BACKGROUND_SHA256:
        raise RuntimeError("U2NETP background model hash mismatch")

    # The worker's established layout is <root>/{model,inference,compat,upstream}.
    # Keep large immutable upstream code in the image and weights in the Volume.
    links = {
        "upstream": Path(TRIPOSR_ROOT),
        "compat": Path("/opt/pixel3mesh-compat"),
    }
    for name, target in links.items():
        link = Path(VOLUME_PATH) / name
        if link.exists() and link.is_symlink() and link.resolve() == target.resolve():
            continue
        if link.is_symlink() or link.exists():
            if link.is_dir() and not link.is_symlink():
                shutil.rmtree(link)
            else:
                link.unlink()
        link.symlink_to(target, target_is_directory=True)

    # rembg's pinned implementation downloads u2netp into U2NET_HOME on first
    # session creation. The worker verifies its SHA before inference.
    os.environ["U2NET_HOME"] = str(inference_dir)

    from app.main import app as api

    # TripoSRWorker owns one persistent child process per API container. Its
    # authenticated readiness route initializes the model in that process on
    # first use, avoiding a duplicate parent-process model allocation.
    return api


@app.local_entrypoint()
def verify_runtime():
    """A deliberate billable GPU check; run only after budget approval."""
    print("This entrypoint allocates one T4. Use only after explicit billing approval.")
