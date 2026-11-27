"""HTTP entrypoint for the reconstruction application."""

import os
import json
import logging
import time
from uuid import uuid4
from urllib.parse import urlsplit
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.model_readiness import selected_model_status

from app.auth import verified_user
from app.inference import InferenceUnavailable, InvalidMeshOutput, worker, router as inference_router
from app.preflight import router as preflight_router


app = FastAPI(title="3D Reconstruction API")
request_logger = logging.getLogger("pixel3mesh.requests")
origins = [value.strip() for value in os.getenv(
    'CORS_ORIGINS', 'https://3d-product-reconstructor.pages.dev'
).split(',') if value.strip()]
for origin in origins:
    parsed = urlsplit(origin)
    if parsed.scheme not in {'http', 'https'} or not parsed.hostname or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise ValueError('CORS_ORIGINS must contain explicit HTTP(S) origins')
app.add_middleware(CORSMiddleware, allow_origins=origins,
                   allow_credentials=False, allow_methods=['GET', 'POST'],
                   allow_headers=['Authorization', 'Content-Type', 'Cache-Control'])
app.include_router(preflight_router)
app.include_router(inference_router)


@app.middleware("http")
async def log_request_metrics(request, call_next):
    """Emit bounded structured request metrics without logging inputs or credentials."""
    request_id = str(uuid4())
    started = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        request_logger.log(
            logging.INFO if status_code < 500 else logging.ERROR,
            json.dumps({
                "event": "http_request_complete",
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": status_code,
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
            }, separators=(",", ":")),
        )


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    """Report that the API process is serving requests."""
    return {"status": "ok", "service": "3d-reconstruction-api"}


@app.get("/api/v1/me")
def me(user: dict[str, str] = Depends(verified_user)) -> dict[str, str]:
    """Return identity from a verified Supabase access token."""
    return user


@app.get('/api/v1/readiness')
def readiness():
    status = selected_model_status()
    if status.get('reason') != 'inference_bundle_not_verified':
        return JSONResponse(status, status_code=503)
    try:
        if worker.ready():
            return JSONResponse({**status, 'ready': True, 'reason': None,
                                 'output_type': 'point_cloud_and_visible_surface',
                                 'calibrated_camera_required': True})
    except (InferenceUnavailable, InvalidMeshOutput):
        pass
    return JSONResponse({**status, 'reason': 'model_initialization_failed'}, status_code=503)
