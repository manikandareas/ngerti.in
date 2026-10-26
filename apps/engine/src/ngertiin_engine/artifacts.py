"""Immutable conversation artifacts with atomic bytes, provenance and explicit sharing.

Small text artifacts are stored in the owner SQLite partition. They never expose
host paths or reinterpret a model-supplied path as filesystem authority.
"""

import hashlib
import json
import re
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import EngineError, canonical, digest, uuid
from ngertiin_engine.redaction import text as redact

DDL = (
    "CREATE TABLE nma_artifacts (owner_id TEXT NOT NULL, artifact_id TEXT NOT NULL, thread_id TEXT NOT NULL, producing_run_id TEXT NOT NULL, producing_agent_id TEXT NOT NULL, revision_id TEXT NOT NULL, filename TEXT NOT NULL, media_type TEXT NOT NULL, sha256 TEXT NOT NULL, byte_count INTEGER NOT NULL, content BLOB NOT NULL, PRIMARY KEY(owner_id,artifact_id), UNIQUE(owner_id,revision_id), FOREIGN KEY(owner_id,thread_id) REFERENCES nma_threads(owner_id,thread_id), FOREIGN KEY(owner_id,producing_run_id) REFERENCES nma_adapter_runs(owner_id,run_id), FOREIGN KEY(owner_id,producing_agent_id) REFERENCES nma_agents(owner_id,agent_id))",
    "CREATE TABLE nma_artifact_grants (owner_id TEXT NOT NULL, artifact_id TEXT NOT NULL, target_thread_id TEXT NOT NULL, source_message_id TEXT NOT NULL, reason TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)), PRIMARY KEY(owner_id,artifact_id,target_thread_id), FOREIGN KEY(owner_id,artifact_id) REFERENCES nma_artifacts(owner_id,artifact_id), FOREIGN KEY(owner_id,target_thread_id) REFERENCES nma_threads(owner_id,thread_id), FOREIGN KEY(owner_id,source_message_id) REFERENCES nma_messages(owner_id,message_id))",
    "CREATE TABLE nma_workspace_operations (owner_id TEXT NOT NULL, operation_id TEXT NOT NULL, payload_digest TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(owner_id,operation_id), FOREIGN KEY(owner_id) REFERENCES nma_partition(owner_id))",
)
TOOL = "workspace"
SCHEMA = {
    "name": TOOL,
    "description": "Publish an immutable UTF-8 file in this conversation, list its files, or read an authorized artifact. For publish, send action, filename and content; for list, send only action; for read, send action and artifact_id. Omit unused fields. Use explicit artifact IDs for handoff; private DM files are not shared automatically. No host paths are accepted.",
    "parameters": {
        "type": "object",
        "properties": {
            "action": {"type": "string", "enum": ["publish", "list", "read"]},
            "filename": {"type": "string"},
            "content": {"type": "string"},
            "artifact_id": {"type": "string"},
        },
        "required": ["action"],
        "additionalProperties": False,
    },
}


class Artifacts:
    def __init__(self, store):
        self.store = store

    def get(self, conn, identity, *, thread_id=None, content=False):
        row = conn.execute(
            "SELECT artifact_id,thread_id,producing_run_id,producing_agent_id,revision_id,filename,media_type,sha256,byte_count,content FROM nma_artifacts WHERE owner_id=? AND artifact_id=?",
            (self.store.owner, uuid(identity)),
        ).fetchone()
        if not row:
            raise EngineError("NOT_FOUND")
        if (
            thread_id is not None
            and row[1] != thread_id
            and not conn.execute(
                "SELECT 1 FROM nma_artifact_grants WHERE owner_id=? AND artifact_id=? AND target_thread_id=? AND active=1",
                (self.store.owner, identity, thread_id),
            ).fetchone()
        ):
            raise EngineError("NOT_FOUND")
        keys = (
            "artifact_id",
            "thread_id",
            "producing_run_id",
            "producing_agent_id",
            "revision_id",
            "filename",
            "media_type",
            "sha256",
            "byte_count",
        )
        item = dict(zip(keys, row))
        item["status"] = "ready"
        if content:
            data = bytes(row[9])
            if len(data) != row[8] or hashlib.sha256(data).hexdigest() != row[7]:
                raise EngineError("ARTIFACT_CORRUPT")
            item["content"] = data.decode("utf-8")
        return item

    def listing(self, conn, thread_id):
        rows = conn.execute(
            "SELECT artifact_id FROM nma_artifacts a WHERE owner_id=? AND (thread_id=? OR EXISTS (SELECT 1 FROM nma_artifact_grants g WHERE g.owner_id=a.owner_id AND g.artifact_id=a.artifact_id AND g.target_thread_id=? AND g.active=1)) ORDER BY rowid DESC LIMIT 100",
            (self.store.owner, thread_id, thread_id),
        ).fetchall()
        return [self.get(conn, r[0], thread_id=thread_id) for r in rows]

    def tool(self, stamp, args, ids):
        from ngertiin_engine.capabilities import resolve
        from ngertiin_engine.goals import Goals
        from ngertiin_engine.reliability import Reliability

        def apply(conn):
            run_id, config, _ = Goals(self.store).scope(conn, stamp)
            marker = config.get("nma_capabilities", {})
            resolved, _ = resolve(marker.get("grants", {}))
            if (
                resolved.get("snapshots") != marker.get("snapshots")
                or "nma_workspace" not in resolved["toolsets"]
            ):
                raise EngineError("ACCESS_REVOKED")
            operation = digest([run_id, ids.turn_id, ids.tool_call_id, TOOL])
            previous = conn.execute(
                "SELECT payload_digest,result FROM nma_workspace_operations WHERE owner_id=? AND operation_id=?",
                (self.store.owner, operation),
            ).fetchone()
            if previous:
                if previous[0] != digest(args):
                    raise EngineError("EFFECT_CONFLICT")
                return previous[1]
            if not isinstance(args, dict):
                raise EngineError("INVALID_REQUEST")
            action = args.get("action")
            if not isinstance(action, str):
                raise EngineError("INVALID_REQUEST")
            unused = {
                "publish": {"artifact_id"},
                "list": {"filename", "content", "artifact_id"},
                "read": {"filename", "content"},
            }.get(action, set())
            # Compatible providers may fill unused optional fields with empty placeholders.
            # Keep the original payload digest so existing effect receipts remain authoritative.
            fields = {
                k for k, v in args.items() if k not in unused or v not in (None, "")
            }
            if action == "list" and fields == {"action"}:
                result = {"artifacts": self.listing(conn, config["thread_id"])}
            elif action == "read" and fields == {"action", "artifact_id"}:
                result = self.get(
                    conn,
                    args["artifact_id"],
                    thread_id=config["thread_id"],
                    content=True,
                )
            elif action == "publish" and fields == {"action", "filename", "content"}:
                name, content = args["filename"], args["content"]
                if (
                    not isinstance(name, str)
                    or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._ -]{0,119}", name)
                    or not isinstance(content, str)
                ):
                    raise EngineError("INVALID_REQUEST")
                data = redact(content).encode("utf-8")
                if len(data) > 1024 * 1024:
                    raise EngineError("REQUEST_TOO_LARGE")
                identity = str(
                    uuid5(NAMESPACE_URL, self.store.owner + ":artifact:" + operation)
                )
                revision = str(uuid5(NAMESPACE_URL, identity + ":1"))
                conn.execute(
                    "INSERT INTO nma_artifacts VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        self.store.owner,
                        identity,
                        config["thread_id"],
                        run_id,
                        config["agent_id"],
                        revision,
                        name,
                        "text/plain; charset=utf-8",
                        hashlib.sha256(data).hexdigest(),
                        len(data),
                        data,
                    ),
                )
                result = self.get(conn, identity)
                Reliability(self.store).append(
                    conn, run_id, config, "artifact.ready", result
                )
            else:
                raise EngineError("INVALID_REQUEST")
            encoded = canonical(result)
            conn.execute(
                "INSERT INTO nma_workspace_operations VALUES (?,?,?,?)",
                (self.store.owner, operation, digest(args), encoded),
            )
            return encoded

        try:
            return self.store.write(apply)
        except EngineError as exc:
            return canonical({"error": exc.code})

    def share(self, body, threads):
        p = body["payload"]
        if (
            body["expected_revision"] is not None
            or set(p)
            != {"artifact_id", "target_thread_id", "source_message_id", "reason"}
            or not isinstance(p["reason"], str)
            or not 1 <= len(p["reason"]) <= 2000
        ):
            raise EngineError("INVALID_REQUEST")

        def apply(conn):
            previous = conn.execute(
                "SELECT payload_digest,result FROM nma_workspace_operations WHERE owner_id=? AND operation_id=?",
                (self.store.owner, body["command_id"]),
            ).fetchone()
            if previous:
                if previous[0] != digest(body):
                    raise EngineError("COMMAND_CONFLICT")
                return json.loads(previous[1])
            artifact = self.get(conn, p["artifact_id"])
            threads.get(conn, uuid(p["target_thread_id"]))
            message = conn.execute(
                "SELECT author_kind,thread_id FROM nma_messages WHERE owner_id=? AND message_id=?",
                (self.store.owner, uuid(p["source_message_id"])),
            ).fetchone()
            if (
                not message
                or message[0] != "user"
                or message[1] != artifact["thread_id"]
            ):
                raise EngineError("NOT_FOUND")
            active = body["type"] == "artifact.share"
            conn.execute(
                "INSERT INTO nma_artifact_grants VALUES (?,?,?,?,?,?) ON CONFLICT(owner_id,artifact_id,target_thread_id) DO UPDATE SET active=excluded.active,source_message_id=excluded.source_message_id,reason=excluded.reason",
                (
                    self.store.owner,
                    p["artifact_id"],
                    p["target_thread_id"],
                    p["source_message_id"],
                    p["reason"],
                    int(active),
                ),
            )
            if not active:
                from ngertiin_engine.context import fence_context_runs

                fence_context_runs(conn, self.store.owner, p["target_thread_id"])
            result = {
                "artifact_id": p["artifact_id"],
                "target_thread_id": p["target_thread_id"],
                "active": active,
            }
            conn.execute(
                "INSERT INTO nma_workspace_operations VALUES (?,?,?,?)",
                (self.store.owner, body["command_id"], digest(body), canonical(result)),
            )
            return result

        return self.store.write(apply)


def install():
    import model_tools
    from gateway.session_policy import active_policy
    from tools.registry import registry

    registry.register(
        name=TOOL,
        toolset="nma_workspace",
        schema=SCHEMA,
        handler=lambda args, **kwargs: canonical({"error": "NOT_FOUND"}),
    )
    original = model_tools.get_tool_definitions

    def definitions(*args, **kwargs):
        definitions = original(*args, **kwargs)
        policy = active_policy()
        marker = (
            policy.config(secrets=False).get("nma_capabilities", {}) if policy else {}
        )
        if "nma_workspace" in marker.get("toolsets", []):
            definitions = [d for d in definitions if d["function"]["name"] != TOOL]
            return [*definitions, {"type": "function", "function": SCHEMA}]
        return definitions

    model_tools.get_tool_definitions = definitions
