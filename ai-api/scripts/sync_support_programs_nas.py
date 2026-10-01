"""Move support programme demand logs to the NAS and lock finished days.

1. local_asset/support-programs-log/nas-pending/ (written while the NAS was down) → NAS.
2. raw/demand-log-YYYYMMDD folders before today (KST) lose write permission (NAS rule 1).

Existing NAS files are never replaced. Safe to run repeatedly (e.g. daily timer).
"""

import stat
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import support_programs as sp


def nas_ready():
    if not (sp.nas_root() / "README.md").exists():
        sys.exit("NAS not mounted: check `findmnt /nas`")


def flush_pending():
    moved = 0
    pending = sp.store_dir() / "nas-pending"
    for path in sorted(p for p in pending.rglob("*.json") if p.is_file()):
        relative = path.relative_to(pending)
        stamp = relative.parts[2].removeprefix("demand-log-")
        day = f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:]}"
        target = sp.nas_root() / relative
        manifest = target.parent / "MANIFEST.md"
        if not manifest.exists():
            sp.put_new(manifest, sp.RAW_MANIFEST.format(day=day).encode())
        sp.put_new(target, path.read_bytes())
        if target.read_bytes() == path.read_bytes():
            path.unlink()
            moved += 1
    return moved


def lock_finished_days(today=None):
    locked = 0
    raw = sp.nas_root() / sp.PROJECT / "raw"
    today = today or datetime.now(sp.KST).strftime("%Y%m%d")
    for folder in sorted(raw.glob("demand-log-*")):
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
    print(f"pending moved {flush_pending()}, locked {lock_finished_days()}")
