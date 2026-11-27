"""Verify artifact identity without deserializing untrusted model files."""
import hashlib
import os
from functools import lru_cache
from pathlib import Path

SELECTED_SHA256 = 'ea861cc8f2120d80a8509b2581949445ca8aa73e1d274ba2882ed37e770f3500'


@lru_cache(maxsize=4)
def checkpoint_digest(path: str, size: int, modified_ns: int) -> str:
    # The stat values invalidate cached hashes when a file changes.
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def selected_model_status() -> dict:
    result = {'ready': False, 'model': 'pixel3mesh-six-category',
              'checkpoint_sha256': SELECTED_SHA256}
    path = Path(os.environ.get('PIXEL3MESH_CHECKPOINT', ''))
    try:
        if not path.is_file():
            return {**result, 'reason': 'checkpoint_missing'}
        stat = path.stat()
        if checkpoint_digest(str(path.resolve()), stat.st_size, stat.st_mtime_ns) != SELECTED_SHA256:
            return {**result, 'reason': 'checkpoint_hash_mismatch'}
    except OSError:
        return {**result, 'reason': 'checkpoint_unreadable'}
    # Identity alone cannot establish architecture/preprocessing compatibility.
    return {**result, 'reason': 'inference_bundle_not_verified'}
