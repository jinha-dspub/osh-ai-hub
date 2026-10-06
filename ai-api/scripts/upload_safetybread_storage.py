"""Upload the three 2026-10-06 safetybread datasets to their own private buckets.

    python scripts/upload_safetybread_storage.py osh-precedents
    python scripts/upload_safetybread_storage.py osh-synonym-vocab
    python scripts/upload_safetybread_storage.py kosha-guide-graphrag

For each dataset: the author's release zip and the index files named in dataset.json
`downloads` are uploaded byte-for-byte from the serving release (NAS serving/current; for KOSHA
the handoff package, whose data the serving subset came from), plus one "full" zip of the whole
release folder built here (every file, so the whole handoff can be reproduced). Objects are
keyed by content hash, each upload is re-downloaded and hash-checked by the TUS helper, and the
manifest local_asset/<slug>-storage-manifest.json is written only when all files verified.
"""

import json
import os
import sys
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from upload_sanje_storage import digest, upload

from app import safetybread_apps as sb
from app import storage

FILE_SIZE_LIMIT = 1024 * 1024 * 1024
SKIP_DIRS = {"__pycache__", "var", ".venv"}
# Where the bytes come from: the serving release (판례 v2 has the owner's name removal), or
# the handoff package for KOSHA (the serving folder is the screen's subset).
SOURCES = {
    "osh-precedents": sb.root("osh-precedents"),
    "osh-synonym-vocab": sb.root("osh-synonym-vocab"),
    "kosha-guide-graphrag": sb.NAS / "safetybread/processed/kosha-guide-graphrag-current",
}


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


def full_zip(slug, source, output):
    """One zip of the whole release folder, members under <slug>/, bytes unchanged."""
    path = output / f"{slug}-{sb.PACKAGES[slug]['version']}-full.zip"
    if path.exists():
        return path
    tmp = path.with_suffix(".part")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for dirpath, dirnames, filenames in os.walk(source):
            dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
            for name in sorted(filenames):
                file = Path(dirpath) / name
                if not file.is_symlink():
                    z.write(file, f"{slug}/{file.relative_to(source).as_posix()}")
    tmp.replace(path)
    return path


def selected(slug, source, output):
    """(id, path, published name) in the order shown on the intro page."""
    meta = json.loads((source / "dataset.json").read_text(encoding="utf-8"))
    files = [("full-zip", full_zip(slug, source, output), None)]
    for rel in meta.get("downloads", []):
        path = source / rel
        if not path.is_file():
            raise FileNotFoundError(rel)
        kind = "release-zip" if rel.startswith("release/") else "idx-" + path.stem.replace("_", "-")
        files.append((kind, path, None))
    return [(i, p, n or p.name) for i, p, n in files]


def main(slug):
    os.umask(0o077)
    if slug not in sb.PACKAGES:
        raise SystemExit(f"unknown dataset: {slug}")
    cfg = sb.storage_settings(slug)
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
    source = SOURCES[slug].resolve()
    output = sb.REPO / "local_asset" / f"{slug}-upload"
    output.mkdir(exist_ok=True)
    files = []
    for identifier, path, name in selected(slug, source, output):
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
        "version": sb.PACKAGES[slug]["version"],
        "source": str(source),
        "verified": True,
        "bucket": cfg["bucket"],
        "project": cfg["url"],
        "files": files,
    }
    pending = sb.manifest_path(slug).with_suffix(".pending")
    pending.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    pending.replace(sb.manifest_path(slug))
    print(f"{slug}: {len(files)} private files verified")


if __name__ == "__main__":
    try:
        main(sys.argv[1] if len(sys.argv) > 1 else "")
    except KeyboardInterrupt:
        raise SystemExit(130) from None
