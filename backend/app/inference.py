"""Authenticated, bounded image-to-Stage-3 inference without ML imports in FastAPI."""

import json
import math
import os
import queue
import subprocess
import tempfile
import threading
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.auth import verified_user
from app.preflight import read_validated_image


ROOT = Path(__file__).resolve().parents[2]
P2M = ROOT / "Pixel2Mesh"
WORKER_SCRIPT = Path(__file__).with_name("ml_worker.py")
router = APIRouter(prefix="/api/v1/reconstructions", tags=["reconstructions"])


class InferenceUnavailable(Exception):
    """The local ML runtime or worker could not complete inference."""


class InvalidMeshOutput(Exception):
    """The worker response did not contain a valid final Stage-3 mesh."""


def validate_mesh(mesh):
    """Reject malformed, non-finite, or out-of-range worker output."""
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
        executable = os.getenv("P2M_PYTHON")
        if executable is None:
            executable = ROOT / ".venv-p2m" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        if not Path(executable).is_file():
            raise InferenceUnavailable("Pixel2Mesh Python environment is unavailable")
        try:
            self._process = subprocess.Popen(
                [str(executable), "-u", str(WORKER_SCRIPT)],
                cwd=P2M,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=None,
                text=True,
                encoding="utf-8",
            )
        except OSError as exc:
            raise InferenceUnavailable("Pixel2Mesh worker could not start") from exc
        self._responses = queue.Queue(maxsize=1)
        process = self._process
        responses = self._responses

        def read_responses():
            for line in process.stdout:
                responses.put(line)
            responses.put(None)

        threading.Thread(target=read_responses, daemon=True).start()

    def infer(self, image_path: Path):
        with self._lock:
            if self._process is None or self._process.poll() is not None:
                self._start()
            try:
                self._process.stdin.write(json.dumps({"image_path": str(image_path)}) + "\n")
                self._process.stdin.flush()
                line = self._responses.get(timeout=180)
            except (OSError, BrokenPipeError, queue.Empty) as exc:
                self._stop()
                raise InferenceUnavailable("Pixel2Mesh worker did not respond") from exc
            if line is None:
                self._stop()
                raise InferenceUnavailable("Pixel2Mesh worker exited unexpectedly")
            try:
                response = json.loads(line)
            except ValueError as exc:
                raise InvalidMeshOutput("Pixel2Mesh worker returned invalid JSON") from exc
            if not isinstance(response, dict):
                raise InvalidMeshOutput("Pixel2Mesh worker returned an invalid response")
            if response.get("ok") is not True:
                raise InferenceUnavailable("Pixel2Mesh inference failed")
            return validate_mesh(response.get("mesh"))

    def _stop(self):
        if self._process is not None and self._process.poll() is None:
            self._process.kill()
            self._process.wait(timeout=5)
        self._process = None
        self._responses = None


worker = ModelWorker()


def infer_image(data: bytes, image_format: str):
    """Give the worker only a validated, short-lived local image file."""
    extension = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}[image_format]
    with tempfile.TemporaryDirectory(prefix="reconstruct-") as folder:
        image_path = Path(folder) / f"input.{extension}"
        image_path.write_bytes(data)
        return worker.infer(image_path)


@router.post("/infer")
async def infer_reconstruction(
    image: UploadFile = File(...),
    _user: dict[str, str] = Depends(verified_user),
):
    """Revalidate input and return only genuine final-stage model coordinates."""
    try:
        data, metadata = await read_validated_image(image)
    finally:
        await image.close()
    try:
        return await run_in_threadpool(infer_image, data, metadata["format"])
    except InferenceUnavailable as exc:
        raise HTTPException(status_code=503, detail="Model inference is unavailable. Try again shortly.") from exc
    except InvalidMeshOutput as exc:
        raise HTTPException(status_code=502, detail="The model returned an invalid mesh.") from exc
