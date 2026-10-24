"""Offline, complete owner-partition snapshots with quarantined restore.

The operator must stop ingress and the gateway before calling this tool. Native
profile locks stay held throughout copying. External workspaces and secret files
remain separate backup obligations; this tool never replays external effects.
"""

import argparse
import fcntl
import hashlib
import json
import os
import shutil
import sqlite3
import stat
from contextlib import ExitStack, closing
from pathlib import Path

QUARANTINE = "nma-restore-quarantine.json"
MANIFEST = "nma-backup-manifest.json"


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def inspect(home):
    """Validate every SQLite store and report counts without exporting content."""
    databases = {}
    for path in sorted(home.rglob("*")):
        if not path.is_file() or path.is_symlink():
            continue
        with path.open("rb") as stream:
            if stream.read(16) != b"SQLite format 3\x00":
                continue
        with closing(
            sqlite3.connect(f"{path.as_uri()}?mode=ro&immutable=1", uri=True)
        ) as db:
            if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                raise ValueError("SQLite integrity check failed")
            if db.execute("PRAGMA foreign_key_check").fetchall():
                raise ValueError("SQLite foreign key check failed")
            tables = [
                r[0]
                for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")
            ]
            counts = {
                name: db.execute(
                    'SELECT count(*) FROM "' + name.replace('"', '""') + '"'
                ).fetchone()[0]
                for name in tables
            }
            databases[str(path.relative_to(home))] = counts
    with closing(
        sqlite3.connect(f"{(home / 'state.db').as_uri()}?mode=ro&immutable=1", uri=True)
    ) as db:
        rows = db.execute(
            "SELECT owner_id, schema_version FROM nma_partition"
        ).fetchall()
        if len(rows) != 1:
            raise ValueError("Expected one owner partition")
    return {
        "owner_id": rows[0][0],
        "schema_version": rows[0][1],
        "databases": databases,
    }


def backup(home, destination):
    home, destination = home.resolve(), destination.resolve()
    if destination.is_relative_to(home) or destination.exists():
        raise ValueError("Backup requires a new directory outside the owner partition")
    if not (home / "state.db").is_file():
        raise ValueError("Owner partition is missing")
    with ExitStack() as stack:
        locks = {home / "gateway.lock", *home.rglob("gateway.lock")}
        for lock in sorted(locks):
            if lock.is_symlink():
                raise ValueError("Symlink lock is unsupported")
            handle = stack.enter_context(lock.open("a+"))
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        destination.mkdir(mode=0o700)
        files = {}
        try:
            for source in sorted(home.rglob("*")):
                relative = source.relative_to(home)
                mode = source.lstat().st_mode
                if stat.S_ISLNK(mode):
                    raise ValueError(
                        "Partition symlinks require a separate explicit backup"
                    )
                if stat.S_ISSOCK(mode):
                    continue
                target = destination / relative
                if stat.S_ISDIR(mode):
                    target.mkdir(mode=0o700, exist_ok=True)
                elif stat.S_ISREG(mode):
                    if str(relative) == MANIFEST:
                        continue
                    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                    shutil.copy2(source, target)
                    files[str(relative)] = digest(target)
                else:
                    raise ValueError("Unsupported special file in partition")
            # Normalize copied WAL stores without writing to the source partition.
            for name in list(files):
                target = destination / name
                if not target.is_file():
                    continue
                with target.open("rb") as stream:
                    sqlite_file = stream.read(16) == b"SQLite format 3\x00"
                if sqlite_file:
                    with closing(sqlite3.connect(target)) as db:
                        if db.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()[0]:
                            raise ValueError("Backup checkpoint is busy")
            files = {
                str(path.relative_to(destination)): digest(path)
                for path in sorted(destination.rglob("*"))
                if path.is_file()
            }
            manifest = {"format": 1, **inspect(destination), "files": files}
            (destination / MANIFEST).write_text(json.dumps(manifest, indent=2) + "\n")
            for path in destination.rglob("*"):
                if path.is_file():
                    with path.open("rb") as stream:
                        os.fsync(stream.fileno())
            for directory in sorted(
                (p for p in destination.rglob("*") if p.is_dir()), reverse=True
            ):
                sync_directory(directory)
            sync_directory(destination)
            sync_directory(destination.parent)
            return manifest
        except BaseException:
            shutil.rmtree(destination)
            raise


def restore(snapshot, destination, owner):
    snapshot, destination = snapshot.resolve(), destination.resolve()
    manifest = json.loads((snapshot / MANIFEST).read_text())
    if manifest["format"] != 1 or manifest["owner_id"] != owner:
        raise ValueError("Backup owner or format mismatch")
    if destination.exists() or destination.is_relative_to(snapshot):
        raise ValueError("Restore requires a new directory outside the snapshot")
    if any(p.is_symlink() for p in snapshot.rglob("*")):
        raise ValueError("Backup symlinks are unsupported")
    actual = {
        str(p.relative_to(snapshot))
        for p in snapshot.rglob("*")
        if p.is_file() and p.name != MANIFEST
    }
    if actual != set(manifest["files"]):
        raise ValueError("Backup inventory mismatch")
    for name, checksum in manifest["files"].items():
        path = snapshot / name
        if (
            not path.resolve().is_relative_to(snapshot)
            or path.is_symlink()
            or digest(path) != checksum
        ):
            raise ValueError("Backup checksum or path mismatch")
    if inspect(snapshot) != {
        key: manifest[key] for key in ("owner_id", "schema_version", "databases")
    }:
        raise ValueError("Backup database inventory mismatch")
    # Install the durable fence before any executable state reaches the destination.
    destination.mkdir(mode=0o700)
    marker = destination / QUARANTINE
    with marker.open("w") as stream:
        json.dump(
            {"owner_id": owner, "reason": "Operator reconciliation required"}, stream
        )
        stream.flush()
        os.fsync(stream.fileno())
    sync_directory(destination)
    sync_directory(destination.parent)
    shutil.copytree(snapshot, destination, symlinks=False, dirs_exist_ok=True)
    (destination / MANIFEST).unlink()
    return inspect(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    save = sub.add_parser("backup")
    save.add_argument("home", type=Path)
    save.add_argument("destination", type=Path)
    load = sub.add_parser("restore")
    load.add_argument("snapshot", type=Path)
    load.add_argument("destination", type=Path)
    load.add_argument("--owner", required=True)
    args = parser.parse_args()
    result = (
        backup(args.home, args.destination)
        if args.action == "backup"
        else restore(args.snapshot, args.destination, args.owner)
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
