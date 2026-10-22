"""Make a ChemReg release serve under the shared /demo gateway instead of a subdomain root.

ChemReg 1.0.0 (ukbyun, 2026-10-22) is written for a dedicated HTTPS subdomain: its HTML, JS and
server-rendered print pages link to /static/... and /api/... and its session cookie is scoped to
"/". On osh.ai.kr it lives at /demo/chemreg/, so this script rewrites only those *links* to carry
the prefix. Route decorators stay unprefixed because the gateway (ai-api/app/chemreg.py) strips
the prefix before forwarding, so the app itself still answers at /, /static and /api.

Every new release has to be patched again. Run:

    python ai-api/scripts/patch_chemreg.py local_asset/chemreg/releases/<version>/ChemReg

It is idempotent and refuses to run on a tree it does not recognise.
"""

import re
import sys
from pathlib import Path

PREFIX = "/demo/chemreg"
# Browser-side files: every quoted /static/ or /api/ string is a URL the browser resolves.
STATIC_FILES = ("index.html", "app.js", "core.js", "ghs.js", "identifiers.js", "labels.js",
                "msds.js", "regulatory.js")
STATIC_RULE = (re.compile(r"""(["'])/(static|api)/(?!demo/)"""), rf"\1{PREFIX}/\2/")
# Server-rendered HTML (label / MSDS print pages): only attribute values, never route paths.
PY_HTML_FILES = ("labels.py", "msds.py")
PY_RULE = (re.compile(r"""(=["'])/(static|api)/(?!demo/)"""), rf"\1{PREFIX}/\2/")
NOTE = "PATCHED-FOR-OSH-HUB.md"


def apply(path: Path, rule, label: str):
    text = path.read_text(encoding="utf-8")
    new, count = rule[0].subn(rule[1], text)
    if count:
        path.write_text(new, encoding="utf-8")
    print(f"{label:<28} {count:>3} link(s)")
    return count


def replace_once(path: Path, old: str, new: str, label: str):
    text = path.read_text(encoding="utf-8")
    if new in text:
        print(f"{label:<28} already")
        return 0
    if text.count(old) == 0:
        raise SystemExit(f"{path}: expected text not found: {old!r}")
    path.write_text(text.replace(old, new), encoding="utf-8")
    print(f"{label:<28} {text.count(old):>3} change(s)")
    return text.count(old)


def main(root: Path):
    root = root.resolve()
    for required in ("run.py", "app/main.py", "app/security.py", "app/static/index.html"):
        if not (root / required).is_file():
            raise SystemExit(f"not a ChemReg tree: missing {required}")
    total = 0
    for name in STATIC_FILES:
        total += apply(root / "app/static" / name, STATIC_RULE, f"static/{name}")
    for name in PY_HTML_FILES:
        total += apply(root / "app" / name, PY_RULE, f"app/{name} (print HTML)")
    # The session cookie must only travel to this app, not to the whole osh.ai.kr site.
    total += replace_once(root / "app/security.py", "path='/')", f"path='{PREFIX}')",
                          "app/security.py cookie path")
    # Behind the loopback gateway the login rate limit must see the forwarded client address.
    total += replace_once(root / "run.py", "proxy_headers=False",
                          "proxy_headers=True, forwarded_allow_ips='127.0.0.1'",
                          "run.py forwarded client")
    (root / NOTE).write_text(
        f"This tree was patched by ai-api/scripts/patch_chemreg.py to serve under {PREFIX}/ on\n"
        "osh.ai.kr. Links in app/static/*.js, index.html and the print pages in app/labels.py\n"
        "and app/msds.py carry the prefix; the session cookie path and uvicorn proxy headers\n"
        "changed too. Routes are unchanged. Re-run the script on every new release.\n",
        encoding="utf-8",
    )
    print(f"done: {total} change(s); note written to {NOTE}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]))
