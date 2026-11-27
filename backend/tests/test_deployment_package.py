import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEPLOY = ROOT / "backend" / "deploy"
EXPECTED_SHA = "ea861cc8f2120d80a8509b2581949445ca8aa73e1d274ba2882ed37e770f3500"


def test_deployment_manifest_pins_the_selected_model_without_committing_weights():
    manifest = json.loads((DEPLOY / "model_manifest.json").read_text(encoding="utf-8"))
    assert manifest["checkpoint_sha256"] == EXPECTED_SHA
    assert manifest["model_version"] == EXPECTED_SHA
    assert not (DEPLOY / "best_model.pt").exists()


def test_modal_uses_triposr_and_has_bounded_scale_to_zero_configuration():
    source = (DEPLOY / "modal_app.py").read_text(encoding="utf-8")
    assert 'APP_NAME = "pixel3mesh-triposr"' in source
    assert 'gpu=GPU' in source
    assert 'CHECKPOINT_SHA256 = "429e2c6b22a0923967459de24d67f05962b235f79cde6b032aa7ed2ffcd970ee"' in source
    assert 'max_containers=1' in source
    assert 'min_containers=0' in source
    assert 'scaledown_window=60' in source
    assert 'TRIPOSR_CHECKPOINT_SHA256' in source
    assert 'pixel3mesh-triposr-api' in source
    assert 'concurrent(max_inputs=1)' in source
    assert 'triposr_compat' in source


def test_modal_runtime_pins_verified_triposr_environment():
    requirements = (DEPLOY / "requirements-modal-triposr.txt").read_text(encoding="utf-8")
    for pin in (
        "torch==2.1.2", "torchvision==0.16.2", "transformers==4.35.0",
        "numpy==1.26.4", "scikit-image==0.24.0", "trimesh==4.0.5",
        "rembg==2.0.69", "onnxruntime==1.23.2",
    ):
        assert pin in requirements


def test_cpu_and_gpu_runtime_dependencies_match_the_frozen_bundle():
    requirements = (DEPLOY / "requirements-modal-triposr.txt").read_text(encoding="utf-8")
    assert "torch==2.1.2" in requirements
    assert "torchvision==0.16.2" in requirements
    assert "transformers==4.35.0" in requirements
    assert "scikit-image==0.24.0" in requirements
