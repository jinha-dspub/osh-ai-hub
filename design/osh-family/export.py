"""Export a portable UI kit with the project's existing local Korean font."""
import argparse
import hashlib
import json
import re
import shutil
import zipfile
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    destination = parser.parse_args().output.resolve()
    kit = Path(__file__).resolve().parent
    repo = kit.parents[1]
    font = repo / "node_modules/@fontsource-variable/noto-sans-kr"
    archive = destination.with_name(destination.name + ".zip")
    if destination.exists() or archive.exists():
        parser.error("Output directory or ZIP already exists. Choose a new output name.")
    if not (font / "index.css").is_file():
        parser.error("Install this repository's dependencies first; local font package is missing.")
    css = (font / "index.css").read_text()
    font_paths = sorted(set(re.findall(r"url\((\./files/[^)]+)\)", css)))
    if not font_paths or any(not (font / name).is_file() for name in font_paths):
        parser.error("Font CSS references missing files.")
    destination.mkdir(parents=True)
    for name in ("README.md", "osh-family.css", "preview.html"):
        shutil.copy2(kit / name, destination / name)
    for name in ("DESIGN-GUIDELINES.md", "DESIGN-BRIEF-TEMPLATE.md"):
        text = (repo / "docs" / name).read_text()
        text = text.replace("(../design/osh-family/README.md)", "(README.md)")
        (destination / name).write_text(text)
    fonts = destination / "fonts"
    (fonts / "files").mkdir(parents=True)
    (fonts / "font.css").write_text(css)
    shutil.copy2(font / "LICENSE", fonts / "LICENSE")
    for name in font_paths:
        shutil.copy2(font / name, fonts / name)
    manifest = {
        "kit": "osh-family", "version": "1.0",
        "font_package": json.loads((font / "package.json").read_text())["name"],
        "font_version": json.loads((font / "package.json").read_text())["version"],
        "files": [
            {"path": str(path.relative_to(destination)), "bytes": path.stat().st_size,
             "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
            for path in sorted(destination.rglob("*")) if path.is_file()
        ],
    }
    (destination / "KIT-MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED) as output:
        for path in sorted(destination.rglob("*")):
            if path.is_file():
                output.write(path, path.relative_to(destination))
    print(f"Exported {len(manifest['files'])} assets + manifest; {len(font_paths)} font files")
    print(f"Preview: {destination / 'preview.html'}")
    print(f"ZIP: {archive}")


if __name__ == "__main__":
    main()
