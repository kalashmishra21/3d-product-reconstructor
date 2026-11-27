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


def test_modal_defaults_to_cpu_and_has_bounded_scale_to_zero_configuration():
    source = (DEPLOY / "modal_app.py").read_text(encoding="utf-8")
    assert 'DEVICE = "cuda" if GPU_TYPE else "cpu"' in source
    assert 'max_containers=1' in source
    assert 'min_containers=0' in source
    assert 'scaledown_window=60' in source
    assert 'PIXEL3MESH_CHECKPOINT' in source
    assert 'pixel3mesh-api' in source


def test_cpu_and_gpu_runtime_dependencies_match_the_frozen_bundle():
    cpu_requirements = (DEPLOY / "requirements-cpu.txt").read_text(encoding="utf-8")
    gpu_requirements = (DEPLOY / "requirements-gpu.txt").read_text(encoding="utf-8")
    assert "torch==2.15.0+cpu" in cpu_requirements
    assert "torchvision==0.29.2+cpu" in cpu_requirements
    assert "torch==2.14.1+cu130" in gpu_requirements
    assert "torchvision==0.29.1+cu130" in gpu_requirements
