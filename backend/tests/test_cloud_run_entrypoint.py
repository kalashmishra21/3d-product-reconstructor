import hashlib
import json
import sys
import types

from backend.deploy import cloud_run_entrypoint


class FakeBlob:
    def __init__(self, payload):
        self.payload = payload
        self.size = len(payload)

    def reload(self):
        return None

    def download_to_filename(self, filename):
        with open(filename, "wb") as stream:
            stream.write(self.payload)


class FakeBucket:
    def __init__(self, objects):
        self.objects = objects

    def blob(self, name):
        return self.objects[name]


def install_storage_stub(monkeypatch, objects):
    storage = types.ModuleType("google.cloud.storage")
    storage.Client = lambda: types.SimpleNamespace(bucket=lambda _name: FakeBucket(objects))
    google = types.ModuleType("google")
    cloud = types.ModuleType("google.cloud")
    cloud.storage = storage
    google.cloud = cloud
    monkeypatch.setitem(sys.modules, "google", google)
    monkeypatch.setitem(sys.modules, "google.cloud", cloud)
    monkeypatch.setitem(sys.modules, "google.cloud.storage", storage)


def configure(monkeypatch, destination, digest):
    monkeypatch.setattr(cloud_run_entrypoint, "MODEL_DIRECTORY", destination)
    monkeypatch.setattr(cloud_run_entrypoint, "EXPECTED_CHECKPOINT_SHA256", digest)
    monkeypatch.setenv("PIXEL3MESH_MODEL_BUCKET", "private-model-bucket")
    monkeypatch.setenv("PIXEL3MESH_CHECKPOINT_OBJECT", "release/best_model.pt")
    monkeypatch.setenv("PIXEL3MESH_CONFIG_OBJECT", "release/inference_config.json")


def test_download_verifies_checkpoint_and_exports_runtime_configuration(monkeypatch, tmp_path):
    checkpoint = b"verified test checkpoint"
    config = json.dumps({"depth_min": 0.15, "depth_max": 1.9}).encode()
    configure(monkeypatch, tmp_path / "private-model", hashlib.sha256(checkpoint).hexdigest())
    install_storage_stub(monkeypatch, {
        "release/best_model.pt": FakeBlob(checkpoint),
        "release/inference_config.json": FakeBlob(config),
    })

    checkpoint_path, config_path = cloud_run_entrypoint.download_model_artifacts()

    assert checkpoint_path.read_bytes() == checkpoint
    assert json.loads(config_path.read_text()) == {"depth_min": 0.15, "depth_max": 1.9}
    assert cloud_run_entrypoint.os.environ["PIXEL3MESH_DEVICE"] == "cpu"
    assert cloud_run_entrypoint.os.environ["PIXEL3MESH_CHECKPOINT"] == str(checkpoint_path)


def test_download_rejects_checkpoint_with_wrong_identity(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path / "private-model", "0" * 64)
    install_storage_stub(monkeypatch, {
        "release/best_model.pt": FakeBlob(b"wrong checkpoint"),
        "release/inference_config.json": FakeBlob(b'{"depth_min":0.1,"depth_max":2.0}'),
    })

    try:
        cloud_run_entrypoint.download_model_artifacts()
    except RuntimeError as error:
        assert "SHA-256" in str(error)
    else:
        raise AssertionError("Mismatched checkpoint must fail startup")


def test_download_rejects_invalid_depth_configuration(monkeypatch, tmp_path):
    checkpoint = b"verified test checkpoint"
    configure(monkeypatch, tmp_path / "private-model", hashlib.sha256(checkpoint).hexdigest())
    install_storage_stub(monkeypatch, {
        "release/best_model.pt": FakeBlob(checkpoint),
        "release/inference_config.json": FakeBlob(b'{"depth_min":1.0,"depth_max":0.2}'),
    })

    try:
        cloud_run_entrypoint.download_model_artifacts()
    except RuntimeError as error:
        assert "depth range" in str(error)
    else:
        raise AssertionError("Invalid depth range must fail startup")
