"""HTTP entrypoint for the reconstruction application."""

from fastapi import FastAPI


app = FastAPI(title="3D Reconstruction API")


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    """Report that the API process is serving requests."""
    return {"status": "ok", "service": "3d-reconstruction-api"}
