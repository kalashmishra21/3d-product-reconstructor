"""Authenticated single-image TripoSR route with a lazy isolated worker."""

from __future__ import annotations

import json
import math
import os
import queue
import subprocess
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from urllib.parse import urlsplit
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.auth import verified_user
from app.preflight import read_validated_image


router = APIRouter(prefix="/api/v1/triposr", tags=["TripoSR"])
WORKER_SCRIPT = Path(__file__).with_name("triposr_worker.py")
EXPECTED_SHA256 = "429e2c6b22a0923967459de24d67f05962b235f79cde6b032aa7ed2ffcd970ee"


class TripoSRUnavailable(RuntimeError):
    pass


class TripoSRWorker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._process = None
        self._responses: queue.Queue[str | None] | None = None

    def _start(self) -> None:
        root = Path(os.environ.get("TRIPOSR_ROOT", ""))
        python = os.environ.get("TRIPOSR_PYTHON", "")
        if not root.is_dir() or not python or not Path(python).is_file():
            raise TripoSRUnavailable("TripoSR runtime is not configured")
        if os.environ.get("TRIPOSR_CHECKPOINT_SHA256", "") != EXPECTED_SHA256:
            raise TripoSRUnavailable("TripoSR checkpoint identity is not configured")
        # The model subprocess receives runtime paths and CUDA library settings
        # only; API/Supabase secrets are deliberately not inherited.
        env = {
            key: os.environ[key]
            for key in ("PATH", "LD_LIBRARY_PATH", "CUDA_VISIBLE_DEVICES", "HOME", "LANG", "OMP_NUM_THREADS")
            if key in os.environ
        }
        env["TRIPOSR_ROOT"] = str(root.resolve())
        env["TRIPOSR_CHECKPOINT_SHA256"] = EXPECTED_SHA256
        env.setdefault("TRIPOSR_DEVICE", "cuda")
        env.setdefault("TRIPOSR_RESOLUTION", "256")
        self._process = subprocess.Popen(
            [python, "-u", str(WORKER_SCRIPT)],
            cwd=root,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=None,
            text=True,
            encoding="utf-8",
        )
        self._responses = queue.Queue(maxsize=1)
        process, responses = self._process, self._responses

        def collect() -> None:
            assert process.stdout is not None
            for response in process.stdout:
                responses.put(response)
            responses.put(None)

        threading.Thread(target=collect, daemon=True).start()

    def _remote_request(self, operation: str, image: bytes | None = None) -> dict:
        base_url = os.environ.get("TRIPOSR_REMOTE_URL", "").strip().rstrip("/")
        token = os.environ.get("TRIPOSR_REMOTE_TOKEN", "")
        parsed = urlsplit(base_url)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or
                parsed.path or parsed.query or parsed.fragment or len(token) < 32):
            raise TripoSRUnavailable("Secure remote TripoSR worker is not configured")
        endpoint = base_url + ("/ready" if operation == "ready" else "/infer")
        request = urllib.request.Request(
            endpoint,
            data=image,
            method="GET" if operation == "ready" else "POST",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
                **({"Content-Type": "application/octet-stream"} if image is not None else {}),
            },
        )
        class RejectRedirects(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *_args, **_kwargs):
                return None

        try:
            opener = urllib.request.build_opener(RejectRedirects)
            with opener.open(request, timeout=240) as response:
                if urlsplit(response.geturl()).netloc != parsed.netloc:
                    raise TripoSRUnavailable("Remote worker redirected to another host")
                body = response.read(64 * 1024 * 1024 + 1)
                if len(body) > 64 * 1024 * 1024:
                    raise TripoSRUnavailable("Remote TripoSR response exceeded the size limit")
                result = json.loads(body)
        except (OSError, urllib.error.URLError, TimeoutError, ValueError) as exc:
            raise TripoSRUnavailable("Remote TripoSR worker did not respond") from exc
        if not isinstance(result, dict) or result.get("ok") is not True:
            raise TripoSRUnavailable("Remote TripoSR worker returned an invalid response")
        return result

    @staticmethod
    def _validate_prediction(prediction: object) -> dict:
        if not isinstance(prediction, dict):
            raise TripoSRUnavailable("TripoSR returned an invalid prediction")
        vertices = prediction.get("vertices")
        faces = prediction.get("faces")
        colors = prediction.get("vertex_colors")
        if (prediction.get("schema_version") != 3 or prediction.get("model") != "TripoSR" or
                prediction.get("engine") != "stabilityai/TripoSR" or
                prediction.get("model_version") != EXPECTED_SHA256 or
                not isinstance(vertices, list) or not isinstance(faces, list) or
                not isinstance(colors, list) or len(vertices) < 3 or len(vertices) > 1_000_000 or
                len(faces) < 1 or len(faces) > 2_000_000 or len(colors) != len(vertices) or
                prediction.get("vertices_count") != len(vertices) or prediction.get("faces_count") != len(faces) or
                not isinstance(prediction.get("latency_ms"), (int, float)) or
                not math.isfinite(prediction["latency_ms"]) or prediction["latency_ms"] < 0 or
                not isinstance(prediction.get("resolution"), int) or not 64 <= prediction["resolution"] <= 512):
            raise TripoSRUnavailable("TripoSR returned incompatible mesh metadata")
        try:
            for vertex, color in zip(vertices, colors, strict=True):
                if (not isinstance(vertex, list) or len(vertex) != 3 or
                        not all(isinstance(value, (int, float)) and math.isfinite(value) and abs(value) < 100 for value in vertex) or
                        not isinstance(color, list) or len(color) not in (3, 4) or
                        not all(isinstance(value, int) and 0 <= value <= 255 for value in color) or
                        prediction.get("model_init_ms", 0) < 0):
                    raise ValueError
            for face in faces:
                if (not isinstance(face, list) or len(face) != 3 or len(set(face)) != 3 or
                        not all(isinstance(index, int) and 0 <= index < len(vertices) for index in face)):
                    raise ValueError
        except (TypeError, ValueError):
            raise TripoSRUnavailable("TripoSR returned invalid mesh geometry") from None
        return prediction

    def _request(self, payload: dict, timeout: float = 240) -> dict:
        if self._process is None or self._process.poll() is not None:
            self._start()
        assert self._process is not None and self._process.stdin is not None and self._responses is not None
        try:
            self._process.stdin.write(json.dumps(payload) + "\n")
            self._process.stdin.flush()
            line = self._responses.get(timeout=timeout)
        except (OSError, queue.Empty) as exc:
            self._stop()
            raise TripoSRUnavailable("TripoSR worker did not respond") from exc
        if line is None:
            self._stop()
            raise TripoSRUnavailable("TripoSR worker exited")
        try:
            response = json.loads(line)
        except ValueError as exc:
            self._stop()
            raise TripoSRUnavailable("TripoSR worker returned invalid JSON") from exc
        if response.get("ok") is not True:
            raise TripoSRUnavailable("TripoSR initialization or inference failed")
        return response

    def ready(self) -> dict:
        if not self._lock.acquire(blocking=False):
            raise TripoSRUnavailable("TripoSR worker is busy")
        try:
            if os.environ.get("TRIPOSR_REMOTE_URL"):
                result = self._remote_request("ready")
                if (result.get("ready") is not True or result.get("checkpoint_sha256") != EXPECTED_SHA256 or
                        result.get("model") != "TripoSR"):
                    raise TripoSRUnavailable("Remote TripoSR worker is not ready for this model")
                return result
            return self._request({"operation": "ready"})
        finally:
            self._lock.release()

    def infer(self, path: Path) -> dict:
        if not self._lock.acquire(blocking=False):
            raise TripoSRUnavailable("TripoSR worker is busy")
        try:
            if os.environ.get("TRIPOSR_REMOTE_URL"):
                result = self._remote_request("infer", path.read_bytes())
                return self._validate_prediction(result.get("prediction"))
            return self._validate_prediction(self._request({"image_path": str(path)})["prediction"])
        finally:
            self._lock.release()

    def _stop(self) -> None:
        if self._process is not None and self._process.poll() is None:
            self._process.kill()
            self._process.wait(timeout=5)
        self._process = None
        self._responses = None


worker = TripoSRWorker()


@router.get("/readiness")
def readiness(user: dict[str, str] = Depends(verified_user)) -> dict:
    try:
        return worker.ready()
    except TripoSRUnavailable as exc:
        raise HTTPException(status_code=503, detail="TripoSR inference is unavailable.") from exc


@router.post("/reconstruct")
async def reconstruct(
    image: UploadFile = File(...),
    _user: dict[str, str] = Depends(verified_user),
) -> dict:
    try:
        data, metadata = await read_validated_image(image)
    finally:
        await image.close()
    suffix = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}[metadata["format"]]
    try:
        with tempfile.TemporaryDirectory(prefix="triposr-") as folder:
            source = Path(folder) / ("input" + suffix)
            source.write_bytes(data)
            return await run_in_threadpool(worker.infer, source)
    except TripoSRUnavailable as exc:
        raise HTTPException(status_code=503, detail="TripoSR inference is unavailable.") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="TripoSR could not produce a valid mesh.") from exc
