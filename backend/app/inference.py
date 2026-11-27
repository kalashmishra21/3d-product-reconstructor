"""Authenticated, bounded image-to-Stage-3 inference without ML imports in FastAPI."""

import json
import math
import os
import queue
import subprocess
import sys
import tempfile
import threading
from contextlib import contextmanager
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.auth import verified_user
from app.preflight import read_validated_image
from app.geometry_contract import validate_reconstruction
from app.model_readiness import selected_model_status


ROOT = Path(__file__).resolve().parents[2]
P2M = ROOT / "Pixel2Mesh"
WORKER_SCRIPT = Path(__file__).with_name("ml_worker.py")
router = APIRouter(prefix="/api/v1/reconstructions", tags=["reconstructions"])


class InferenceUnavailable(Exception):
    """The local ML runtime or worker could not complete inference."""


class InvalidMeshOutput(Exception):
    """The worker response did not contain a valid final Stage-3 mesh."""


class InvalidCameraInput(Exception):
    """The calibrated camera is missing or incompatible with the selected model."""


def validate_mesh(mesh):
    """Reject malformed, non-finite, or out-of-range worker output."""
    if isinstance(mesh, dict) and mesh.get('schema_version') == 2:
        try:
            return validate_reconstruction(mesh)
        except ValueError as exc:
            raise InvalidMeshOutput('Invalid reconstruction geometry') from exc
    if not isinstance(mesh, dict) or any(mesh.get(key) != value for key, value in {
        "status": "complete", "model": "Pixel2Mesh", "stage": 3,
        "vertices_count": 2466, "faces_count": 4928,
    }.items()):
        raise InvalidMeshOutput("Incorrect Stage-3 metadata")
    vertices, faces = mesh.get("vertices"), mesh.get("faces")
    if not isinstance(vertices, list) or len(vertices) != 2466:
        raise InvalidMeshOutput("Incorrect Stage-3 vertices")
    if not isinstance(faces, list) or len(faces) != 4928:
        raise InvalidMeshOutput("Incorrect Stage-3 faces")
    if any(
        not isinstance(vertex, list) or len(vertex) != 3 or
        any(type(value) not in (int, float) or not math.isfinite(value) for value in vertex)
        for vertex in vertices
    ):
        raise InvalidMeshOutput("Non-finite or malformed vertices")
    if any(
        not isinstance(face, list) or len(face) != 3 or
        any(type(index) is not int or index < 0 or index >= 2466 for index in face)
        for face in faces
    ):
        raise InvalidMeshOutput("Out-of-range or malformed faces")
    latency = mesh.get("latency_ms")
    if type(latency) not in (int, float) or not math.isfinite(latency) or latency < 0:
        raise InvalidMeshOutput("Invalid inference timing")
    return mesh


class ModelWorker:
    """One lazily launched, serialized .venv-p2m process per API worker."""

    def __init__(self):
        self._lock = threading.Lock()
        self._process = None
        self._responses = None

    def _start(self):
        engine = os.getenv("RECONSTRUCTION_ENGINE", "six_category")
        if engine == "legacy_pixel2mesh":
            executable = os.getenv("P2M_PYTHON") or ROOT / ".venv-p2m" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
            working_directory = P2M
        elif engine == "six_category":
            if selected_model_status().get("reason") != "inference_bundle_not_verified":
                raise InferenceUnavailable("Selected checkpoint is missing or unverified")
            executable = os.getenv("PIXEL3MESH_PYTHON", sys.executable)
            working_directory = ROOT
        else:
            raise InferenceUnavailable("Unsupported reconstruction engine")
        if not Path(executable).is_file():
            raise InferenceUnavailable("Model Python environment is unavailable")
        try:
            self._process = subprocess.Popen(
                [str(executable), "-u", str(WORKER_SCRIPT)],
                cwd=working_directory,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=None,
                text=True,
                encoding="utf-8",
            )
        except OSError as exc:
            raise InferenceUnavailable("Model worker could not start") from exc
        self._responses = queue.Queue(maxsize=1)
        process = self._process
        responses = self._responses

        def read_responses():
            for line in process.stdout:
                responses.put(line)
            responses.put(None)

        threading.Thread(target=read_responses, daemon=True).start()

    @contextmanager
    def _admission(self):
        if not self._lock.acquire(blocking=False):
            raise InferenceUnavailable('Inference worker is busy')
        try:
            yield
        finally:
            self._lock.release()

    def _request(self, payload: dict):
        if self._process is None or self._process.poll() is not None:
            self._start()
        try:
            self._process.stdin.write(json.dumps(payload) + "\n")
            self._process.stdin.flush()
            line = self._responses.get(timeout=180)
        except (OSError, BrokenPipeError, queue.Empty) as exc:
            self._stop()
            raise InferenceUnavailable("Model worker did not respond") from exc
        if line is None:
            self._stop()
            raise InferenceUnavailable("Model worker exited unexpectedly")
        try:
            response = json.loads(line)
        except ValueError as exc:
            raise InvalidMeshOutput("Model worker returned invalid JSON") from exc
        if not isinstance(response, dict):
            raise InvalidMeshOutput("Model worker returned an invalid response")
        if response.get("ok") is not True:
            if response.get("error") == "invalid_camera_or_output":
                raise InvalidCameraInput("Camera or model output is invalid")
            raise InferenceUnavailable("Model inference failed")
        return response

    def ready(self):
        with self._admission():
            return self._request({"operation": "ready"}).get("ready") is True

    def infer(self, image_path: Path, camera=None):
        with self._admission():
            payload = {"image_path": str(image_path)}
            if camera is not None:
                payload["camera"] = camera
            response = self._request(payload)
            return validate_mesh(response.get("mesh"))

    def _stop(self):
        if self._process is not None and self._process.poll() is None:
            self._process.kill()
            self._process.wait(timeout=5)
        self._process = None
        self._responses = None


worker = ModelWorker()


def infer_image(data: bytes, image_format: str, camera=None):
    """Give the worker only a validated, short-lived local image file."""
    extension = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}[image_format]
    with tempfile.TemporaryDirectory(prefix="reconstruct-") as folder:
        image_path = Path(folder) / f"input.{extension}"
        image_path.write_bytes(data)
        return worker.infer(image_path, camera)


@router.post("/infer")
async def infer_reconstruction(
    image: UploadFile = File(...),
    camera: str | None = Form(default=None),
    _user: dict[str, str] = Depends(verified_user),
):
    """Revalidate input and return only genuine final-stage model coordinates."""
    try:
        data, metadata = await read_validated_image(image)
    finally:
        await image.close()
    camera_data = None
    if camera is not None:
        try:
            camera_data = json.loads(camera)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Camera must be valid JSON.") from exc
        if not isinstance(camera_data, dict):
            raise HTTPException(status_code=422, detail="Camera must be an object.")
    try:
        if camera_data is None:
            return await run_in_threadpool(infer_image, data, metadata["format"])
        return await run_in_threadpool(infer_image, data, metadata["format"], camera_data)
    except InvalidCameraInput as exc:
        raise HTTPException(status_code=422, detail="A valid calibrated 224x224 camera is required.") from exc
    except InferenceUnavailable as exc:
        raise HTTPException(status_code=503, detail="Model inference is unavailable. Try again shortly.") from exc
    except InvalidMeshOutput as exc:
        raise HTTPException(status_code=502, detail="The model returned an invalid mesh.") from exc
