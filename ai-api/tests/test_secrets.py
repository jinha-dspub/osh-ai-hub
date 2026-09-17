import pytest

from app.secrets import read_gemini_api_key


def test_environment_overrides_file_without_reading_it(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "DEMO-test-key")
    monkeypatch.setenv("GEMINI_API_KEY_FILE", "/missing/never-read")
    assert read_gemini_api_key() == "DEMO-test-key"


def test_explicit_file_and_trailing_newline(tmp_path, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    path = tmp_path / "key"
    path.write_text("DEMO-test-key\n")
    monkeypatch.setenv("GEMINI_API_KEY_FILE", str(path))
    assert read_gemini_api_key() == "DEMO-test-key"


@pytest.mark.parametrize("value", ["", "DEMO-first\nDEMO-second", "DEMO key"])
def test_invalid_file_fails_without_exposing_contents(tmp_path, monkeypatch, value):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    path = tmp_path / "key"
    path.write_text(value)
    monkeypatch.setenv("GEMINI_API_KEY_FILE", str(path))
    with pytest.raises(RuntimeError) as error:
        read_gemini_api_key()
    assert "DEMO" not in str(error.value)


def test_unreadable_key_file_has_safe_error(tmp_path, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("GEMINI_API_KEY_FILE", str(tmp_path / "missing"))
    with pytest.raises(RuntimeError, match="missing or unreadable"):
        read_gemini_api_key()
