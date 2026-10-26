"""Immutable, hash-verified files outside text rows, with scoped resumable uploads."""

import base64
import hashlib
import os
import re
import unicodedata
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import EngineError, uuid

MAX_FILE_BYTES = 32 * 1024 * 1024
PART_BYTES = 512 * 1024
DDL = (
    "CREATE TABLE nma_native_job_events (owner_id TEXT NOT NULL, scope_key TEXT NOT NULL, handle TEXT NOT NULL, state TEXT NOT NULL, receipt TEXT NOT NULL, PRIMARY KEY(owner_id,scope_key,handle,state))",
    "CREATE TABLE nma_files (owner_id TEXT NOT NULL, artifact_id TEXT NOT NULL, thread_id TEXT NOT NULL, producing_run_id TEXT, producing_agent_id TEXT, revision_id TEXT NOT NULL, filename TEXT NOT NULL, media_type TEXT NOT NULL, sha256 TEXT NOT NULL, byte_count INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('uploading','ready')), PRIMARY KEY(owner_id,artifact_id), FOREIGN KEY(owner_id,thread_id) REFERENCES nma_threads(owner_id,thread_id))",
    "CREATE TABLE nma_file_grants (owner_id TEXT NOT NULL, artifact_id TEXT NOT NULL, target_thread_id TEXT NOT NULL, active INTEGER NOT NULL, PRIMARY KEY(owner_id,artifact_id,target_thread_id), FOREIGN KEY(owner_id,artifact_id) REFERENCES nma_files(owner_id,artifact_id))",
    "CREATE TABLE nma_message_files (owner_id TEXT NOT NULL, message_id TEXT NOT NULL, artifact_id TEXT NOT NULL, PRIMARY KEY(owner_id,message_id,artifact_id), FOREIGN KEY(owner_id,message_id) REFERENCES nma_messages(owner_id,message_id), FOREIGN KEY(owner_id,artifact_id) REFERENCES nma_files(owner_id,artifact_id))",
)


def filename(value):
    try:
        size = len(value.encode()) if isinstance(value, str) else 0
    except UnicodeError:
        raise EngineError("INVALID_REQUEST") from None
    if (
        not isinstance(value, str)
        or not 1 <= size <= 240
        or value in {".", ".."}
        or any(c in value for c in "/\\")
        or any(unicodedata.category(c).startswith("C") for c in value)
    ):
        raise EngineError("INVALID_REQUEST")
    return value


class Files:
    def __init__(self, store):
        self.store = store
        # This is the gateway partition, never a model-provided host path.
        self.root = Path(os.environ["HERMES_HOME"]) / "files"

    def object_path(self, sha):
        if not isinstance(sha, str) or not re.fullmatch("[a-f0-9]{64}", sha):
            raise EngineError("INVALID_REQUEST")
        return self.root / "objects" / sha[:2] / sha

    def get(self, conn, identity, *, thread_id=None):
        row = conn.execute(
            "SELECT artifact_id,thread_id,producing_run_id,producing_agent_id,revision_id,filename,media_type,sha256,byte_count,state FROM nma_files WHERE owner_id=? AND artifact_id=?",
            (self.store.owner, uuid(identity)),
        ).fetchone()
        if not row or row[9] != "ready":
            raise EngineError("NOT_FOUND")
        if (
            thread_id is not None
            and row[1] != thread_id
            and not conn.execute(
                "SELECT 1 FROM nma_file_grants WHERE owner_id=? AND artifact_id=? AND target_thread_id=? AND active=1",
                (self.store.owner, identity, thread_id),
            ).fetchone()
        ):
            raise EngineError("NOT_FOUND")
        item = dict(
            zip(
                (
                    "artifact_id",
                    "thread_id",
                    "producing_run_id",
                    "producing_agent_id",
                    "revision_id",
                    "filename",
                    "media_type",
                    "sha256",
                    "byte_count",
                    "status",
                ),
                row,
            )
        )
        item["storage"] = "file.v1"
        return item

    def listing(self, conn, thread_id):
        rows = conn.execute(
            "SELECT artifact_id FROM nma_files f WHERE owner_id=? AND state='ready' AND (thread_id=? OR EXISTS (SELECT 1 FROM nma_file_grants g WHERE g.owner_id=f.owner_id AND g.artifact_id=f.artifact_id AND g.target_thread_id=? AND active=1)) ORDER BY rowid DESC LIMIT 100",
            (self.store.owner, thread_id, thread_id),
        ).fetchall()
        return [self.get(conn, row[0], thread_id=thread_id) for row in rows]

    @staticmethod
    def atomic(path, data):
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        temporary = path.with_name(path.name + "." + os.urandom(8).hex())
        try:
            with temporary.open("xb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            # Immutable slots: a retry must match the bytes already committed.
            try:
                os.link(temporary, path)
            except FileExistsError:
                if path.read_bytes() != data:
                    raise EngineError("COMMAND_CONFLICT") from None
            descriptor = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
        finally:
            temporary.unlink(missing_ok=True)

    def upload(self, kind, payload, threads):
        identity = uuid(payload.get("artifact_id"))
        if kind == "file.begin":
            if set(payload) != {
                "artifact_id",
                "thread_id",
                "filename",
                "media_type",
                "sha256",
                "byte_count",
            }:
                raise EngineError("INVALID_REQUEST")
            filename(payload["filename"])
            self.object_path(payload["sha256"])
            size, media = payload["byte_count"], payload["media_type"]
            if type(size) is not int or not 0 <= size <= MAX_FILE_BYTES:
                raise EngineError("REQUEST_TOO_LARGE")
            if not isinstance(media, str) or not re.fullmatch(
                r"[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+", media
            ):
                raise EngineError("INVALID_REQUEST")

            def begin(conn):
                threads.get(conn, uuid(payload["thread_id"]))
                if conn.execute(
                    "SELECT 1 FROM nma_artifacts WHERE owner_id=? AND artifact_id=?",
                    (self.store.owner, identity),
                ).fetchone():
                    raise EngineError("COMMAND_CONFLICT")
                values = (
                    self.store.owner,
                    identity,
                    payload["thread_id"],
                    None,
                    None,
                    str(uuid5(NAMESPACE_URL, identity + ":1")),
                    payload["filename"],
                    media,
                    payload["sha256"],
                    size,
                )
                previous = conn.execute(
                    "SELECT * FROM nma_files WHERE owner_id=? AND artifact_id=?",
                    (self.store.owner, identity),
                ).fetchone()
                if previous and tuple(previous[:10]) != values:
                    raise EngineError("COMMAND_CONFLICT")
                if not previous:
                    conn.execute(
                        "INSERT INTO nma_files VALUES (?,?,?,?,?,?,?,?,?,?,'uploading')",
                        values,
                    )
                return {
                    "artifact_id": identity,
                    "status": previous[10] if previous else "uploading",
                    "part_bytes": PART_BYTES,
                }

            return self.store.write(begin)

        row = self.store.write(
            lambda conn: conn.execute(
                "SELECT thread_id,sha256,byte_count,state FROM nma_files WHERE owner_id=? AND artifact_id=?",
                (self.store.owner, identity),
            ).fetchone()
        )
        if not row:
            raise EngineError("NOT_FOUND")
        self.store.write(lambda conn: threads.get(conn, row[0]))
        staging = self.root / "uploads" / identity
        count = (row[2] + PART_BYTES - 1) // PART_BYTES
        if kind == "file.part":
            if (
                set(payload) != {"artifact_id", "index", "data_base64"}
                or type(payload["index"]) is not int
                or not 0 <= payload["index"] < count
            ):
                raise EngineError("INVALID_REQUEST")
            try:
                data = base64.b64decode(payload["data_base64"], validate=True)
            except (ValueError, TypeError):
                raise EngineError("INVALID_REQUEST") from None
            expected = min(PART_BYTES, row[2] - payload["index"] * PART_BYTES)
            if len(data) != expected:
                raise EngineError("INVALID_REQUEST")
            if row[3] == "ready":
                with self.object_path(row[1]).open("rb") as stream:
                    stream.seek(payload["index"] * PART_BYTES)
                    if stream.read(expected) != data:
                        raise EngineError("COMMAND_CONFLICT")
            else:
                self.atomic(staging / str(payload["index"]), data)
            return {
                "artifact_id": identity,
                "index": payload["index"],
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        if kind != "file.finalize" or set(payload) != {"artifact_id"}:
            raise EngineError("INVALID_REQUEST")
        if row[3] != "ready":
            try:
                data = b"".join((staging / str(i)).read_bytes() for i in range(count))
            except FileNotFoundError:
                raise EngineError("UPLOAD_INCOMPLETE") from None
            if len(data) != row[2] or hashlib.sha256(data).hexdigest() != row[1]:
                raise EngineError("FILE_HASH_MISMATCH")
            self.atomic(self.object_path(row[1]), data)
            self.store.write(
                lambda conn: conn.execute(
                    "UPDATE nma_files SET state='ready' WHERE owner_id=? AND artifact_id=?",
                    (self.store.owner, identity),
                )
            )
        # Retried parts are reconciled against the retained immutable object.
        # Only finalized upload staging is disposable; retained objects stay intact.
        if staging.exists():
            for index in range(count):
                (staging / str(index)).unlink(missing_ok=True)
            try:
                staging.rmdir()
            except OSError:
                pass
        return self.store.write(lambda conn: self.get(conn, identity))

    def read(self, payload):
        if set(payload) not in (
            {"artifact_id", "offset"},
            {"artifact_id", "offset", "thread_id"},
        ):
            raise EngineError("INVALID_REQUEST")
        offset = payload["offset"]
        if type(offset) is not int or offset < 0:
            raise EngineError("INVALID_REQUEST")
        item = self.store.write(
            lambda conn: self.get(
                conn, payload["artifact_id"], thread_id=payload.get("thread_id")
            )
        )
        data = self.bytes(item)
        return {
            **item,
            "offset": offset,
            "data_base64": base64.b64encode(
                data[offset : offset + PART_BYTES]
            ).decode(),
        }

    def bytes(self, item):
        try:
            data = self.object_path(item["sha256"]).read_bytes()
        except FileNotFoundError:
            raise EngineError("ARTIFACT_CORRUPT") from None
        if (
            len(data) != item["byte_count"]
            or hashlib.sha256(data).hexdigest() != item["sha256"]
        ):
            raise EngineError("ARTIFACT_CORRUPT")
        return data

    def publish(self, conn, operation, config, run_id, name, media_type, data):
        filename(name)
        if len(data) > MAX_FILE_BYTES:
            raise EngineError("REQUEST_TOO_LARGE")
        sha = hashlib.sha256(data).hexdigest()
        self.atomic(self.object_path(sha), data)
        identity = str(uuid5(NAMESPACE_URL, self.store.owner + ":file:" + operation))
        values = (
            self.store.owner,
            identity,
            config["thread_id"],
            run_id,
            config["agent_id"],
            str(uuid5(NAMESPACE_URL, identity + ":1")),
            name,
            media_type,
            sha,
            len(data),
        )
        conn.execute(
            "INSERT INTO nma_files VALUES (?,?,?,?,?,?,?,?,?,?,'ready')", values
        )
        return self.get(conn, identity)

    def attachments(self, conn, thread_id, identities, message_id=None):
        if (
            not isinstance(identities, list)
            or len(identities) > 10
            or any(not isinstance(identity, str) for identity in identities)
            or len(set(identities)) != len(identities)
        ):
            raise EngineError("INVALID_REQUEST")
        items = [
            self.get(conn, identity, thread_id=thread_id) for identity in identities
        ]
        if message_id:
            for item in items:
                conn.execute(
                    "INSERT OR IGNORE INTO nma_message_files VALUES (?,?,?)",
                    (self.store.owner, message_id, item["artifact_id"]),
                )
        return items

    def share(self, conn, identity, target, active):
        conn.execute(
            "INSERT INTO nma_file_grants VALUES (?,?,?,?) ON CONFLICT(owner_id,artifact_id,target_thread_id) DO UPDATE SET active=excluded.active",
            (self.store.owner, identity, target, int(active)),
        )

    def inventory(self):
        """Report retained/staged objects; cleanup is explicit and never deletes ready files."""
        result = self.store.write(
            lambda conn: {
                "files": [
                    dict(zip(("artifact_id", "sha256", "byte_count", "state"), r))
                    for r in conn.execute(
                        "SELECT artifact_id,sha256,byte_count,state FROM nma_files WHERE owner_id=?",
                        (self.store.owner,),
                    )
                ],
                "storage": "partition/files",
                "backup": "include the complete files directory under the stopped partition lock",
            }
        )
        referenced = {item["sha256"] for item in result["files"]}
        result["orphan_objects"] = [
            path.name
            for path in (self.root / "objects").glob("*/*")
            if path.is_file() and path.name not in referenced
        ]
        result["staged_uploads"] = [
            path.name for path in (self.root / "uploads").glob("*") if path.is_dir()
        ]
        result["orphan_policy"] = (
            "Retain unreferenced objects for reconciliation; never publish or remove them implicitly. Finalized staging is cleaned idempotently."
        )
        return result
