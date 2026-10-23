"""Fail closed on an unreviewed source/runtime combination."""

import hashlib
import json
import platform
import sqlite3
from pathlib import Path

from ngertiin_engine.contracts import EngineError


def verify(source: Path) -> dict:
    pin = json.loads((Path(__file__).with_name("runtime-pin.json")).read_text())
    if platform.python_version() != pin["python"]:
        raise EngineError("UNSUPPORTED_PYTHON")
    for name, expected in pin["source_hashes"].items():
        if hashlib.sha256((source / name).read_bytes()).hexdigest() != expected:
            raise EngineError("RUNTIME_SOURCE_MISMATCH")
    with sqlite3.connect(":memory:") as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("CREATE VIRTUAL TABLE probe USING fts5(content)")
        if db.execute("SELECT json_valid('{}')").fetchone()[0] != 1:
            raise EngineError("UNSUPPORTED_SQLITE")
    return {
        "revision": pin["revision"],
        "python": platform.python_version(),
        "sqlite": sqlite3.sqlite_version,
    }
