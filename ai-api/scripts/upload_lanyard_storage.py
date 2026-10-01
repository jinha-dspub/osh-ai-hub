"""Upload the 안전대 체결 라벨링 데이터셋 package to its own private bucket."""

import json
import os
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from upload_sanje_storage import digest, upload

from app import lanyard, storage

# The largest Roboflow set ZIP is ~380 MB; signed links let it bypass the web servers.
FILE_SIZE_LIMIT = 500 * 1024 * 1024
LABELS_VERSION = "2026-09-30.1"  # label files carried over unchanged into 2026-10-01.1
ROBOFLOW_SETS = [
    "re-j3euq",
    "body-harness",
    "gantary",
    "hooks-project",
    "safebelt1",
    "dyd-safe",
    "projectv-uiuat",
]


def set_size_limit(cfg):
    request = urllib.request.Request(
        cfg["url"] + "/storage/v1/bucket/" + cfg["bucket"],
        data=json.dumps({"public": False, "file_size_limit": FILE_SIZE_LIMIT}).encode(),
        method="PUT",
        headers={
            "apikey": cfg["secret_key"],
            "Authorization": "Bearer " + cfg["secret_key"],
            "Content-Type": "application/json",
        },
    )
    with urllib.request.build_opener(storage.NoRedirect).open(request, timeout=15) as response:
        response.read()


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
                "file_size_limit": FILE_SIZE_LIMIT,
            },
        )
    set_size_limit(cfg)
    storage.private_bucket(cfg)
    root = Path(__file__).resolve().parents[2]
    # Symlink to /nas/보호구체결현황파악/processed/lanyard-dataset-20260930-v1 (nas-put).
    source = root / "local_asset/lanyard-dataset" / LABELS_VERSION
    output = root / "local_asset/lanyard-upload"
    output.mkdir(exist_ok=True)
    old = LABELS_VERSION
    version = lanyard.DATASET_VERSION
    # Symlink to /nas/보호구체결현황파악/processed/lanyard-external-dataset-20261001-v1.
    external = root / "local_asset/lanyard-external" / version
    # (id, source file, published name). Names say who made the labels; the NAS
    # packages keep their original file names.
    selected = [
        (
            "labels-json",
            source / f"lanyard-labels-{old}.json",
            f"lanyard-human-reviewed-labels-{old}.json",
        ),
        (
            "labels-zip",
            source / f"lanyard-labels-{old}.zip",
            f"lanyard-human-reviewed-labels-{old}.zip",
        ),
        # AI-only labels for all training photos (scripts/build_lanyard_ai_labels.py).
        (
            "ai-labels-zip",
            root / "local_asset/lanyard-ai-labels" / old / f"lanyard-ai-labels-{old}.zip",
            f"lanyard-ai-auto-labels-unreviewed-{old}.zip",
        ),
        # Photos and labels outside AIHub (scripts/build_lanyard_external.py).
        (
            "external-ai-labels-zip",
            external / f"lanyard-external-ai-auto-labels-unreviewed-{version}.zip",
            f"lanyard-external-ai-auto-labels-unreviewed-{version}.zip",
        ),
    ] + [
        (
            f"roboflow-{name}",
            external / f"roboflow-harness-{name}-{version}.zip",
            f"roboflow-harness-{name}-{version}.zip",
        )
        for name in ROBOFLOW_SETS
    ]
    files = []
    for identifier, path, name in selected:
        checksum = digest(path)
        key = f"{cfg['prefix']}/{checksum[:16]}/{name}"
        upload(cfg, path, key, output)
        files.append(
            {
                "id": identifier,
                "name": name,
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
