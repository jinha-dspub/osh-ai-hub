"""Write the Hub's nine support categories as categories.csv for a new serving release.

The package's own 지원범주 stays untouched in programs.csv; this table adds one Hub category per
programme (agreed with the package author, 2026-10-01). Every programme must appear exactly once.

Usage: python3 scripts/build_support_programs_categories.py <release-dir>
       (writes <release-dir>/2_자료/data/categories.csv next to programs.csv)
"""

import csv
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import support_programs as sp


def ids(prefix, *numbers):
    return [f"2026-{prefix}{n:02d}" for n in numbers]


ASSIGN = {
    "설비개선": ids("", 1, 2, 3, 4, 6, 7, 8, 9, 10, 35) + ids("M", 1, 11) + ids("L", 9, 10, 25),
    "환경개선": ids("", 16, 17, 18) + ids("L", 20, 26),
    "장비지원": ids("", 5, 30, 31, 32) + ids("M", 15) + ids("L", 8),
    "컨설팅": ids("", 21, 22, 34)
    + ids("M", 2, 3, 4, 8, 12)
    + ids("W", 10)
    + ids("L", 1, 2, 14, 17, 32),
    "점검·기술지도": ids("", 26, 27)
    + ids("M", 5, 13)
    + ids("L", 13, 15, 16, 18, 21, 22, 23, 30, 31, 33, 34, 35, 36),
    "측정·검진": ids("", 11, 12, 13, 14, 15, 19, 20, 28, 29) + ids("L", 4, 5, 19),
    "교육": ids("", 33) + ids("W", 4, 7, 9),
    "보험료·감면·인증": ids("", 23, 24, 25)
    + ids("F", 1, 2, 3, 4)
    + ids("M", 6, 7, 9, 10, 14)
    + ids("W", 5)
    + ids("L", 7, 11, 12, 24, 27, 37, 38),
    "건강상담·산재복귀": ids("W", 1, 2, 3, 6, 8) + ids("L", 3, 6, 28, 29) + ids("C", *range(1, 13)),
}


def build(programs):
    assert list(ASSIGN) == sp.CATEGORIES, "category order must match the service"
    of = {}
    for category, members in ASSIGN.items():
        for pid in members:
            if pid in of:
                raise ValueError(f"{pid} is in both {of[pid]} and {category}")
            of[pid] = category
    known = [r["사업ID"] for r in programs]
    if missing := sorted(set(known) - set(of)):
        raise ValueError(f"no category for {missing}")
    if extra := sorted(set(of) - set(known)):
        raise ValueError(f"unknown programmes {extra}")
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(sp.CATEGORY_COLUMNS)
    for r in programs:
        writer.writerow([r["사업ID"], of[r["사업ID"]], r["지원범주"]])
    return ("﻿" + out.getvalue()).encode()


def main(release: Path):
    path = release / sp.TABLES["사업"][0]
    rows = list(csv.DictReader(io.StringIO(path.read_bytes().decode("utf-8-sig"), newline="")))
    content = build(rows)
    target = release / sp.CATEGORY_TABLE
    target.write_bytes(content)
    print(f"{len(rows)} programmes → {target}")
    print(" · ".join(f"{c} {len(m)}" for c, m in ASSIGN.items()))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]))
