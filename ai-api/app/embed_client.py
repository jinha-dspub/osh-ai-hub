"""Client for the loopback embedding service (embed_service.py, port 8104).

The gateway asks it for query vectors only; chunk vectors come from the package. If the service
is down or slow the caller falls back to keyword search and says so, so a search never fails
because of the model.
"""

import json
import os
import threading
import urllib.error
import urllib.request
from collections import OrderedDict

import numpy as np

URL = os.environ.get("KOSHA_EMBED_URL", "http://127.0.0.1:8104")
TIMEOUT = float(os.environ.get("KOSHA_EMBED_TIMEOUT", "15"))
DIMENSION = 2560
_cache: OrderedDict[str, np.ndarray] = OrderedDict()
_lock = threading.Lock()
CACHE = 512


def enabled():
    return URL.lower() not in ("", "off", "0")


def health():
    if not enabled():
        return {"status": "off"}
    try:
        with urllib.request.urlopen(URL + "/health", timeout=3) as response:
            data = json.load(response)
        return {"status": data.get("status", "unknown"), "device": data.get("device")}
    except (OSError, ValueError):
        return {"status": "down"}


def query_vector(text: str):
    """Unit vector for a search query, or None when the service is unavailable."""
    if not enabled():
        return None
    key = text.strip()
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    request = urllib.request.Request(
        URL + "/embed",
        data=json.dumps({"texts": [key[:6000]], "kind": "query"}).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            vector = np.asarray(json.load(response)["vectors"][0], dtype=np.float32)
    except (OSError, ValueError, KeyError, IndexError):
        return None
    if vector.shape != (DIMENSION,):
        return None
    with _lock:
        _cache[key] = vector
        if len(_cache) > CACHE:
            _cache.popitem(last=False)
    return vector
