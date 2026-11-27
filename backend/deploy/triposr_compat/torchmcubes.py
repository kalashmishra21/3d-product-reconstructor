"""CPU marching-cubes API shim used by the pinned TripoSR extraction code."""

import numpy as np
import torch
from skimage.measure import marching_cubes as _marching_cubes


def marching_cubes(volume, isovalue=0.0):
    values = volume.detach().cpu().numpy() if torch.is_tensor(volume) else np.asarray(volume)
    vertices, faces, _, _ = _marching_cubes(
        values,
        level=float(isovalue),
        spacing=(1.0, 1.0, 1.0),
        gradient_direction="descent",
        allow_degenerate=False,
    )
    # Matches the verified Colab adapter: the upstream helper reverses XYZ.
    faces = faces[:, [0, 2, 1]]
    return (
        torch.from_numpy(vertices[:, ::-1].copy().astype(np.float32)),
        torch.from_numpy(faces.astype(np.int64)),
    )
