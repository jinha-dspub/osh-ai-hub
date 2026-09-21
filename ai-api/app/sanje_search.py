"""Local dense retrieval + Korean character BM25, scoped to filtered release rows."""

import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path

import numpy as np
from fastapi import HTTPException

from app import copd

MODEL = "embeddinggemma:latest"
DIGEST = "85462619ee721b466c5927d109d4cb765861907d5417b9109caebc4e614679f1"
DIMENSIONS = 768
RECIPE = "occupation-hazards-summary-700-v1"
LIMIT = 200
STOP = {
    "사례",
    "찾아",
    "찾아줘",
    "찾아주세요",
    "알려줘",
    "알려주세요",
    "관련",
    "어떤",
    "있나요",
    "있는",
    "대한",
    "하는",
    "해서",
}


def document(row):
    content = " ".join(
        row.get(k, "") for k in ("raw_occupation", "ai_occupation_std", "ai_hazards", "ai_summary")
    )
    return "title: 산재 판정사례 | text: " + content[:700]


def terms(text):
    result = []
    for word in re.findall(r"[가-힣]+|[a-z0-9]+", text.lower()):
        if word in STOP:
            continue
        result.append(word)
        if re.fullmatch(r"[가-힣]+", word) and len(word) > 2:
            result.extend(word[i : i + 2] for i in range(len(word) - 1))
    return result


@lru_cache(maxsize=256)
def query_vector(query, digest):
    if digest != DIGEST:
        raise HTTPException(503, "검색 모델 버전을 확인 중입니다. 키워드 검색을 이용해 주세요.")
    if not copd.MODEL_LOCK.acquire(blocking=False):
        raise HTTPException(429, "다른 AI 요청을 처리 중입니다. 잠시 후 다시 시도해 주세요.")
    try:
        import urllib.request

        with urllib.request.urlopen(copd.OLLAMA + "/api/tags", timeout=10) as response:
            models = json.load(response)["models"]
        if not any(m["name"] == MODEL and m["digest"] == digest for m in models):
            raise ValueError("Model revision mismatch")
        copd.spend()
        response = copd.post_json(
            copd.OLLAMA + "/api/embed",
            {
                "model": MODEL,
                "input": ["task: search result | query: " + query],
                "truncate": False,
                "keep_alive": "5m",
                "options": {"num_thread": 4, "num_gpu": 0, "num_ctx": 2048, "num_batch": 2048},
            },
        )
        vector = np.asarray(response["embeddings"][0], dtype=np.float32)
        if (
            vector.shape != (DIMENSIONS,)
            or not np.isfinite(vector).all()
            or np.linalg.norm(vector) == 0
        ):
            raise ValueError("Invalid query vector")
        return vector / np.linalg.norm(vector)
    except HTTPException:
        raise
    except (OSError, ValueError, KeyError, TypeError, IndexError):
        raise HTTPException(
            503, "자연어 검색 모델에 연결하지 못했습니다. 키워드 검색을 이용해 주세요."
        ) from None
    finally:
        copd.MODEL_LOCK.release()


class HybridIndex:
    def __init__(self, data, folder):
        folder = Path(folder) / data.group
        meta = json.loads((folder / "manifest.json").read_text())
        expected = {
            "version": data.summary["version"],
            "group": data.group,
            "cases_sha256": data.fingerprint,
            "model": MODEL,
            "digest": DIGEST,
            "dimensions": DIMENSIONS,
            "recipe": RECIPE,
        }
        if any(meta.get(k) != v for k, v in expected.items()):
            raise ValueError("Stale search index")
        for name in ("vectors.npy", "ids.json"):
            with (folder / name).open("rb") as stream:
                if hashlib.file_digest(stream, "sha256").hexdigest() != meta["sha256"][name]:
                    raise ValueError("Search index checksum mismatch")
        ids = json.loads((folder / "ids.json").read_text())
        if ids != [r["accnum"] for r in data.rows]:
            raise ValueError("Search row mapping mismatch")
        self.vectors = np.load(folder / "vectors.npy", mmap_mode="r", allow_pickle=False)
        if self.vectors.shape != (len(ids), DIMENSIONS) or not np.isfinite(self.vectors).all():
            raise ValueError("Invalid search vectors")
        if not np.allclose(np.linalg.norm(self.vectors, axis=1), 1, atol=1e-4):
            raise ValueError("Unnormalized vectors")
        self.postings = defaultdict(list)
        lengths = []
        for i, row in enumerate(data.rows):
            tokens = terms(document(row).split(" | text: ", 1)[1])
            lengths.append(len(tokens))
            for token, count in Counter(tokens).items():
                self.postings[token].append((i, count))
        self.lengths = np.asarray(lengths, dtype=np.float32)
        self.average = max(float(self.lengths.mean()), 1)
        self.size = len(ids)

    def rank(self, query, candidates, embedder=None):
        vector = (embedder or query_vector)(query, DIGEST)
        vector = np.asarray(vector, dtype=np.float32)
        if (
            vector.shape != (DIMENSIONS,)
            or not np.isfinite(vector).all()
            or np.linalg.norm(vector) == 0
        ):
            raise ValueError("Invalid vector")
        vector = vector / np.linalg.norm(vector)
        scores = self.vectors[candidates] @ vector
        dense = sorted(
            zip(candidates, scores.tolist(), strict=True), key=lambda pair: (-pair[1], pair[0])
        )[:LIMIT]
        allowed = set(candidates)
        lexical = defaultdict(float)
        for token in set(terms(query)):
            postings = self.postings.get(token, [])
            idf = math.log(1 + (self.size - len(postings) + 0.5) / (len(postings) + 0.5))
            for i, count in postings:
                if i in allowed:
                    lexical[i] += (
                        idf
                        * count
                        * 2.2
                        / (count + 1.2 * (0.25 + 0.75 * self.lengths[i] / self.average))
                    )
        sparse = sorted(lexical, key=lambda i: (-lexical[i], i))[:LIMIT]
        fused = defaultdict(float)
        for ranking in ([i for i, _ in dense], sparse):
            for rank, i in enumerate(ranking, 1):
                fused[i] += 1 / (60 + rank)
        return sorted(fused, key=lambda i: (-fused[i], i))[:LIMIT]


def load(data):
    if not hasattr(data, "hybrid_lock"):
        # Created once by Dataset.__init__; retained for explicit fixture errors.
        raise ValueError("Search lock missing")
    with data.hybrid_lock:
        if data.hybrid_index is None:
            from app.sanje import release

            folder = release().get("search_index")
            if not folder:
                raise ValueError("Search index not configured")
            data.hybrid_index = HybridIndex(data, folder)
        return data.hybrid_index
