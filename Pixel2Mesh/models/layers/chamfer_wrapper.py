import torch
import torch.nn as nn

try:
    import chamfer
    HAS_CUDA_CHAMFER = True
except ImportError:
    chamfer = None
    HAS_CUDA_CHAMFER = False


class ChamferDist(nn.Module):
    """
    Uses the original CUDA Chamfer extension when available.
    Falls back to native PyTorch cdist on CPU for local smoke tests.
    """

    def __init__(self):
        super().__init__()

    def forward(self, input1, input2):
        if HAS_CUDA_CHAMFER and input1.is_cuda and input2.is_cuda:
            return self._cuda_forward(input1, input2)

        distances = torch.cdist(input1, input2, p=2).pow(2)
        dist1, idx1 = distances.min(dim=2)
        dist2, idx2 = distances.min(dim=1)

        return dist1, dist2, idx1, idx2

    @staticmethod
    def _cuda_forward(xyz1, xyz2):
        batchsize, n, _ = xyz1.size()
        _, m, _ = xyz2.size()

        dist1 = torch.zeros(batchsize, n, device=xyz1.device)
        dist2 = torch.zeros(batchsize, m, device=xyz1.device)
        idx1 = torch.zeros(batchsize, n, dtype=torch.int32, device=xyz1.device)
        idx2 = torch.zeros(batchsize, m, dtype=torch.int32, device=xyz1.device)

        chamfer.forward(xyz1, xyz2, dist1, dist2, idx1, idx2)
        return dist1, dist2, idx1, idx2
