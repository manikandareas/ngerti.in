"""Reuse the existing sole credential writer for a fixed real-model acceptance route."""

import argparse
import importlib.util
import json
import os
import signal
import threading
from pathlib import Path

from ngertiin_engine.provider_secrets import Vault

ROOT = Path(__file__).resolve().parents[3]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--private", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    if args.private.exists() or args.evidence.exists():
        raise ValueError("Choose fresh output paths")
    spec = importlib.util.spec_from_file_location(
        "existing_relay", ROOT / "scripts/spikes/nma030/provider_relay.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    owners = json.loads(args.metadata.read_text())
    owner = next(
        row
        for row in owners
        if any(
            c["provider"] == "chatgpt" and c["status"] == "connected"
            for c in row["connections"]
        )
    )
    connection = next(
        c
        for c in owner["connections"]
        if c["provider"] == "chatgpt" and c["status"] == "connected"
    )
    partition = json.loads(Path(owner["partition_file"]).read_text())[owner["owner"]]
    vault = Vault(Path(partition["key_file"]).parent, owner["owner"])
    server, private, evidence = module.prepare(
        vault,
        owner["owner"],
        partition,
        connection["connection_id"],
        "chatgpt",
        "gpt-6-luna",
    )
    args.private.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor = os.open(args.private, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        json.dump(private, stream)
    stopped = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    print(
        "Fixed Luna-only relay ready; renewable credentials remain with the original gateway.",
        flush=True,
    )
    try:
        while not stopped.wait(2):
            args.evidence.write_text(json.dumps(evidence, indent=2) + "\n")
    finally:
        server.shutdown()
        server.server_close()
        args.evidence.write_text(json.dumps(evidence, indent=2) + "\n")
        args.private.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
