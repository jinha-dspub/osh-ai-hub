"""Service foundation; no fake inference is exposed as a working model."""

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.copd import router as copd_router

app = FastAPI(
    title="OSH AI API",
    version="0.1.0",
    description="Internal COPD exploration and image service foundation",
)
app.include_router(copd_router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "osh-ai-api", "inference_ready": False}


@app.get("/ready")
def ready():
    return JSONResponse(
        status_code=503,
        content={"status": "not_ready", "reason": "No verified model is configured"},
    )


@app.get("/models")
def models():
    return {"data": [], "notice": "No inference models are available yet"}


@app.post("/inference/v1/image")
def inference_unavailable():
    return JSONResponse(
        status_code=503,
        content={
            "success": False,
            "error": {"code": "MODEL_NOT_READY", "message": "No verified model is configured"},
        },
    )
