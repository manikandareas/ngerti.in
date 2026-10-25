"""Disposable NMA-028 preservation rehearsal; never start the original profile."""

import argparse
import fcntl
import hashlib
import io
import json
import os
import shutil
import sqlite3
import stat
import subprocess
import sys
import tarfile
from contextlib import ExitStack, closing
from pathlib import Path
from uuid import uuid4

from isolated_tools import DEFAULT_IMAGE, IsolatedTools, Scope, ScopeRefused

ROOT = Path(__file__).resolve().parents[3]
ENGINE = ROOT / "apps/engine/src"
sys.path.insert(0, str(ENGINE))
from ngertiin_engine.backup import MANIFEST, QUARANTINE, backup, inspect, restore


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_manifest(home):
    rows = {}
    for path in sorted(home.rglob("*")):
        relative = str(path.relative_to(home))
        mode = path.lstat().st_mode
        if stat.S_ISREG(mode):
            rows[relative] = {
                "kind": "file",
                "bytes": path.stat().st_size,
                "sha256": sha(path.read_bytes()),
            }
        elif stat.S_ISLNK(mode):
            rows[relative] = {
                "kind": "symlink",
                "target_sha256": sha(os.readlink(path).encode()),
            }
        elif not stat.S_ISDIR(mode) and not stat.S_ISSOCK(mode):
            raise ValueError("Unsupported source special file")
    return rows


def table_digests(home):
    result = {}
    for path in sorted(home.rglob("*")):
        if not path.is_file() or path.is_symlink():
            continue
        with path.open("rb") as stream:
            if stream.read(16) != b"SQLite format 3\x00":
                continue
        with closing(
            sqlite3.connect(f"{path.as_uri()}?mode=ro&immutable=1", uri=True)
        ) as db:
            tables = db.execute(
                "SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name"
            ).fetchall()
            summaries = {}
            for name, ddl in tables:
                values = []
                for row in db.execute(
                    'SELECT * FROM "' + name.replace('"', '""') + '"'
                ):
                    encoded = [
                        {"blob_hex": value.hex()} if isinstance(value, bytes) else value
                        for value in row
                    ]
                    values.append(
                        json.dumps(
                            encoded,
                            sort_keys=True,
                            ensure_ascii=False,
                            separators=(",", ":"),
                        )
                    )
                summaries[name] = {
                    "rows": len(values),
                    "rows_sha256": sha("\n".join(sorted(values)).encode()),
                    "ddl_sha256": sha((ddl or "").encode()),
                }
            result[str(path.relative_to(home))] = summaries
    return result


def profile_rehearsal(original, work, owner, source):
    """Copy a stopped profile under read-only file locks, then work only on copy."""
    original = original.resolve()
    staging = work / "original-profile-copy"
    before = file_manifest(original)
    locks = sorted({original / "gateway.lock", *original.rglob("gateway.lock")})
    if any(not lock.is_file() or lock.is_symlink() for lock in locks):
        raise ValueError("Original must already have ordinary gateway locks")
    with ExitStack() as stack:
        for path in locks:
            handle = stack.enter_context(path.open("rb"))
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Preserve all regular persistent bytes; sockets are ephemeral transport.
        staging.mkdir(mode=0o700)
        for path in sorted(original.rglob("*")):
            target = staging / path.relative_to(original)
            mode = path.lstat().st_mode
            if stat.S_ISLNK(mode):
                raise ValueError("Original symlink needs an explicit preservation plan")
            if stat.S_ISSOCK(mode):
                continue
            if stat.S_ISDIR(mode):
                target.mkdir(mode=0o700, exist_ok=True)
            elif stat.S_ISREG(mode):
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                shutil.copy2(path, target)
        if file_manifest(original) != before:
            raise ValueError("Original changed while copying; no restore attempted")
    # WAL is normalized only in the private copy. No original SQLite connection
    # is opened and no original database, WAL or shared-memory byte is changed.
    for path in staging.rglob("*"):
        if path.is_file():
            with path.open("rb") as stream:
                is_sqlite = stream.read(16) == b"SQLite format 3\x00"
            if is_sqlite:
                with closing(sqlite3.connect(path)) as db:
                    if db.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()[0]:
                        raise ValueError("Copied SQLite checkpoint busy")
    initial = inspect(staging)
    if initial["owner_id"] != owner:
        raise ValueError("Unexpected original profile owner")
    logical = table_digests(staging)
    snapshot = work / "profile-snapshot"
    manifest = backup(staging, snapshot)
    restored = work / "profile-restored-held"
    assert restore(snapshot, restored, owner) == initial
    assert table_digests(restored) == logical
    assert (restored / QUARANTINE).is_file()
    refusal = subprocess.run(
        [sys.executable, "-m", "ngertiin_engine.service"],
        env={
            "PATH": os.environ["PATH"],
            "HERMES_SOURCE": str(source.resolve()),
            "HERMES_HOME": str(restored),
            "NMA_OWNER_ID": owner,
            "PYTHONPATH": os.pathsep.join((str(ENGINE), str(source.resolve()))),
            "HERMES_DISABLE_LAZY_INSTALLS": "1",
        },
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert refusal.returncode != 0 and "RESTORE_QUARANTINED" in refusal.stderr
    assert file_manifest(original) == before
    return {
        "original_regular_files": len(before),
        "original_byte_hashes_unchanged": True,
        "source_manifest_sha256": sha(json.dumps(before, sort_keys=True).encode()),
        "snapshot_manifest_sha256": sha((snapshot / MANIFEST).read_bytes()),
        "source_owner": owner,
        "schema_version": initial["schema_version"],
        "table_digests": logical,
        "restored_tables_identical": True,
        "quarantine_refused_startup": True,
        "startup_returncode": refusal.returncode,
        "backup_files": len(manifest["files"]),
        "original_started": False,
        "model_or_provider_calls": 0,
        "private_backup_path": str(snapshot),
    }


def volume_archive(client, target):
    command = [
        "docker",
        "run",
        "--rm",
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--user",
        "10001",
        "--mount",
        "type=volume,src=" + target["volume"] + ",dst=/work,readonly",
        "--entrypoint",
        "/bin/tar",
        client.image,
        "-C",
        "/work",
        "-cf",
        "-",
        ".",
    ]
    result = subprocess.run(command, capture_output=True, check=True, timeout=60)
    return result.stdout


def volume_restore(client, scope, target, archive):
    with tarfile.open(fileobj=io.BytesIO(archive)) as content:
        for member in content.getmembers():
            if Path(member.name).is_absolute() or ".." in Path(member.name).parts:
                raise ValueError("Unsafe scoped archive path")
    client._docker(
        "volume",
        "create",
        "--label",
        client.label,
        "--label",
        "nma028.scope=" + scope.key,
        target["volume"],
    )
    client._docker(
        "run",
        "--rm",
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--cap-add",
        "CHOWN",
        "--cap-add",
        "FOWNER",
        "--security-opt",
        "no-new-privileges",
        "--user",
        "0",
        "--mount",
        "type=volume,src=" + target["volume"] + ",dst=/work",
        "--entrypoint",
        "/opt/native/bin/python",
        client.image,
        "-c",
        "import os;os.chmod('/work',0o700);os.chown('/work',10001,10001)",
    )
    command = [
        "docker",
        "run",
        "--rm",
        "-i",
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--user",
        "10001",
        "--mount",
        "type=volume,src=" + target["volume"] + ",dst=/work",
        "--entrypoint",
        "/bin/tar",
        client.image,
        "-C",
        "/work",
        "--no-same-owner",
        "-xf",
        "-",
    ]
    subprocess.run(command, input=archive, capture_output=True, check=True, timeout=60)


def native_rehearsal(work, image):
    owner, agent, thread = (str(uuid4()) for _ in range(3))
    scope = Scope(owner, agent, thread)
    original = IsolatedTools(work / "native-controller", owner, image=image)
    restored = None
    try:
        args = {"command": "printf x >> /work/effect-count; cat /work/effect-count"}
        receipt = original.invoke(scope, "preserved-effect", "terminal", args)
        original.invoke(
            scope,
            "preserved-file",
            "write_file",
            {
                "path": "/work/result.txt",
                "content": "Nonempty native artifact bytes survive isolated rollback.",
            },
        )
        original.pause(scope)
        target = original.ensure(scope)
        original.pause(scope)
        control_snapshot = work / "native-pre-control"
        shutil.copytree(original.control_dir, control_snapshot)
        pre_archive = volume_archive(original, target)
        (work / "native-pre-workspace.tar").write_bytes(pre_archive)
        before_files = original.inspect(scope)
        before_receipt = original.receipt(scope, "preserved-effect")
        reopened = IsolatedTools(original.control_dir, owner, image=original.image)
        assert reopened.invoke(scope, "preserved-effect", "terminal", args) == receipt
        assert reopened.file_bytes(scope, "effect-count") == b"x"
        original.invoke(
            scope,
            "post-cutover-file",
            "write_file",
            {
                "path": "/work/post-cutover.txt",
                "content": "Preserve this new write separately across rollback.",
            },
        )
        original.pause(scope)
        post_control = work / "native-post-control"
        shutil.copytree(original.control_dir, post_control)
        post_archive = volume_archive(original, target)
        (work / "native-post-workspace.tar").write_bytes(post_archive)
        original.cancel(scope)
        original.cleanup()
        restored_control = work / "native-restored-control"
        shutil.copytree(control_snapshot, restored_control)
        restored = IsolatedTools(restored_control, owner, image=original.image)
        volume_restore(restored, scope, target, pre_archive)
        assert restored.receipt(scope, "preserved-effect") == before_receipt
        assert restored.invoke(scope, "preserved-effect", "terminal", args) == receipt
        assert restored.inspect(scope) == before_files
        assert restored.file_bytes(scope, "effect-count") == b"x"
        assert (
            restored.file_bytes(scope, "result.txt")
            == b"Nonempty native artifact bytes survive isolated rollback."
        )
        with tarfile.open(fileobj=io.BytesIO(post_archive)) as tar:
            assert (
                tar.extractfile("./post-cutover.txt").read()
                == b"Preserve this new write separately across rollback."
            )
        try:
            original.invoke(
                scope, "stale-old-controller", "terminal", {"command": "printf no"}
            )
        except ScopeRefused:
            old_fenced = True
        else:
            raise AssertionError("Old execution authority was not fenced")
        # Chromium singleton symlinks name the old container hostname/PID. The
        # old executor is fenced and gone, so only these ephemeral ownership
        # links are reconciled before bringing up the restored browser. Cookie
        # databases, history, user files and the untouched snapshot remain intact.
        assert (
            restored._docker("inspect", target["container"], check=False).returncode
            != 0
        )
        reconciled = json.loads(
            restored._docker(
                "run",
                "--rm",
                "--network",
                "none",
                "--read-only",
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges",
                "--user",
                "10001",
                "--mount",
                "type=volume,src=" + target["volume"] + ",dst=/work",
                "--entrypoint",
                "/opt/native/bin/python",
                restored.image,
                "-c",
                """import json
from pathlib import Path
names=[]
for name in ('SingletonLock','SingletonSocket','SingletonCookie'):
 path=Path('/work/chromium')/name
 if path.is_symlink():path.unlink();names.append(name)
 elif path.exists():raise ValueError('Unexpected non-symlink ownership marker')
print(json.dumps(names))""",
            )
        )
        read = restored.invoke(
            scope, "read-after-restore", "read_file", {"path": "/work/result.txt"}
        )
        assert "Nonempty native artifact" in read
        assert restored.file_bytes(scope, "effect-count") == b"x"
        return {
            "image": original.image,
            "scope_key": scope.key,
            "owner": owner,
            "pre_workspace_sha256": sha(pre_archive),
            "post_workspace_sha256": sha(post_archive),
            "pre_controller_sha256": sha(
                json.dumps(file_manifest(control_snapshot), sort_keys=True).encode()
            ),
            "post_controller_sha256": sha(
                json.dumps(file_manifest(post_control), sort_keys=True).encode()
            ),
            "receipt_preserved": True,
            "workspace_files_preserved": True,
            "one_effect_byte_after_reopen_and_restore": True,
            "old_controller_fenced": old_fenced,
            "reconciled_ephemeral_browser_ownership_links": reconciled,
            "new_post_cutover_bytes_preserved_separately": True,
            "model_or_provider_calls": 0,
        }
    finally:
        if restored is not None:
            restored.cleanup()
        original.cleanup()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--original-home", required=True, type=Path)
    parser.add_argument("--owner", required=True)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--work-dir", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--image", default=DEFAULT_IMAGE)
    args = parser.parse_args()
    args.work_dir = args.work_dir.resolve()
    args.work_dir.mkdir(mode=0o700, parents=True, exist_ok=False)
    report = {
        "profile": profile_rehearsal(
            args.original_home, args.work_dir, args.owner, args.source
        ),
        "native": native_rehearsal(args.work_dir, args.image),
    }
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print("Read-only profile copy and isolated workspace/journal preservation passed.")
