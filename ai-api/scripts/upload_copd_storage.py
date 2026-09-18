"""Upload an immutable COPD snapshot straight to private Storage using TUS.
Run from ai-api: .venv/bin/python scripts/upload_copd_storage.py
Prints only filenames, sizes, checksums and progress, never keys or signed URLs.
"""

import base64
import hashlib
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.storage import (
    MANIFEST,
    ROOT,
    NoRedirect,
    config,
    private_bucket,
    storage_request,
)

CHUNK = 6 * 1024 * 1024


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main():
    os.umask(0o077)
    settings = config()
    private_bucket(settings)
    source = ROOT / "opendata/copd"
    paths = sorted(p for p in source.rglob("*") if p.is_file())
    if any(
        p.is_symlink()
        or p.suffix not in {".csv", ".json", ".md", ".py", ".sql", ".txt", ".parquet", ".html"}
        for p in paths
    ):
        raise RuntimeError("Unexpected source file")
    # Reject literal known credentials before packaging even if copied into source data.
    keys = [settings["secret_key"].encode()]
    for name in ["chagpt_dspubs.txt", "gemini_api_key.txt"]:
        path = ROOT / "local_asset" / name
        if path.exists():
            keys.append(path.read_bytes().strip())
    inventory = []
    for path in paths:
        raw = path.read_bytes()
        if any(key and key in raw for key in keys):
            raise RuntimeError("Credential found in source; upload stopped")
        inventory.append(
            {
                "name": path.relative_to(source).as_posix(),
                "bytes": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(),
            }
        )
    version = hashlib.sha256(json.dumps(inventory, sort_keys=True).encode()).hexdigest()[:16]
    output = ROOT / "local_asset/copd-upload"
    output.mkdir(mode=0o700, exist_ok=True)
    archive = output / "copd-source.zip"
    reuse = False
    if MANIFEST.exists() and archive.exists():
        previous = json.loads(MANIFEST.read_text())
        existing = next((f for f in previous.get("files", []) if f["id"] == "source"), None)
        reuse = (
            previous.get("version") == version
            and existing
            and existing["sha256"] == digest(archive)
        )
    if not reuse:
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
            for path in paths:
                info = zipfile.ZipInfo(path.relative_to(source).as_posix(), (2026, 9, 17, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                bundle.writestr(info, path.read_bytes())
            bundle.writestr(
                zipfile.ZipInfo("OSH-IMPORT-NOTE.txt", (2026, 9, 17, 0, 0, 0)),
                "실제 연구자료 · 내부 검토용. 원본을 수정하지 않은 반입 스냅샷입니다. 원본 README의 라이선스·품질 주장을 별도로 검증하지 않았습니다. Hugging Face 게시 계획 없음. CSV는 사건번호로 연결합니다.\n",
            )
    selected = [
        ("source", archive),
        ("cases", source / "cases.csv"),
        ("texts", source / "case_texts.csv"),
        ("measurements", source / "exposure_measurements.csv"),
        ("embeddings", source / "demo/embeddings.parquet"),
    ]
    records = []
    auth = {"apikey": settings["secret_key"], "Authorization": "Bearer " + settings["secret_key"]}
    origin = settings["url"].replace(".supabase.co", ".storage.supabase.co")
    opener = urllib.request.build_opener(NoRedirect)
    for identifier, path in selected:
        key = f"{settings['prefix']}/{version}/{path.name}"
        checksum = digest(path)
        mime = (
            "application/zip"
            if path.suffix == ".zip"
            else "text/csv"
            if path.suffix == ".csv"
            else "application/octet-stream"
        )
        state_path = output / f"{version}-{identifier}.json"
        location = None
        if state_path.exists():
            state = json.loads(state_path.read_text())
            if state.get("sha256") == checksum:
                location = state.get("location")
        if location is None:
            metadata = {
                "bucketName": settings["bucket"],
                "objectName": key,
                "contentType": mime,
                "cacheControl": "0",
            }
            headers = {
                **auth,
                "Tus-Resumable": "1.0.0",
                "Upload-Length": str(path.stat().st_size),
                "Upload-Metadata": ",".join(
                    k + " " + base64.b64encode(v.encode()).decode() for k, v in metadata.items()
                ),
            }
            request = urllib.request.Request(
                origin + "/storage/v1/upload/resumable", data=b"", headers=headers, method="POST"
            )
            with opener.open(request, timeout=60) as response:
                location = urllib.parse.urljoin(origin, response.headers["Location"])
            state_path.write_text(json.dumps({"sha256": checksum, "location": location}))
        if urllib.parse.urlsplit(location).netloc != urllib.parse.urlsplit(
            origin
        ).netloc or not location.startswith(origin + "/storage/v1/upload/resumable/"):
            raise RuntimeError("Unexpected upload location")
        for attempt in range(4):
            try:
                head = urllib.request.Request(
                    location, headers={**auth, "Tus-Resumable": "1.0.0"}, method="HEAD"
                )
                with opener.open(head, timeout=30) as response:
                    offset = int(response.headers["Upload-Offset"])
                with path.open("rb") as stream:
                    stream.seek(offset)
                    while chunk := stream.read(CHUNK):
                        patch = urllib.request.Request(
                            location,
                            data=chunk,
                            method="PATCH",
                            headers={
                                **auth,
                                "Tus-Resumable": "1.0.0",
                                "Upload-Offset": str(offset),
                                "Content-Type": "application/offset+octet-stream",
                            },
                        )
                        with opener.open(patch, timeout=120) as response:
                            offset = int(response.headers["Upload-Offset"])
                        print(f"{path.name}: {offset}/{path.stat().st_size}", flush=True)
                break
            except (OSError, ValueError):
                if attempt == 3:
                    raise RuntimeError("Upload failed; local resume state retained") from None
        signed = storage_request(
            settings, "object/sign/" + settings["bucket"] + "/" + key, {"expiresIn": 300}
        )["signedURL"]
        url = settings["url"] + "/storage/v1" + signed
        hasher = hashlib.sha256()
        with opener.open(url, timeout=120) as response:
            while chunk := response.read(CHUNK):
                hasher.update(chunk)
        if hasher.hexdigest() != checksum:
            raise RuntimeError("Remote checksum mismatch")
        print(f"verified {path.name}: SHA256 matches", flush=True)
        records.append(
            {
                "id": identifier,
                "name": path.name,
                "bytes": path.stat().st_size,
                "sha256": checksum,
                "object": key,
            }
        )
    manifest = {
        "verified": True,
        "project": settings["url"],
        "bucket": settings["bucket"],
        "version": version,
        "files": records,
    }
    temporary = MANIFEST.with_suffix(".tmp")
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    temporary.replace(MANIFEST)
    print("Verified manifest published locally; bucket remains private.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001 — never print request URLs or auth headers
        print("Upload stopped:", type(error).__name__, "(credentials and URLs omitted)")
        sys.exit(1)
