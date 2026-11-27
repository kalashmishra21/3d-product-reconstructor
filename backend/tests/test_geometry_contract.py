"""Synthetic contract fixtures; these tests do not claim model inference."""
import pytest
from app.geometry_contract import validate_reconstruction
from app.model_readiness import SELECTED_SHA256, selected_model_status
from app.inference import ModelWorker, InferenceUnavailable


def fixture_result():
    return dict(schema_version=2, status='complete', model='Pixel3Mesh',
                model_version=SELECTED_SHA256, output_type='point_cloud_and_visible_surface',
                global_points=[[0., 0., 0.] for _ in range(2048)],
                vertices=[[0.,0.,0.],[1.,0.,0.],[0.,1.,0.]], faces=[[0,1,2]],
                vertices_count=3, faces_count=1, latency_ms=1.)


def test_variable_surface_validates():
    assert validate_reconstruction(fixture_result())['vertices_count'] == 3


@pytest.mark.parametrize('damage', [
    lambda x: x['vertices'][0].__setitem__(0, float('nan')),
    lambda x: x['faces'][0].__setitem__(2, 99),
    lambda x: x['vertices'].__setitem__(2, [2.,0.,0.]),
    lambda x: x['faces'].append([2,1,0]),
    lambda x: x.update(model_version='wrong'),
    lambda x: x['global_points'].pop(),
])
def test_invalid_geometry_rejected(damage):
    result = fixture_result()
    damage(result)
    with pytest.raises(ValueError):
        validate_reconstruction(result)


def test_wrong_checkpoint_fails_before_deserialization(tmp_path, monkeypatch):
    checkpoint = tmp_path / 'weights.pt'
    checkpoint.write_bytes(b'not trusted weights')
    monkeypatch.setenv('PIXEL3MESH_CHECKPOINT', str(checkpoint))
    assert selected_model_status()['reason'] == 'checkpoint_hash_mismatch'


def test_no_implicit_historical_model(monkeypatch):
    monkeypatch.delenv('RECONSTRUCTION_ENGINE', raising=False)
    with pytest.raises(InferenceUnavailable):
        ModelWorker()._start()


def test_busy_worker_rejects_without_waiting():
    worker = ModelWorker()
    worker._lock.acquire()
    try:
        with pytest.raises(InferenceUnavailable, match='busy'):
            worker.infer('unused')
    finally:
        worker._lock.release()
