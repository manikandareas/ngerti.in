"""Static checks only. Runtime acceptance is performed manually through the browser."""

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMMANDS = [
    ["bun", "run", "lint"],
    ["bun", "run", "typecheck"],
    [
        "uv",
        "run",
        "--project",
        "apps/backend",
        "ruff",
        "check",
        "apps/backend/src",
        "apps/backend/migrations",
        "scripts",
    ],
    [
        "uv",
        "run",
        "--project",
        "apps/backend",
        "ruff",
        "format",
        "--check",
        "apps/backend/src",
        "apps/backend/migrations",
        "scripts",
    ],
    [
        "uv",
        "run",
        "--project",
        "apps/backend",
        "mypy",
        "--config-file",
        "apps/backend/pyproject.toml",
        "apps/backend/src",
    ],
]

for command in COMMANDS:
    subprocess.run(command, cwd=ROOT, check=True)
