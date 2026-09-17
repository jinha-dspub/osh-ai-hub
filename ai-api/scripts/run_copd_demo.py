"""Launch the imported COPD reference app on loopback; never print credentials."""

import argparse
import os
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_ROOT))
from app.secrets import read_gemini_api_key


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", choices=("local", "gemini"), default="local")
    parser.add_argument("--port", type=int, default=8101)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("port must be between 1024 and 65535")
    env = os.environ.copy()
    env["BACKEND"] = args.backend
    env.setdefault("OLLAMA", "http://127.0.0.1:11435")
    if args.backend == "gemini":
        try:
            env["GEMINI_API_KEY"] = read_gemini_api_key()
        except RuntimeError as error:
            parser.error(str(error))
    os.chdir(API_ROOT.parent / "opendata/copd/demo/webapp")
    os.execve(sys.executable, [sys.executable, "-m", "uvicorn", "app:app",
                            "--host", "127.0.0.1", "--port", str(args.port)], env)


if __name__ == "__main__":
    main()
