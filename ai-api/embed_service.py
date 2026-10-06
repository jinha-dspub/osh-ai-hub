"""Loopback embedding service for the KOSHA GUIDE search: Qwen3-Embedding-4B on CPU.

    local_asset/venv-embed/bin/uvicorn embed_service:app --host 127.0.0.1 --port 8104

Runs in its own virtual environment (torch + transformers + sentence-transformers; the gateway's
venv keeps its pinned torch for the lanyard detector) and reads the model from the handoff
bundle on the NAS (HF cache layout, revision 5cf2132…, offline). The package's chunk vectors
were made with this revision, last-token pooling and L2 normalisation, so a query vector from
here can be compared with them directly. CPU only: both GPUs are held by another team's vLLM.

Endpoints (loopback only, no auth, no data stored):
    GET  /health                      -> {"status": "ok", "model": ..., "revision": ..., "device": ...}
    POST /embed {"texts": [...], "kind": "query"|"document"}  -> {"vectors": [[...], ...]}
"""

import os
import threading
import time

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

MODEL = "Qwen/Qwen3-Embedding-4B"
REVISION = "5cf2132abc99cad020ac570b19d031efec650f2b"
QUERY_PROMPT = (
    "Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery: "
)
MAX_TEXTS = 32
MAX_CHARS = 6000

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
_lock = threading.Lock()
_model = None
_state = {"status": "loading", "device": None, "loaded_in": None, "error": None}


class Embed(BaseModel):
    model_config = ConfigDict(extra="forbid")
    texts: list[str] = Field(min_length=1, max_length=MAX_TEXTS)
    kind: str = Field(default="query", pattern=r"^(query|document)$")


def load():
    global _model
    import torch
    from sentence_transformers import SentenceTransformer

    t = time.time()
    torch.set_num_threads(int(os.environ.get("EMBED_THREADS", "16")))
    device = (
        "cuda" if os.environ.get("EMBED_DEVICE") == "cuda" and torch.cuda.is_available() else "cpu"
    )
    try:
        model = SentenceTransformer(
            MODEL, revision=REVISION, device=device, model_kwargs={"dtype": torch.bfloat16}
        )
        model.encode(["준비"], normalize_embeddings=True)  # first call is slow; take it now
    except Exception as error:  # noqa: BLE001 - reported through /health
        _state.update(status="failed", error=f"{type(error).__name__}: {error}"[:300])
        return
    with _lock:
        _model = model
    _state.update(status="ok", device=device, loaded_in=round(time.time() - t, 1))


@app.on_event("startup")
def startup():
    threading.Thread(target=load, daemon=True).start()


@app.get("/health")
def health():
    return {**_state, "model": MODEL, "revision": REVISION}


@app.post("/embed")
def embed(body: Embed):
    if _model is None:
        raise HTTPException(503, _state.get("error") or "model loading")
    if any(len(t) > MAX_CHARS or not t.strip() for t in body.texts):
        raise HTTPException(422, "each text must be 1-6000 characters")
    with _lock:
        vectors = _model.encode(
            body.texts,
            batch_size=8,
            normalize_embeddings=True,
            convert_to_numpy=True,
            **({"prompt": QUERY_PROMPT} if body.kind == "query" else {}),
        )
    return {"vectors": [[round(float(x), 6) for x in v] for v in vectors]}
