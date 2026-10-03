"""Authenticated image checks before reconstruction work begins."""

from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from app.auth import verified_user


MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000
MIME_BY_FORMAT = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
SUPPORTED_MIME = frozenset(MIME_BY_FORMAT.values())

router = APIRouter(prefix="/api/v1/reconstructions", tags=["reconstructions"])


@router.post("/preflight")
async def preflight_image(
    image: UploadFile = File(...),
    user: dict[str, str] = Depends(verified_user),
) -> dict[str, str | int]:
    """Validate one bounded image and return metadata without storing its bytes."""
    try:
        if image.content_type not in SUPPORTED_MIME:
            raise HTTPException(status_code=415, detail="Supported image types are JPEG, PNG, and WebP.")

        data = await image.read(MAX_IMAGE_BYTES + 1)
        if not data:
            raise HTTPException(status_code=422, detail="The image is empty.")
        if len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="The image exceeds the 10 MB limit.")

        try:
            with Image.open(BytesIO(data)) as decoded:
                actual_format = decoded.format
                width, height = decoded.size
                if width < 1 or height < 1:
                    raise HTTPException(status_code=422, detail="Image dimensions are invalid.")
                if width * height > MAX_IMAGE_PIXELS:
                    raise HTTPException(status_code=413, detail="Image dimensions exceed the safe limit.")
                if actual_format not in MIME_BY_FORMAT or MIME_BY_FORMAT[actual_format] != image.content_type:
                    raise HTTPException(status_code=415, detail="Image content does not match its declared type.")
                if getattr(decoded, "n_frames", 1) > 1:
                    raise HTTPException(status_code=415, detail="Animated images are not supported.")
                decoded.load()
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
            raise HTTPException(status_code=422, detail="Unable to decode the image.") from exc

        filename = (image.filename or "image").replace("\\", "/").rsplit("/", 1)[-1][:255]
        return {
            "status": "ready",
            "filename": filename,
            "content_type": MIME_BY_FORMAT[actual_format],
            "format": actual_format,
            "width": width,
            "height": height,
            "size_bytes": len(data),
            "user_id": user["id"],
        }
    finally:
        await image.close()
