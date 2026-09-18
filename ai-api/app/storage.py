"""Private object-storage metadata and short-lived links; never proxy file bytes."""

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "local_asset/copd-storage-manifest.json"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def config():
    path = Path(
        os.environ.get("SUPABASE_STORAGE_CONFIG", ROOT / "local_asset/supabase_storage.json")
    )
    try:
        data = json.loads(path.read_text())
        url = data["url"].rstrip("/")
        parsed = urllib.parse.urlsplit(url)
        if (
            parsed.scheme != "https"
            or not re.fullmatch(r"[a-z0-9]+\.supabase\.co", parsed.netloc)
            or parsed.path
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("Invalid project URL")
        if not data["secret_key"].startswith("sb_secret_"):
            raise ValueError("Server secret key required")
        if data["bucket"] != "copd-research":
            raise ValueError("Unexpected bucket")
        prefix = data["prefix"].strip("/")
        if (
            not prefix.startswith("copd/")
            or ".." in prefix
            or not re.fullmatch(r"[A-Za-z0-9/_-]+", prefix)
        ):
            raise ValueError("Invalid prefix")
        return {**data, "url": url, "prefix": prefix}
    except (OSError, ValueError, KeyError, TypeError):
        raise HTTPException(503, "파일 저장소 설정을 확인 중입니다.") from None


def storage_request(settings, path, payload=None):
    req = urllib.request.Request(
        settings["url"] + "/storage/v1/" + path,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={
            "apikey": settings["secret_key"],
            "Authorization": "Bearer " + settings["secret_key"],
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=15) as response:
            return json.load(response)
    except (OSError, ValueError):
        raise HTTPException(
            503, "저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."
        ) from None


def private_bucket(settings):
    bucket = storage_request(settings, "bucket/" + settings["bucket"])
    if bucket.get("public") is not False:
        raise HTTPException(503, "비공개 저장소 상태를 확인 중입니다.")


def manifest():
    try:
        data = json.loads(MANIFEST.read_text())
        if data.get("verified") is not True or not data.get("files"):
            raise ValueError("Unverified upload")
        return data
    except (OSError, ValueError, TypeError):
        raise HTTPException(503, "다운로드 파일을 준비 중입니다.") from None


def files():
    data = manifest()
    return {
        "version": data["version"],
        "files": [
            {key: item[key] for key in ["id", "name", "bytes", "sha256"]} for item in data["files"]
        ],
    }


class DownloadInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=60, pattern=r"^[a-z0-9_-]+$")


def signed_download(body: DownloadInput):
    settings = config()
    data = manifest()
    if data.get("bucket") != settings["bucket"] or data.get("project") != settings["url"]:
        raise HTTPException(503, "파일 저장소 구성을 확인 중입니다.")
    item = next((f for f in data["files"] if f["id"] == body.id), None)
    if item is None:
        raise HTTPException(404, "등록된 파일이 아닙니다.")
    path = item["object"]
    if not path.startswith(settings["prefix"] + "/") or ".." in path:
        raise HTTPException(503, "파일 경로를 확인 중입니다.")
    private_bucket(settings)
    route = "object/sign/" + settings["bucket"] + "/" + urllib.parse.quote(path, safe="/")
    result = storage_request(settings, route, {"expiresIn": 60})
    signed = result.get("signedURL", "")
    expected = "/object/sign/" + settings["bucket"] + "/"
    if not signed.startswith(expected):
        raise HTTPException(503, "다운로드 주소를 생성하지 못했습니다.")
    url = settings["url"] + "/storage/v1" + signed
    url += "&download=" + urllib.parse.quote(item["name"], safe="")
    return {"url": url, "expires_in": 60}
