"""Public liveness must not imply that a reconstruction model is usable."""
from fastapi.testclient import TestClient
from app.main import app


def test_readiness_fails_closed_without_selected_bundle(monkeypatch):
    monkeypatch.delenv('PIXEL3MESH_CHECKPOINT', raising=False)
    response = TestClient(app).get('/api/v1/readiness')
    assert response.status_code == 503
    assert response.json()['ready'] is False
    assert 'checkpoint_missing' in response.json()['reason']


def test_production_cors_allows_only_configured_frontend():
    client = TestClient(app)
    headers = {'Origin': 'https://3d-product-reconstructor.pages.dev',
               'Access-Control-Request-Method': 'POST',
               'Access-Control-Request-Headers': 'authorization,content-type'}
    response = client.options('/api/v1/reconstruct', headers=headers)
    assert response.status_code == 200
    assert response.headers['access-control-allow-origin'] == headers['Origin']
    headers['Origin'] = 'https://untrusted.example'
    assert 'access-control-allow-origin' not in client.options('/api/v1/reconstruct', headers=headers).headers
