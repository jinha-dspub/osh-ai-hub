"""Read server-only credentials without logging values or embedding them in errors."""

import os
from pathlib import Path

DEFAULT_GEMINI_KEY_FILE = Path(__file__).resolve().parents[2] / "local_asset/gemini_api_key.txt"


def read_gemini_api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        path = Path(os.environ.get("GEMINI_API_KEY_FILE") or DEFAULT_GEMINI_KEY_FILE)
        try:
            key = path.read_text(encoding="utf-8").strip()
        except (OSError, UnicodeError):
            raise RuntimeError("Gemini key file is missing or unreadable") from None
    if not key or any(char.isspace() for char in key):
        raise RuntimeError("Set one Gemini API key in the server environment or key file")
    return key


def read_openai_api_key() -> str:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        path = Path(
            os.environ.get("OPENAI_API_KEY_FILE")
            or DEFAULT_GEMINI_KEY_FILE.with_name("chagpt_dspubs.txt")
        )
        try:
            key = path.read_text(encoding="utf-8").strip()
        except (OSError, UnicodeError):
            raise RuntimeError("OpenAI key file is missing or unreadable") from None
    if not key or any(char.isspace() for char in key):
        raise RuntimeError("Set one OpenAI API key in the server environment or key file")
    return key
