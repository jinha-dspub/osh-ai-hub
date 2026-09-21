"""Upload the reviewed OSHMASTER archives to a separate private bucket."""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from upload_sanje_storage import digest, upload

from app import oshmaster, storage


def main():
    os.umask(0o077)
    cfg = oshmaster.settings()
    if not any(b["id"] == cfg["bucket"] for b in storage.storage_request(cfg, "bucket")):
        storage.storage_request(
            cfg,
            "bucket",
            {
                "id": cfg["bucket"],
                "name": cfg["bucket"],
                "public": False,
                "file_size_limit": 1073741824,
            },
        )
    storage.private_bucket(cfg)
    root = Path(__file__).resolve().parents[2]
    output = root / "local_asset/oshmaster-upload"
    output.mkdir(exist_ok=True)
    selected = [
        ("source", root / "tmp/oshmaster-opendata/2026-09-21.1/oshmaster-2026-09-21.1.zip"),
        ("excel", oshmaster.ROOT / "release/oshmaster-excel.zip"),
    ]
    files = []
    for identifier, path in selected:
        checksum = digest(path)
        key = f"{cfg['prefix']}/{checksum[:16]}/{path.name}"
        upload(cfg, path, key, output)
        files.append(
            {
                "id": identifier,
                "name": path.name,
                "object": key,
                "bytes": path.stat().st_size,
                "sha256": checksum,
            }
        )
    value = {
        "version": oshmaster.VERSION,
        "verified": True,
        "bucket": cfg["bucket"],
        "project": cfg["url"],
        "files": files,
    }
    pending = oshmaster.MANIFEST.with_suffix(".pending")
    pending.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    pending.replace(oshmaster.MANIFEST)
    print("OSHMASTER private files verified")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001 -- never print private URLs
        print("Upload incomplete:", type(error).__name__, "private details omitted")
        sys.exit(1)
