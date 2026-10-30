"""Compatibility command for the single Bun development entry point."""

import os
from pathlib import Path

if __name__ == "__main__":
    os.chdir(Path(__file__).resolve().parents[1])
    os.execvp("bun", ["bun", "run", "dev"])
