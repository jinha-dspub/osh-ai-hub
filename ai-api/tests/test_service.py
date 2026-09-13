from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_liveness_does_not_claim_inference_readiness():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["inference_ready"] is False
    assert client.get("/ready").status_code == 503


def test_no_fake_models_or_predictions():
    assert client.get("/models").json()["data"] == []
    response = client.post("/inference/v1/image")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "MODEL_NOT_READY"
