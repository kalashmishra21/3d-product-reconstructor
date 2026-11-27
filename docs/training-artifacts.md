# Pixel3Mesh training artifacts

This index records retained training work; the current application does not load either research model for live inference.

| Artifact | Verified location | Notes |
| --- | --- | --- |
| Original Pixel2Mesh model and graph layers | `Pixel2Mesh/models/` | Original VGG16/GraphCNN research implementation. |
| Pixel2Mesh training loop | `Pixel2Mesh/functions/trainer.py`, `Pixel2Mesh/entrypoint_train.py` | Preserved source; no training run was started for this application task. |
| Pixel2Mesh reconstruction loss | `Pixel2Mesh/models/losses/p2m.py` | Historical research loss. |
| Pixel2Mesh dataset preparation utility | `dataset_tools/prepare_pixel2mesh_subset.py` | Research utility; left unchanged. |
| Pixel2Mesh checkpoint path specified by repository instructions | `Pixel2Mesh/checkpoints/260000_000010.pt` | Not present in either inspected worktree at this location. The directory is Git-ignored; no checkpoint was recreated or moved. |
| Six-category custom research bundle | `MyDrive/Pixel3Mesh_SixCategory_FINAL_20261126/` | Original Google Drive path from the verified handoff; Drive was not mounted in this session. |
| Six-category checkpoint SHA-256 | `ea861cc8f2120d80a8509b2581949445ca8aa73e1d274ba2882ed37e770f3500` | Retained custom model identity; not loaded by the API-only service. |
| Local private bundle cache | `C:\Users\kalas\Desktop\Pixel3Mesh-backend-integration\.review\frozen_bundle\` | Ignored local review cache. Contains `best_model.pt`, inference configuration and scripts; it was not changed. |
| Colab research notebook | `https://colab.research.google.com/drive/1XtkaL2RYRg2w6UDRNkN6VbWaulomNAYT` | Historical training/evaluation notebook; not edited or run for training. |

Training sources, checkpoints, logs, datasets and experiment history were not deleted, replaced, or committed during the API/UI work. The original project worktree was left untouched.
