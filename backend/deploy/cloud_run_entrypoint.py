"""Download the private verified model bundle, then start the FastAPI service."""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path


EXPECTED_CHECKPOINT_SHA256 = "ea861cc8f2120d80a8509b2581949445ca8aa73e1d274ba2882ed37e770f3500"
MODEL_DIRECTORY = Path("/tmp/pixel3mesh-model")
MAX_CHECKPOINT_BYTES = 512 * 1024 * 1024
MAX_CONFIG_BYTES = 1024 * 1024


def download_model_artifacts() -> tuple[Path, Path]:
    """Fetch only named private GCS objects using the Cloud Run service identity."""
    bucket_name = os.environ.get("PIXEL3MESH_MODEL_BUCKET", "").strip()
    checkpoint_object = os.environ.get("PIXEL3MESH_CHECKPOINT_OBJECT", "").strip()
    config_object = os.environ.get("PIXEL3MESH_CONFIG_OBJECT", "").strip()
    if not bucket_name or not checkpoint_object or not config_object:
        raise RuntimeError("Private model bucket and object names must be configured")
    if checkpoint_object.startswith("/") or config_object.startswith("/"):
        raise RuntimeError("Model object names must be relative to the configured bucket")

    from google.cloud import storage

    bucket = storage.Client().bucket(bucket_name)
    MODEL_DIRECTORY.mkdir(mode=0o700, parents=True, exist_ok=True)
    checkpoint_path = MODEL_DIRECTORY / "best_model.pt"
    config_path = MODEL_DIRECTORY / "inference_config.json"
    checkpoint_blob = bucket.blob(checkpoint_object)
    config_blob = bucket.blob(config_object)
    checkpoint_blob.reload()
    config_blob.reload()
    if checkpoint_blob.size is None or not 0 < checkpoint_blob.size <= MAX_CHECKPOINT_BYTES:
        raise RuntimeError("Private model checkpoint has an invalid size")
    if config_blob.size is None or not 0 < config_blob.size <= MAX_CONFIG_BYTES:
        raise RuntimeError("Private model configuration has an invalid size")

    checkpoint_blob.download_to_filename(str(checkpoint_path))
    digest = hashlib.sha256(checkpoint_path.read_bytes()).hexdigest()
    if digest != EXPECTED_CHECKPOINT_SHA256:
        checkpoint_path.unlink(missing_ok=True)
        raise RuntimeError("Downloaded model checkpoint SHA-256 does not match the release manifest")

    config_blob.download_to_filename(str(config_path))
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
        depth_min, depth_max = float(config["depth_min"]), float(config["depth_max"])
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
        raise RuntimeError("Private inference configuration is invalid") from exc
    if not (0 < depth_min < depth_max):
        raise RuntimeError("Private inference depth range is invalid")
    os.chmod(checkpoint_path, 0o600)
    os.chmod(config_path, 0o600)
    os.environ["PIXEL3MESH_CHECKPOINT"] = str(checkpoint_path)
    os.environ["PIXEL3MESH_CONFIG"] = str(config_path)
    os.environ["PIXEL3MESH_EXPECTED_SHA256"] = EXPECTED_CHECKPOINT_SHA256
    os.environ["PIXEL3MESH_DEVICE"] = "cpu"
    os.environ["RECONSTRUCTION_ENGINE"] = "six_category"
    return checkpoint_path, config_path


def main() -> None:
    checkpoint_path, config_path = download_model_artifacts()
    # Log the verified identity and byte count, never the image or camera payload.
    print(json.dumps({
        "event": "model_artifacts_verified",
        "checkpoint_sha256": EXPECTED_CHECKPOINT_SHA256,
        "checkpoint_bytes": checkpoint_path.stat().st_size,
        "config_bytes": config_path.stat().st_size,
    }), flush=True)
    port = os.environ.get("PORT", "8080")
    os.execv(sys.executable, [sys.executable, "-m", "uvicorn", "app.main:app",
                              "--host", "0.0.0.0", "--port", port,
                              "--workers", "1", "--timeout-keep-alive", "5"])


if __name__ == "__main__":
    main()
