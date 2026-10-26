"""Offline file/object/native-volume preservation rehearsal, never restore activation."""

import argparse
import hashlib
import json
import socket
import sqlite3
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/spikes/nma030"))

from ngertiin_engine.backup import QUARANTINE, backup, restore
from ngertiin_engine.native_executor import IsolatedTools, Scope
from restore_rehearsal import inventory


def files(image, volume):
    code = "import hashlib,json;from pathlib import Path;root=Path('/work');print(json.dumps({str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file() and not p.is_symlink()},sort_keys=True))"
    return json.loads(
        IsolatedTools._docker(
            "run",
            "--rm",
            "--network",
            "none",
            "--read-only",
            "--cap-drop",
            "ALL",
            "--user",
            "10001",
            "--mount",
            "type=volume,src=" + volume + ",dst=/work,readonly",
            "--entrypoint",
            "/opt/native/bin/python",
            image,
            "-c",
            code,
        )
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--private", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    meta = json.loads(args.metadata.read_text())
    home = Path(meta["root"]) / "state"
    with socket.socket(socket.AF_UNIX) as client:
        if client.connect_ex(str(home / "nma.sock")) == 0:
            raise RuntimeError("Stop the disposable gateway before backing up")
    args.private.mkdir(mode=0o700, parents=True, exist_ok=False)
    volumes = []
    for path in (home / "native-execution").glob("*/isolated-tools.db"):
        broker = IsolatedTools(path.parent, meta["owner"], image=meta["image"])
        with sqlite3.connect(path) as db:
            rows = db.execute("SELECT scope_json,volume,state FROM scopes").fetchall()
        for encoded, volume, state in rows:
            scope = Scope(**json.loads(encoded))
            if state == "ready":
                broker.pause(scope)
            before = files(meta["image"], volume)
            archive = args.private / (scope.key + ".tar")
            with archive.open("xb") as output:
                subprocess.run(
                    [
                        "docker",
                        "run",
                        "--rm",
                        "--network",
                        "none",
                        "--read-only",
                        "--cap-drop",
                        "ALL",
                        "--mount",
                        "type=volume,src=" + volume + ",dst=/work,readonly",
                        "--entrypoint",
                        "tar",
                        meta["image"],
                        "cf",
                        "-",
                        "-C",
                        "/work",
                        ".",
                    ],
                    stdout=output,
                    stderr=subprocess.PIPE,
                    check=True,
                )
            target = "nma031-restore-" + uuid4().hex
            IsolatedTools._docker(
                "volume", "create", "--label", "nma031.rehearsal=true", target
            )
            try:
                with archive.open("rb") as source:
                    subprocess.run(
                        [
                            "docker",
                            "run",
                            "--rm",
                            "-i",
                            "--network",
                            "none",
                            "--read-only",
                            "--user",
                            "0",
                            "--cap-drop",
                            "ALL",
                            "--cap-add",
                            "CHOWN",
                            "--cap-add",
                            "FOWNER",
                            "--mount",
                            "type=volume,src=" + target + ",dst=/restore",
                            "--entrypoint",
                            "tar",
                            meta["image"],
                            "xf",
                            "-",
                            "-C",
                            "/restore",
                        ],
                        stdin=source,
                        capture_output=True,
                        check=True,
                    )
                after = files(meta["image"], target)
                assert before == after
                volumes.append(
                    {
                        "source_volume": volume,
                        "archive_sha256": hashlib.sha256(
                            archive.read_bytes()
                        ).hexdigest(),
                        "regular_files": len(before),
                        "all_file_hashes_preserved": True,
                        "activation_attempted": False,
                    }
                )
            finally:
                IsolatedTools._docker("volume", "rm", target)
    before = inventory(home)
    manifest = backup(home, args.private / "partition")
    restored = args.private / "restored"
    result = restore(args.private / "partition", restored, meta["owner"])
    assert before == inventory(restored)
    assert manifest["databases"] == result["databases"]
    assert (restored / QUARANTINE).exists()
    proof = {
        "status": "passed",
        "schema_version": manifest["schema_version"],
        "partition_files": len(manifest["files"]),
        "all_domain_rows_preserved": True,
        "all_sqlite_counts_preserved": True,
        "quarantined": True,
        "activation_attempted": False,
        "native_volumes": volumes,
        "domain_tables": before,
    }
    args.evidence.write_text(json.dumps(proof, indent=2) + "\n")
    print(json.dumps({k: v for k, v in proof.items() if k != "domain_tables"}))


if __name__ == "__main__":
    main()
