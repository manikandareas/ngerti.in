"""Compatibility command for checks on the active server and retained web source."""

import os
from pathlib import Path

if __name__ == "__main__":
    os.chdir(Path(__file__).resolve().parents[1])
    os.execvp("bun", ["bun", "run", "check"])
