"""Move lanyard research files to the NAS and lock finished days.

1. local_asset/lanyard-runs/nas-pending/ (written while the NAS was down) → NAS.
2. Runs from before the NAS archive (local images/ + runs.sqlite) → NAS raw/processed.
3. raw/osh-uploads-YYYYMMDD folders before today lose write permission (NAS rule 1).

Existing NAS files are never replaced. Safe to run repeatedly (e.g. daily timer).
"""

import json
import os
import sqlite3
import stat
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import lanyard


def nas_ready():
    if os.environ.get("LANYARD_NAS_ARCHIVE", "true") != "true":
        sys.exit("LANYARD_NAS_ARCHIVE is off")
    if not (lanyard.nas_root() / "README.md").exists():
        sys.exit("NAS not mounted: check `findmnt /nas`")


def flush_pending():
    moved = 0
    pending = lanyard.store_dir() / "nas-pending"
    for path in sorted(p for p in pending.rglob("*") if p.is_file()):
        relative = path.relative_to(pending)
        day = relative.parts[2].split("-")[2][:8]
        day = f"{day[:4]}-{day[4:6]}-{day[6:]}"
        target = lanyard.nas_root() / relative
        note_name, note = lanyard.folder_note(relative, day)
        if not (target.parent / note_name).exists():
            lanyard.put_new(target.parent / note_name, note.encode("utf-8"))
        lanyard.put_new(target, path.read_bytes())
        if target.read_bytes() == path.read_bytes():
            path.unlink()
            moved += 1
    return moved


def backfill():
    """Runs stored before NAS archiving: copy image + label JSON, then drop the local image."""
    db_path = lanyard.store_dir() / "runs.sqlite"
    if not db_path.exists():
        return 0
    db = sqlite3.connect(db_path)
    moved = 0
    for run_id, created, width, height, sha, stage1, stage2, usage in db.execute(
        "SELECT id,created,width,height,image_sha256,stage1,stage2,usage FROM runs"
    ):
        day = created[:10]
        local = lanyard.store_dir() / "images" / day / f"{run_id}.jpg"
        stamp = day.replace("-", "")
        labels = lanyard.nas_root() / lanyard.archive_path("labels", day, "x").parent
        if (labels / f"{run_id}.stage1.json").exists() and not local.exists():
            continue
        if local.exists():
            lanyard.archive("raw", day, f"{run_id}.jpg", local.read_bytes())
        first = json.loads(stage1)
        lanyard.archive_json(
            day,
            f"{run_id}.stage1.json",
            {
                "id": run_id,
                "created": created,
                "release": lanyard.RELEASE,
                "image": f"raw/osh-uploads-{stamp}/{run_id}.jpg" if local.exists() else None,
                "width": width,
                "height": height,
                "sha256": sha,
                "keypoints": "polyline[0]=attachment end, polyline[6]=hook end",
                **first,
                "summary": lanyard.summary(first["lanyards"]),
            },
        )
        if stage2:
            lanyard.archive_json(
                day,
                f"{run_id}.stage2.json",
                {"id": run_id, "model": lanyard.VLM_MODEL, **json.loads(stage2), "usage": usage},
            )
        notes = db.execute(
            "SELECT created,verdict,note FROM feedback WHERE run_id=? ORDER BY created", (run_id,)
        ).fetchall()
        for index, (when, verdict, note) in enumerate(notes, 1):
            lanyard.archive_json(
                day,
                f"{run_id}.feedback-{index}.json",
                {"id": run_id, "created": when, "verdict": verdict, "note": note},
            )
        raw = lanyard.nas_root() / lanyard.archive_path("raw", day, f"{run_id}.jpg")
        if local.exists() and raw.exists() and raw.read_bytes() == local.read_bytes():
            local.unlink()
        moved += 1
    return moved


def lock_finished_days():
    locked = 0
    raw = lanyard.nas_root() / lanyard.PROJECT / "raw"
    today = lanyard.today().replace("-", "")
    for folder in sorted(raw.glob("osh-uploads-*")):
        if folder.name[-8:] >= today:
            continue
        for path in [*folder.rglob("*"), folder]:
            mode = path.stat().st_mode
            if mode & 0o222:
                path.chmod(mode & ~(stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH))
                locked += 1
    return locked


if __name__ == "__main__":
    nas_ready()
    print(
        f"pending moved {flush_pending()}, runs backfilled {backfill()}, locked {lock_finished_days()}"
    )
