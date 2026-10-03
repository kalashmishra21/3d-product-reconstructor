"""HTTP entrypoint for the reconstruction application."""

from fastapi import Depends, FastAPI

from app.auth import verified_user


app = FastAPI(title="3D Reconstruction API")


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    """Report that the API process is serving requests."""
    return {"status": "ok", "service": "3d-reconstruction-api"}


@app.get("/api/v1/me")
def me(user: dict[str, str] = Depends(verified_user)) -> dict[str, str]:
    """Return identity from a verified Supabase access token."""
    return user
