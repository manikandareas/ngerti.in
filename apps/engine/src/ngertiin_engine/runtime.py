"""Fail closed on an unreviewed source/runtime combination."""

import hashlib
import importlib.metadata
import json
import platform
import sqlite3
from functools import lru_cache
from pathlib import Path

from ngertiin_engine.contracts import EngineError


def verify(source: Path) -> dict:
    pin = json.loads((Path(__file__).with_name("runtime-pin.json")).read_text())
    if platform.python_version() != pin["python"]:
        raise EngineError("UNSUPPORTED_PYTHON")
    for name, expected in pin["source_hashes"].items():
        if hashlib.sha256((source / name).read_bytes()).hexdigest() != expected:
            raise EngineError("RUNTIME_SOURCE_MISMATCH")
    for distribution, expected in pin.get("provider_runtime_distributions", {}).items():
        if importlib.metadata.version(distribution) != expected:
            raise EngineError("PROVIDER_DEPENDENCY_MISMATCH")
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


@lru_cache(maxsize=1)
def supported_protocols():
    from ngertiin_engine.provider_manifest import PROTOCOLS

    pin = json.loads(Path(__file__).with_name("runtime-pin.json").read_text())
    supported = set(PROTOCOLS)
    for protocol, distributions in pin.get(
        "protocol_runtime_distributions", {}
    ).items():
        for distribution, expected in distributions.items():
            try:
                installed = importlib.metadata.version(distribution)
            except importlib.metadata.PackageNotFoundError:
                installed = None
            if installed != expected:
                supported.discard(protocol)
    return sorted(supported)
