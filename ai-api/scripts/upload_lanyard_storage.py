"""Upload the 안전대 체결 라벨링 데이터셋 package to its own private bucket."""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from upload_sanje_storage import digest, upload

from app import lanyard, storage


def main():
    os.umask(0o077)
    cfg = lanyard.dataset_settings()
    if not any(b["id"] == cfg["bucket"] for b in storage.storage_request(cfg, "bucket")):
        storage.storage_request(
            cfg,
            "bucket",
            {
                "id": cfg["bucket"],
                "name": cfg["bucket"],
                "public": False,
                "file_size_limit": 104857600,
            },
        )
    storage.private_bucket(cfg)
    root = Path(__file__).resolve().parents[2]
    # Symlink to /nas/보호구체결현황파악/processed/lanyard-dataset-20260930-v1 (nas-put).
    source = root / "local_asset/lanyard-dataset" / lanyard.DATASET_VERSION
    output = root / "local_asset/lanyard-upload"
    output.mkdir(exist_ok=True)
    version = lanyard.DATASET_VERSION
    selected = [
        ("labels-json", source / f"lanyard-labels-{version}.json"),
        ("labels-zip", source / f"lanyard-labels-{version}.zip"),
        # AI-only labels for all training photos (scripts/build_lanyard_ai_labels.py).
        (
            "ai-labels-zip",
            root / "local_asset/lanyard-ai-labels" / version / f"lanyard-ai-labels-{version}.zip",
        ),
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
        "version": version,
        "verified": True,
        "bucket": cfg["bucket"],
        "project": cfg["url"],
        "files": files,
    }
    pending = lanyard.DATASET_MANIFEST.with_suffix(".pending")
    pending.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    pending.replace(lanyard.DATASET_MANIFEST)
    print("Lanyard dataset private files verified")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001 -- never print private URLs
        print("Upload incomplete:", type(error).__name__, "private details omitted")
        sys.exit(1)
