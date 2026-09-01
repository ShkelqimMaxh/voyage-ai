from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert "llm" in body


def test_health_does_not_leak_keys():
    blob = client.get("/health").text.lower()
    assert "aiza" not in blob
    assert "sk-ant-" not in blob
    assert "gemini_api_key" not in blob
    assert "api_key" not in blob


def test_root_does_not_500():
    response = client.get("/")
    assert response.status_code == 200
