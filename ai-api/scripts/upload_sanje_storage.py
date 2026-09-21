"""Upload immutable per-disease bundles and tables directly to private Storage with TUS."""

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
from app import sanje, storage

CHUNK = 6 * 1024 * 1024


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def upload(settings, path, key, output):
    auth = {"apikey": settings["secret_key"], "Authorization": "Bearer " + settings["secret_key"]}
    origin = settings["url"].replace(".supabase.co", ".storage.supabase.co")
    opener = urllib.request.build_opener(storage.NoRedirect)
    checksum = digest(path)
    cache = output / (hashlib.sha256(key.encode()).hexdigest() + ".json")
    state = json.loads(cache.read_text()) if cache.exists() else {}
    if state.get("sha256") == checksum and state.get("verified"):
        return checksum
    location = state.get("location") if state.get("sha256") == checksum else None
    if location is None:
        mime = (
            "application/zip"
            if path.suffix == ".zip"
            else "text/csv"
            if path.suffix == ".csv"
            else "application/octet-stream"
        )
        metadata = {
            "bucketName": settings["bucket"],
            "objectName": key,
            "contentType": mime,
            "cacheControl": "0",
        }
        request = urllib.request.Request(
            origin + "/storage/v1/upload/resumable",
            data=b"",
            method="POST",
            headers={
                **auth,
                "Tus-Resumable": "1.0.0",
                "Upload-Length": str(path.stat().st_size),
                "Upload-Metadata": ",".join(
                    k + " " + base64.b64encode(v.encode()).decode() for k, v in metadata.items()
                ),
            },
        )
        with opener.open(request, timeout=60) as response:
            location = urllib.parse.urljoin(origin, response.headers["Location"])
        state = {"sha256": checksum, "location": location}
        cache.write_text(json.dumps(state))
    if not location.startswith(origin + "/storage/v1/upload/resumable/"):
        raise ValueError("Unexpected upload location")
    for attempt in range(4):
        try:
            request = urllib.request.Request(
                location, method="HEAD", headers={**auth, "Tus-Resumable": "1.0.0"}
            )
            with opener.open(request, timeout=30) as response:
                offset = int(response.headers["Upload-Offset"])
            with path.open("rb") as stream:
                stream.seek(offset)
                while chunk := stream.read(CHUNK):
                    request = urllib.request.Request(
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
                    with opener.open(request, timeout=120) as response:
                        offset = int(response.headers["Upload-Offset"])
            break
        except (OSError, ValueError):
            if attempt == 3:
                raise RuntimeError("Upload incomplete; resume state retained") from None
    signed = storage.storage_request(
        settings, "object/sign/" + settings["bucket"] + "/" + key, {"expiresIn": 900}
    )["signedURL"]
    if not signed.startswith("/object/sign/" + settings["bucket"] + "/" + key + "?"):
        raise ValueError("Unexpected verification URL")
    hasher = hashlib.sha256()
    with opener.open(settings["url"] + "/storage/v1" + signed, timeout=120) as response:
        while chunk := response.read(CHUNK):
            hasher.update(chunk)
    if hasher.hexdigest() != checksum:
        raise ValueError("Uploaded checksum mismatch")
    state["verified"] = True
    cache.write_text(json.dumps(state))
    print("Verified", key, path.stat().st_size, flush=True)
    return checksum


def main():
    os.umask(0o077)
    release = sanje.release()
    settings = sanje.storage_settings()
    buckets = storage.storage_request(settings, "bucket")
    bucket = next((b for b in buckets if b["id"] == settings["bucket"]), None)
    if bucket is None:
        storage.storage_request(
            settings,
            "bucket",
            {
                "id": settings["bucket"],
                "name": settings["bucket"],
                "public": False,
                "file_size_limit": 1073741824,
            },
        )
    storage.private_bucket(settings)
    source = Path(release["source"])
    output = Path(release["storage_manifest"]).parent / "upload"
    output.mkdir(exist_ok=True)
    records = {}
    keys = [settings["secret_key"].encode()]
    for name in ["chagpt_dspubs.txt", "gemini_api_key.txt"]:
        file = sanje.ROOT / "local_asset" / name
        if file.exists():
            keys.append(file.read_bytes().strip())
    for group in sanje.GROUPS:
        folder = source / group
        archive = output / (group + "-" + release["version"] + ".zip")
        if not archive.exists():
            with zipfile.ZipFile(archive, "x", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
                for path in sorted(folder.rglob("*")):
                    if not path.is_file():
                        continue
                    if path.is_symlink():
                        raise ValueError("Symlink in dataset")
                    raw = path.read_bytes()
                    if any(key and key in raw for key in keys):
                        raise ValueError("Credential in dataset")
                    z.writestr(path.relative_to(folder).as_posix(), raw)
                z.write(
                    Path(release["storage_manifest"]).parent / "research-info.json",
                    "HUB-RESEARCH-INFO.json",
                )
                z.writestr(
                    "HUB-HANDOFF-NOTE.txt",
                    "질환별 인수 스냅샷입니다. 원본 문서는 보존하며 추가 연구자 정보는 HUB-RESEARCH-INFO.json을 참고하세요. 전체 7개 군 검증에 필요한 상위 파일은 전체 인수 묶음에 있습니다. 이 ZIP만으로 전체 묶음 검증 명령을 실행하지 마세요. 검색·원문·다운로드는 인증된 연구용 검토 화면에서 제공합니다.\n",
                )
        selected = [
            ("source", archive),
            ("cases", folder / "cases.csv"),
            ("texts", folder / "case_texts.csv"),
            ("measurements", folder / "exposure_measurements.csv"),
            ("worktime", folder / "worktime.csv"),
            ("worktime-records", folder / "worktime_records.csv"),
            ("labels", folder / "standard_labels.jsonl"),
            ("metadata", folder / "metadata.jsonl"),
        ]
        records[group] = []
        for identifier, path in selected:
            checksum = digest(path)
            key = f"{settings['prefix']}/{group}/{checksum[:16]}/{path.name}"
            upload(settings, path, key, output)
            records[group].append(
                {
                    "id": identifier,
                    "name": path.name,
                    "object": key,
                    "bytes": path.stat().st_size,
                    "sha256": checksum,
                }
            )
    result = {
        "verified": True,
        "version": release["version"],
        "project": settings["url"],
        "bucket": settings["bucket"],
        "groups": records,
    }
    manifest = Path(release["storage_manifest"])
    temporary = manifest.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    temporary.replace(manifest)
    print("All 7 private dataset downloads verified; service not switched yet", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001 -- never expose request URLs or credentials
        print(
            "Upload stopped:",
            type(error).__name__,
            str(error)
            if str(error)
            in {
                "Unexpected upload location",
                "Unexpected verification URL",
                "Uploaded checksum mismatch",
                "Symlink in dataset",
                "Credential in dataset",
            }
            else "(private URLs and keys omitted)",
            flush=True,
        )
        sys.exit(1)
