import json
import logging

from fastapi.testclient import TestClient

from app.main import app


def test_request_metrics_include_id_and_never_log_query_values(caplog):
    caplog.set_level(logging.INFO, logger="pixel3mesh.requests")
    response = TestClient(app).get("/api/v1/health?access_token=do-not-log")

    assert response.status_code == 200
    assert response.headers.get("X-Request-ID")
    events = [json.loads(record.message) for record in caplog.records
              if record.name == "pixel3mesh.requests"]
    assert len(events) == 1
    assert events[0]["event"] == "http_request_complete"
    assert events[0]["status_code"] == 200
    assert events[0]["duration_ms"] >= 0
    assert "access_token" not in caplog.text
    assert "do-not-log" not in caplog.text
