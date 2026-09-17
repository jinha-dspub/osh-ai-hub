"""Run an isolated local preview stack; no production service configuration changes."""

import os
import secrets
import signal
import socket
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main():
    for port in (3100, 8102, 11435):
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", port))
    assets = ROOT / "local_asset"
    assets.mkdir(mode=0o700, exist_ok=True)
    env = os.environ.copy()
    env["COPD_API_TOKEN"] = secrets.token_hex(32)
    env["COPD_INTERNAL_PREVIEW"] = "true"
    env["PYTHONPATH"] = str(ROOT / "ai-api")
    commands = [
        (["bash", str(ROOT / "ai-api/scripts/start_local_ollama.sh")], ROOT, "ollama"),
        (
            [
                str(ROOT / "ai-api/.venv/bin/python"),
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                "8102",
                "--no-access-log",
            ],
            ROOT / "ai-api",
            "copd-api",
        ),
        (
            [
                str(ROOT / "node_modules/node/bin/node"),
                str(ROOT / "node_modules/next/dist/bin/next"),
                "dev",
                "--hostname",
                "127.0.0.1",
                "--port",
                "3100",
            ],
            ROOT / "web",
            "copd-web",
        ),
    ]
    processes, logs = [], []

    def stop(*_):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        for command, cwd, name in commands:
            log = (assets / f"{name}.log").open("w")
            logs.append(log)
            processes.append(
                subprocess.Popen(command, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT)
            )
        print("Local preview starting: http://127.0.0.1:3100/datasets/copd", flush=True)
        print("Logs stay in local_asset; press Ctrl+C to stop this preview stack.", flush=True)
        while all(p.poll() is None for p in processes):
            time.sleep(1)
        raise RuntimeError("A preview process stopped; see local_asset logs")
    except KeyboardInterrupt:
        pass
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
        for process in processes:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        for log in logs:
            log.close()


if __name__ == "__main__":
    main()
