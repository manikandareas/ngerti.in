"""Owner-local agent identities and immutable configuration snapshots."""

import json
import re
import sqlite3
from datetime import UTC, datetime
from uuid import uuid4

from ngertiin_engine.capabilities import FIELDS, public_catalog, resolve
from ngertiin_engine.contracts import (
    AGENT_PAGE_BYTES,
    EngineError,
    canonical,
    counter,
    digest,
    next_sequence,
    uuid,
)

DDL = (
    "CREATE TABLE nma_agent_run_fences (owner_id TEXT NOT NULL, run_id TEXT NOT NULL, agent_id TEXT NOT NULL, PRIMARY KEY(owner_id,run_id), FOREIGN KEY(owner_id,run_id) REFERENCES nma_adapter_runs(owner_id,run_id), FOREIGN KEY(owner_id,agent_id) REFERENCES nma_agents(owner_id,agent_id))",
    "CREATE TABLE nma_agents (owner_id TEXT NOT NULL, agent_id TEXT NOT NULL, handle TEXT NOT NULL, display_name TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','disabled','archived')), revision INTEGER NOT NULL CHECK(revision>0), config_revision INTEGER NOT NULL CHECK(config_revision>0), access_generation INTEGER NOT NULL CHECK(access_generation>0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(owner_id,agent_id), UNIQUE(owner_id,handle), FOREIGN KEY(owner_id) REFERENCES nma_partition(owner_id))",
    "CREATE TABLE nma_agent_configs (owner_id TEXT NOT NULL, agent_id TEXT NOT NULL, config_revision INTEGER NOT NULL CHECK(config_revision>0), config TEXT NOT NULL CHECK(json_valid(config)), created_at TEXT NOT NULL, PRIMARY KEY(owner_id,agent_id,config_revision), FOREIGN KEY(owner_id,agent_id) REFERENCES nma_agents(owner_id,agent_id))",
)

AVATAR_URL_TEMPLATE = "https://api.dicebear.com/10.x/critters/svg?seed={seed}"


def avatar_url(handle):
    """Deterministic presentation avatar; validated handles are already URL-safe."""
    return AVATAR_URL_TEMPLATE.format(seed=handle)


def compose(name, handle, config):
    """Compose reusable persona only; conversation memory never enters this snapshot."""
    return "\n\n".join(
        (
            f"# Agent identity\nName: {name}\nHandle: @{handle}",
            "# Soul\n" + config["soul"],
            "# Instructions\n" + config["instructions"],
        )
    )


class Agents:
    def __init__(self, store, models):
        self.store, self.models = store, models

    def get(self, conn, agent_id):
        row = conn.execute(
            "SELECT a.agent_id,a.handle,a.display_name,a.status,a.revision,a.config_revision,a.access_generation,a.created_at,a.updated_at,c.config FROM nma_agents a JOIN nma_agent_configs c ON c.owner_id=a.owner_id AND c.agent_id=a.agent_id AND c.config_revision=a.config_revision WHERE a.owner_id=? AND a.agent_id=?",
            (self.store.owner, uuid(agent_id)),
        ).fetchone()
        if not row:
            raise EngineError("NOT_FOUND")
        result = dict(
            zip(
                (
                    "agent_id",
                    "handle",
                    "display_name",
                    "status",
                    "revision",
                    "config_revision",
                    "access_generation",
                    "created_at",
                    "updated_at",
                    "config",
                ),
                row,
            )
        )
        for key in ("revision", "config_revision", "access_generation"):
            result[key] = str(result[key])
        result["config"] = json.loads(result["config"])
        result["config"].pop("runtime_model", None)
        result["config"].pop("runtime_capabilities", None)
        result["config"].pop("runtime_inference", None)
        # Configs written before server-side avatar derivation lack the field.
        result["config"].setdefault("avatar_url", avatar_url(result["handle"]))
        primary = conn.execute(
            "SELECT thread_id FROM nma_primary_dms WHERE owner_id=? AND agent_id=?",
            (self.store.owner, agent_id),
        ).fetchone()
        result["primary_dm_thread_id"] = primary[0] if primary else None
        return result

    def listing(self, payload):
        if (
            set(payload) != {"after", "limit"}
            or type(payload["limit"]) is not int
            or not 1 <= payload["limit"] <= 100
        ):
            raise EngineError("INVALID_REQUEST")
        after = uuid(payload["after"]) if payload["after"] else ""

        def read(conn):
            rows = conn.execute(
                "SELECT agent_id FROM nma_agents WHERE owner_id=? AND agent_id>? ORDER BY agent_id LIMIT ?",
                (self.store.owner, after, payload["limit"] + 1),
            ).fetchall()
            page = {
                "items": [],
                "next_cursor": None,
                "capabilities": public_catalog(),
                "models": [
                    {
                        "id": key,
                        "label": value.get("label", key),
                        "protocol": value.get("protocol", "chat_completions"),
                        "provider_id": value.get("provider_id", "custom"),
                    }
                    for key, value in self.models.items()
                ],
            }
            # Reserve the UUID cursor and envelope overhead before adding exact encoded items.
            size = len(canonical({"result": page}).encode()) + 64
            if size > AGENT_PAGE_BYTES:
                raise EngineError("RESPONSE_TOO_LARGE")
            for row in rows[: payload["limit"]]:
                item = self.get(conn, row[0])
                item_size = len(canonical(item).encode()) + 1
                if size + item_size > AGENT_PAGE_BYTES:
                    if not page["items"]:
                        raise EngineError("RESPONSE_TOO_LARGE")
                    break
                page["items"].append(item)
                size += item_size
            if len(rows) > len(page["items"]):
                page["next_cursor"] = page["items"][-1]["agent_id"]
            return page

        return self.store.write(read)

    def validate_config(self, payload):
        name, handle, config = (
            payload.get("display_name"),
            payload.get("handle"),
            payload.get("config"),
        )
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
            raise EngineError("INVALID_REQUEST")
        if not isinstance(handle, str) or not re.fullmatch(
            r"[a-z][a-z0-9_-]{0,39}", handle
        ):
            raise EngineError("INVALID_REQUEST")
        if (
            not isinstance(config, dict)
            or not {"soul", "instructions", "model"} <= set(config)
            or set(config)
            - {
                "soul",
                "instructions",
                "model",
                "avatar_url",
                "session",
                "inference",
                *FIELDS,
            }
        ):
            raise EngineError("INVALID_REQUEST")
        if any(
            not isinstance(config[k], str) or len(config[k]) > 16000
            for k in ("soul", "instructions")
        ):
            raise EngineError("INVALID_REQUEST")
        if not isinstance(config["model"], str) or (
            config["model"] and config["model"] not in self.models
        ):
            raise EngineError("MODEL_UNAVAILABLE")
        capabilities, _ = resolve(config)
        from ngertiin_engine.session_settings import validate

        session = validate(config.get("session", {}))
        inference = {}
        if "inference" in config:
            from ngertiin_engine.inference_config import validate as validate_inference

            inference["runtime_inference"] = validate_inference(
                config["inference"], self.models, config["model"]
            )
        return (
            name.strip(),
            handle,
            {
                **config,
                "session": session,
                # The stored avatar always follows the handle; client-sent values are ignored.
                "avatar_url": avatar_url(handle),
                "runtime_model": self.models.get(config["model"]),
                "runtime_capabilities": capabilities,
                **inference,
            },
        )

    def mutate(self, body):
        def operation(conn):
            owner, command_id = self.store.owner, body["command_id"]
            prior = conn.execute(
                "SELECT payload_digest,result FROM nma_commands WHERE owner_id=? AND command_id=?",
                (owner, command_id),
            ).fetchone()
            if prior:
                if prior[0] != digest(body):
                    raise EngineError("COMMAND_CONFLICT")
                return json.loads(prior[1])
            conn.execute("SAVEPOINT agent_mutation")
            try:
                agent = self.apply(conn, body)
                seq = next_sequence(conn, owner)
                result = {
                    "schema_version": "nma.v1",
                    "command_id": command_id,
                    "status": "accepted",
                    "agent": agent,
                    "committed_seq": str(seq),
                }
                event = {
                    "schema_version": "nma.v1",
                    "type": "agent.changed",
                    "event_id": command_id,
                    "occurred_at": agent["updated_at"],
                    "thread_id": None,
                    "run_id": None,
                    "goal_id": None,
                    "agent_id": agent["agent_id"],
                    "seq": str(seq),
                    "payload": agent,
                }
                conn.execute(
                    "INSERT INTO nma_events VALUES (?,?,?,?)",
                    (owner, seq, command_id, canonical(event)),
                )
            except (EngineError, sqlite3.IntegrityError) as exc:
                conn.execute("ROLLBACK TO agent_mutation")
                result = {
                    "error": {
                        "code": exc.code
                        if isinstance(exc, EngineError)
                        else "HANDLE_CONFLICT",
                        "details": exc.details if isinstance(exc, EngineError) else {},
                    }
                }
            conn.execute("RELEASE agent_mutation")
            conn.execute(
                "INSERT INTO nma_commands VALUES (?,?,?,?,?)",
                (owner, command_id, digest(body), canonical(body), canonical(result)),
            )
            return result

        result = self.store.write(operation)
        if "error" in result:
            raise EngineError(result["error"]["code"], result["error"].get("details"))
        return result

    def apply(self, conn, body, *, identity=None):
        kind, p, expected = body["type"], body["payload"], body["expected_revision"]
        owner = self.store.owner
        now = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        if kind == "agent.create":
            if set(p) != {"display_name", "handle", "config"} or expected is not None:
                raise EngineError("INVALID_REQUEST")
            name, handle, config = self.validate_config(p)
            agent_id = identity or str(uuid4())
            conn.execute(
                "INSERT INTO nma_agents VALUES (?,?,?,?,'active',1,1,1,?,?)",
                (owner, agent_id, handle, name, now, now),
            )
            conn.execute(
                "INSERT INTO nma_agent_configs VALUES (?,?,1,?,?)",
                (owner, agent_id, canonical(config), now),
            )
        else:
            agent_id = uuid(p.get("agent_id"))
            agent = self.get(conn, agent_id)
            if counter(expected) != agent["revision"]:
                raise EngineError(
                    "REVISION_CONFLICT", {"current_revision": agent["revision"]}
                )
            revision = int(agent["revision"]) + 1
            if kind == "agent.configure":
                if (
                    set(p) != {"agent_id", "display_name", "handle", "config"}
                    or agent["status"] == "archived"
                ):
                    raise EngineError("INVALID_REQUEST")
                name, handle, config = self.validate_config(p)
                removed = any(
                    set(agent["config"].get(field, [])) - set(config.get(field, []))
                    for field in FIELDS
                )
                if removed:
                    conn.execute(
                        "UPDATE nma_agents SET access_generation=access_generation+1 WHERE owner_id=? AND agent_id=?",
                        (owner, agent_id),
                    )
                    self.fence(conn, agent_id)
                config_revision = int(agent["config_revision"]) + 1
                conn.execute(
                    "INSERT INTO nma_agent_configs VALUES (?,?,?,?,?)",
                    (owner, agent_id, config_revision, canonical(config), now),
                )
                conn.execute(
                    "UPDATE nma_agents SET display_name=?,handle=?,config_revision=?,revision=?,updated_at=? WHERE owner_id=? AND agent_id=?",
                    (name, handle, config_revision, revision, now, owner, agent_id),
                )
            else:
                fields = (
                    {"agent_id", "status"} if kind == "agent.restore" else {"agent_id"}
                )
                if set(p) != fields:
                    raise EngineError("INVALID_REQUEST")
                if kind == "agent.archive" and agent["status"] != "archived":
                    status = "archived"
                elif kind == "agent.disable" and agent["status"] == "active":
                    status = "disabled"
                elif (
                    kind == "agent.restore"
                    and agent["status"] in {"disabled", "archived"}
                    and isinstance(p["status"], str)
                    and p["status"] in {"active", "disabled"}
                ):
                    status = p["status"]
                else:
                    raise EngineError("INVALID_TRANSITION")
                if status != "active":
                    self.fence(conn, agent_id)
                if kind == "agent.restore":
                    conn.execute(
                        "INSERT INTO nma_agent_configs SELECT owner_id,agent_id,config_revision+1,config,? FROM nma_agent_configs WHERE owner_id=? AND agent_id=? AND config_revision=?",
                        (now, owner, agent_id, int(agent["config_revision"])),
                    )
                    conn.execute(
                        "UPDATE nma_agents SET config_revision=config_revision+1 WHERE owner_id=? AND agent_id=?",
                        (owner, agent_id),
                    )
                conn.execute(
                    "UPDATE nma_agents SET status=?,revision=?,access_generation=access_generation+1,updated_at=? WHERE owner_id=? AND agent_id=?",
                    (status, revision, now, owner, agent_id),
                )
        from ngertiin_engine.conversations import ensure_dm, record_change

        agent = self.get(conn, agent_id)
        if kind == "agent.create":
            ensure_dm(conn, owner, agent, welcome=True)
        else:
            for (thread_id,) in conn.execute(
                "SELECT thread_id FROM nma_memberships WHERE owner_id=? AND agent_id=?",
                (owner, agent_id),
            ).fetchall():
                record_change(conn, owner, thread_id)
        return self.get(conn, agent_id)

    def fence(self, conn, agent_id):
        conn.execute(
            "INSERT OR IGNORE INTO nma_agent_run_fences SELECT r.owner_id,r.run_id,? FROM nma_adapter_runs r JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id LEFT JOIN session_admissions n ON n.admission_id=r.native_admission_id WHERE r.owner_id=? AND json_extract(b.config,'$.agent_id')=? AND (n.status IS NULL OR n.status!='terminal' OR EXISTS (SELECT 1 FROM nma_delegated_children c WHERE c.owner_id=r.owner_id AND c.root_run_id=r.run_id AND c.status='running'))",
            (agent_id, self.store.owner, agent_id),
        )
