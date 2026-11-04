"""Prepare a versioned Hub copy without changing the supplied handoff."""

import argparse
import csv
import hashlib
import json
import shutil
from pathlib import Path

PREFIX = "/demo/ei-nhis-life-years-lost/"


def prepare(source: Path, target: Path, release_id: str):
    if target.exists():
        raise ValueError("Output must be a new directory")
    shutil.copytree(source, target, ignore=shutil.ignore_patterns("__pycache__", ".venv"))
    entry = target / "demo/dist/index.html"
    html = entry.read_text()
    replacements = {
        '<meta charset="utf-8">': f'<meta charset="utf-8"><base href="{PREFIX}">',
        'href="./"': 'href="/datasets/ei-nhis-life-years-lost"',
        '<span class="osh-badge">학위논문 방법 기반</span>': '<span class="osh-badge osh-badge--demo">DEMO · 합성자료 계산</span>',
        "로컬 참조 서버 주소: 127.0.0.1.": "입력은 OSH 계산 서버의 메모리에서 처리하고 파일로 저장하지 않습니다.",
        "외부 게시 범위: 인계 시 확인 필요.": "논문 보고값이며 DEMO 계산 결과와 구분합니다. 원천 자료의 재배포 조건은 별도 확인이 필요합니다.",
        "로컬 참조 구현 자료. 운영 환경 적용 시 자료 소개·다운로드 경로 및 Python 계산 서비스 연동 확인 필요.": "DEMO 예제·입력 양식·계산 코드를 제공합니다. 실제 연령별 반출 집계자료는 포함하지 않습니다. "
        "업로드에는 공개·전송 가능한 집계자료만 사용하세요. 개인자료는 넣지 마세요.",
    }
    for old, new in replacements.items():
        if old not in html:
            raise ValueError("Entry page changed; review the integration replacements")
        html = html.replace(old, new)
    entry.write_text(html)
    js = target / "demo/dist/app.js"
    js.write_text(
        js.read_text()
        .replace(
            "계산 서버 응답 확인 불가. Python 서버 실행 및 API 연동 상태 확인 필요.",
            "계산 서버에 연결되지 않았습니다. 잠시 후 다시 시도해 주세요.",
        )
        .replace(" 서버 접속 및 자료 경로 확인 필요.", " 잠시 후 새로고침해 주세요.")
    )
    metadata = target / "dataset.json"
    data = json.loads(metadata.read_text())
    data.update(data_kind="mixed", status="released")
    for value in data["publication"].values():
        value.update(state="ready", audience="public", evidence="HUB-RELEASE.md")
    data["demo"]["public_url"] = PREFIX
    data["hub_release"] = release_id
    metadata.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    (target / "HUB-RELEASE.md").write_text(
        f"# Hub integration · {release_id}\n\n"
        "User requested publication of the revised package on osh.ai.kr on 2026-11-04. "
        "Source 0.1.0-local with revised guide, UI and calculator messages is preserved. "
        "Only hosting text, base URL and publication metadata changed; calculation code and data unchanged. "
        "9 synthetic examples; thesis table 7 contains reported results, not calculator inputs. "
        "Real age aggregates are not supplied. No new license or researcher role is asserted.\n"
    )
    listing = target / "files.csv"
    with listing.open(newline="") as stream:
        reader = csv.DictReader(stream)
        fields, rows = reader.fieldnames, list(reader)
    for row in rows:
        content = (target / row["path"]).read_bytes()
        row.update(bytes=str(len(content)), sha256=hashlib.sha256(content).hexdigest())
    with listing.open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fields)
        writer.writeheader()
        writer.writerows(rows)
    # All served files and the executable calculator are pinned together.
    paths = sorted(p for p in (target / "demo/dist").rglob("*") if p.is_file())
    paths.append(target / "scripts/calculate.py")
    files = {str(p.relative_to(target)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    manifest = json.dumps(files, sort_keys=True, ensure_ascii=False).encode()
    (target / "hub-manifest.json").write_bytes(manifest)
    rows.append(
        {
            "file_id": "hub_manifest",
            "path": "hub-manifest.json",
            "role": "integrity",
            "format": "json",
            "bytes": str(len(manifest)),
            "sha256": hashlib.sha256(manifest).hexdigest(),
            "rows": "",
            "access": "restricted",
        }
    )
    for row in rows:
        row["access"] = "public" if row["path"].startswith("demo/dist/") else "restricted"
    with listing.open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fields)
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps({"files": len(files), "digest": hashlib.sha256(manifest).hexdigest()}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("--release-id", required=True)
    args = parser.parse_args()
    prepare(args.source, args.target, args.release_id)
