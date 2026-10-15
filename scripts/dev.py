"""Run the three host processes together; Ctrl+C shuts down their process groups."""

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMMANDS = {
    "api": ["bun", "run", "dev:api"],
    "worker": ["bun", "run", "dev:worker"],
    "web": ["bun", "run", "dev:web"],
}


def main():
    processes = []
    stopping = False

    def stop(signum=None, frame=None):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    try:
        for name, command in COMMANDS.items():
            process = subprocess.Popen(command, cwd=ROOT, start_new_session=True)
            processes.append((name, process))
        print(
            "Ngertiin: http://localhost:3000 · API :8000 · Ctrl+C to stop", flush=True
        )
        while not stopping:
            for name, process in processes:
                if process.poll() is not None:
                    print(
                        f"{name} exited ({process.returncode}); stopping development processes.",
                        flush=True,
                    )
                    return process.returncode or 1
            time.sleep(0.3)
    finally:
        for _, process in processes:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
        for _, process in processes:
            try:
                process.wait(timeout=25)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
    return 0


if __name__ == "__main__":
    sys.exit(main())
