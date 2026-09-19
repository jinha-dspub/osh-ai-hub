"""Build the small public documentation kit from an explicit file allowlist."""
import hashlib
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_FILES = (
    'README.md', 'dataset.json', 'data_dictionary.csv', 'files.csv', 'QUALITY.md',
    'ACCESS.md', 'HANDOFF.md', 'preview.csv', 'DEMO.md', 'PROCESSING.md',
    'ENVIRONMENT.md', 'requirements.txt',
)
SOURCES = ['opendata/README.md', 'docs/OPENDATA-AI-TASK.md'] + [
    f'opendata/_template/{name}' for name in TEMPLATE_FILES
]
VERSION = '1.2'


def main():
    files = {}
    for name in SOURCES:
        path = ROOT / name
        if path.is_symlink() or not path.is_file():
            raise ValueError(f'Expected regular source file: {name}')
        data = path.read_bytes()
        if path.suffix == '.md':
            def link(match, source_path=path):
                target = match.group(1)
                if '://' in target or target.startswith('#'):
                    return match.group(0)
                relative = (source_path.parent / target.split('#')[0]).resolve().relative_to(ROOT)
                if str(relative) not in SOURCES:
                    return '](https://github.com/jinha-dspub/osh-ai-hub/blob/main/' + str(relative) + ')'
                return match.group(0)
            data = re.sub(r'\]\(([^)]+)\)', link, data.decode()).encode()
        files[name] = data
    files['START-HERE.md'] = (
        '# OSH 데이터 제작 키트 1.2\n\n'
        '1. [제작 가이드](opendata/README.md)를 읽으세요.\n'
        '2. opendata/_template 폴더를 새 작업 폴더로 복사하세요. 포함된 3행은 DEMO 합성 예시입니다.\n'
        '3. [AI 작업 지시문](docs/OPENDATA-AI-TASK.md)의 A 블록을 채워 제작 AI에게 전달하세요.\n'
        '4. 코드가 있으면 ENVIRONMENT.md와 의존성 파일을 실제 실행 결과로 채우세요.\n'
        '5. 원본을 보존하고 설명·검증 결과·HANDOFF와 함께 담당자에게 전달하세요.\n\n'
        '이 키트에는 자동 업로드 기능이 없습니다. 실제 자료 전달 경로는 담당자와 정합니다.\n'
        '전체 Hub 참고 문서는 GitHub 링크로 열립니다.\n'
    ).encode()
    manifest = {'version': VERSION, 'files': [
        {'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        for name, data in sorted(files.items())
    ]}
    files['KIT-MANIFEST.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2)+'\n').encode()
    output = ROOT / f'web/public/downloads/osh-opendata-kit-v{VERSION}.zip'
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 9, 19, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data)
    data = output.read_bytes()
    release = {'version': VERSION, 'published': '2026-09-19', 'name': output.name,
               'url': f'/downloads/{output.name}', 'bytes': len(data),
               'sha256': hashlib.sha256(data).hexdigest(), 'file_count': len(files)}
    (ROOT/'web/lib/opendata-kit-release.json').write_text(json.dumps(release, ensure_ascii=False, indent=2)+'\n')
    print(f'Exported {len(files)} documentation files, {len(data)} bytes; no research originals')


if __name__ == '__main__':
    main()
