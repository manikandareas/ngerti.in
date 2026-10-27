"""Complete native skill packages with immutable revisions and scoped materialization."""

import base64
import hashlib
import json
import os
import tempfile
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path, PurePosixPath

from ngertiin_engine.context import now
from ngertiin_engine.contracts import EngineError, canonical, digest
from ngertiin_engine.learning_store import identity, namespace

settings = ContextVar("nma_skill_settings", default=None)


def catalog():
    return json.loads(Path(__file__).with_name("skill-catalog.json").read_text())


def checked_path(name):
    if (
        not isinstance(name, str)
        or not name
        or PurePosixPath(name).is_absolute()
        or ".." in PurePosixPath(name).parts
        or "\\" in name
        or any(ord(c) < 32 for c in name)
    ):
        raise EngineError("INVALID_SKILL_PATH")
    return name


def encode_package(root):
    files, total = {}, 0
    for path in sorted(root.rglob("*")):
        if "__pycache__" in path.parts:
            continue
        if path.is_symlink():
            raise EngineError("INVALID_SKILL_PATH")
        if not path.is_file():
            continue
        data = path.read_bytes()
        total += len(data)
        if len(data) > 1024 * 1024 or total > 8 * 1024 * 1024 or len(files) >= 256:
            raise EngineError("SKILL_PACKAGE_TOO_LARGE")
        files[checked_path(str(path.relative_to(root)))] = {
            "data": base64.b64encode(data).decode(),
            "sha256": hashlib.sha256(data).hexdigest(),
            "executable": path.suffix in {".py", ".sh"},
        }
    if "SKILL.md" not in files:
        raise EngineError("INVALID_SKILL_PACKAGE")
    return files


def decode(item):
    data = base64.b64decode(item["data"], validate=True)
    if hashlib.sha256(data).hexdigest() != item["sha256"]:
        raise EngineError("SKILL_PACKAGE_CORRUPT")
    return data


class Skills:
    def __init__(self, store, contexts):
        self.store, self.contexts = store, contexts

    def listing(self, conn, scope, *, archived=False):
        thread = self.contexts.scope(conn, **scope)
        rows = conn.execute(
            "SELECT e.skill_id,e.name,e.revision,e.status,e.origin,e.catalog_id,r.files,r.provenance FROM nma_skill_entries e JOIN nma_skill_revisions r USING(owner_id,skill_id,revision) WHERE e.owner_id=? AND e.namespace=? AND (? OR e.status='active') ORDER BY e.name",
            (self.store.owner, namespace(scope, thread), archived),
        ).fetchall()
        return [
            {
                **dict(
                    zip(
                        (
                            "skill_id",
                            "name",
                            "revision",
                            "status",
                            "origin",
                            "catalog_id",
                            "files",
                            "provenance",
                        ),
                        row,
                    )
                ),
                "revision": str(row[2]),
                "files": json.loads(row[6]),
                "provenance": json.loads(row[7]),
            }
            for row in rows
        ]

    def save(
        self,
        conn,
        scope,
        name,
        files,
        provenance,
        *,
        origin="learned",
        catalog_id=None,
        expected=None,
        status="active",
    ):
        checked_path(name)
        if "/" in name or len(name) > 64:
            raise EngineError("INVALID_SKILL_PATH")
        thread = self.contexts.scope(conn, **scope)
        ns = namespace(scope, thread)
        row = conn.execute(
            "SELECT skill_id,revision FROM nma_skill_entries WHERE owner_id=? AND namespace=? AND name=?",
            (self.store.owner, ns, name),
        ).fetchone()
        if row and expected != str(row[1]):
            raise EngineError("REVISION_CONFLICT")
        skill_id, revision = (
            (row[0], row[1] + 1) if row else (identity(self.store.owner, ns, name), 1)
        )
        if row:
            conn.execute(
                "UPDATE nma_skill_entries SET revision=?,status=?,updated_at=? WHERE owner_id=? AND skill_id=?",
                (revision, status, now(), self.store.owner, skill_id),
            )
        else:
            conn.execute(
                "INSERT INTO nma_skill_entries VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    self.store.owner,
                    skill_id,
                    ns,
                    name,
                    revision,
                    status,
                    origin,
                    catalog_id,
                    now(),
                    now(),
                ),
            )
        conn.execute(
            "INSERT INTO nma_skill_revisions VALUES (?,?,?,?,?,?)",
            (
                self.store.owner,
                skill_id,
                revision,
                canonical(files),
                canonical(provenance),
                now(),
            ),
        )
        return {
            "skill_id": skill_id,
            "name": name,
            "revision": str(revision),
            "status": status,
        }

    def install(self, conn, scope, payload, provenance, expected=None):
        entry = next(
            (e for e in catalog()["entries"] if e["id"] == payload.get("catalog_id")),
            None,
        )
        if not entry or entry["classification"] == "excluded":
            raise EngineError("SKILL_UNAVAILABLE")
        path = Path(os.environ["HERMES_SOURCE"]) / entry["source"]
        files = encode_package(path)
        if {name: item["sha256"] for name, item in files.items()} != entry["assets"]:
            raise EngineError("RUNTIME_SOURCE_MISMATCH")
        if entry["name"] == "docx":
            # The pinned replacement helper reprocesses inserted text when the
            # replacement contains its own needle. Keep the upstream bytes and
            # manifest intact; version this narrow, reviewed integration fix.
            replacement = Path(__file__).with_name("skill_overrides") / "docx_common.py"
            data = replacement.read_bytes()
            files["scripts/docx_common.py"] = {
                "data": base64.b64encode(data).decode(),
                "sha256": hashlib.sha256(data).hexdigest(),
                "executable": True,
            }
            provenance = {
                **provenance,
                "integration_overrides": {
                    "scripts/docx_common.py": files["scripts/docx_common.py"]["sha256"]
                },
            }
        installed = next(
            (
                i
                for i in self.listing(conn, scope, archived=True)
                if i["name"] == entry["name"]
            ),
            None,
        )
        if installed:
            original = conn.execute(
                "SELECT files FROM nma_skill_revisions WHERE owner_id=? AND skill_id=? AND revision=1",
                (self.store.owner, installed["skill_id"]),
            ).fetchone()
            if installed["files"] != json.loads(original[0]):
                raise EngineError(
                    "SKILL_UPDATE_CONFLICT",
                    {
                        "reason": "Preserve local edits; merge into a new revision before updating"
                    },
                )
        return self.save(
            conn,
            scope,
            entry["name"],
            files,
            provenance,
            origin="catalog",
            catalog_id=entry["id"],
            expected=expected,
        )

    @contextmanager
    def materialized(self, items):
        from hermes_constants import (
            reset_hermes_home_override,
            set_hermes_home_override,
        )

        with tempfile.TemporaryDirectory(prefix="nma-skills-") as temporary:
            home = Path(temporary)
            root = home / "skills"
            root.mkdir()
            for item in items:
                for name, value in item["files"].items():
                    path = root / checked_path(item["name"]) / checked_path(name)
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(decode(value))
            token = set_hermes_home_override(home)
            st = settings.set(
                {
                    "create_dir": str(root),
                    "external_dirs": [],
                    "project_discovery": False,
                }
            )
            try:
                yield root
            finally:
                settings.reset(st)
                reset_hermes_home_override(token)

    def manage(self, conn, scope, arguments, provenance):
        from tools.skill_manager_tool import skill_manage

        items = self.listing(conn, scope)
        existing = {i["name"]: i for i in items}
        with self.materialized(items) as root:
            result = json.loads(skill_manage(**{"name": "", "action": "", **arguments}))
            if result.get("success") is not True:
                return result
            after = {
                path.parent.name: encode_package(path.parent)
                for path in root.rglob("SKILL.md")
            }
            changes = []
            for name in sorted(set(existing) | set(after)):
                old = existing.get(name)
                files = after.get(name)
                if old and files == old["files"]:
                    continue
                changes.append(
                    self.save(
                        conn,
                        scope,
                        name,
                        files if files is not None else old["files"],
                        provenance,
                        expected=old["revision"] if old else None,
                        status="active" if files is not None else "archived",
                    )
                )
        return {**result, "changes": changes}

    def view(self, conn, scope, arguments, operation_id, run_id=None):
        from tools.skills_tool import skill_view

        checked_path(arguments.get("name"))
        arguments = {
            **arguments,
            "name": arguments["name"].split("/")[-1].split(":")[-1],
        }
        items = self.listing(conn, scope)
        selected = next((i for i in items if i["name"] == arguments.get("name")), None)
        if not selected:
            entry = next(
                (
                    entry
                    for entry in catalog()["entries"]
                    if entry["name"] == arguments["name"]
                ),
                None,
            )
            if entry and entry["classification"] != "excluded":
                raise EngineError(
                    "SKILL_NOT_INSTALLED",
                    {
                        "catalog_id": entry["id"],
                        "repair": "Call skill_install with this catalog_id, then skill_view again",
                    },
                )
            raise EngineError("NOT_FOUND")
        if arguments.get("file_path"):
            checked_path(arguments["file_path"])
        with self.materialized(items):
            result = json.loads(skill_view(**arguments, preprocess=False))
        directory = (
            "imports/skills/" + digest(selected["files"])[:24] + "/" + selected["name"]
        )
        # Never return a gateway temporary path that cannot be used by a worker.
        result["skill_dir"] = "/work/" + directory
        result["path"] = (
            result["skill_dir"] + "/" + (arguments.get("file_path") or "SKILL.md")
        )
        result["revision"] = selected["revision"]
        result["skill_id"] = selected["skill_id"]
        result["provenance"] = selected["provenance"]
        conn.execute(
            "INSERT OR IGNORE INTO nma_skill_usage VALUES (?,?,?,?,?,?,?)",
            (
                self.store.owner,
                selected["skill_id"],
                int(selected["revision"]),
                operation_id,
                run_id,
                "viewed",
                now(),
            ),
        )
        return result

    def action(self, conn, scope, payload, expected, provenance):
        selected = next(
            (
                i
                for i in self.listing(conn, scope, archived=True)
                if i["skill_id"] == payload.get("skill_id")
            ),
            None,
        )
        if not selected:
            raise EngineError("NOT_FOUND")
        if payload.get("action") == "rollback":
            row = conn.execute(
                "SELECT files FROM nma_skill_revisions WHERE owner_id=? AND skill_id=? AND revision=?",
                (
                    self.store.owner,
                    selected["skill_id"],
                    payload.get("source_revision"),
                ),
            ).fetchone()
            if not row:
                raise EngineError("NOT_FOUND")
            files = json.loads(row[0])
        else:
            files = selected["files"]
        if payload.get("action") not in {"archive", "restore", "rollback", "correct"}:
            raise EngineError("INVALID_REQUEST")
        if payload["action"] == "correct":
            text = payload.get("content")
            if not isinstance(text, str) or not text.strip() or len(text) > 65536:
                raise EngineError("INVALID_REQUEST")
            from tools.skill_manager_tool import _validate_frontmatter

            if _validate_frontmatter(text):
                raise EngineError("INVALID_SKILL_PACKAGE")
            data = text.encode()
            files = {
                **files,
                "SKILL.md": {
                    "data": base64.b64encode(data).decode(),
                    "sha256": hashlib.sha256(data).hexdigest(),
                    "executable": False,
                },
            }
        return self.save(
            conn,
            scope,
            selected["name"],
            files,
            provenance,
            expected=expected,
            status="archived" if payload["action"] == "archive" else "active",
        )
