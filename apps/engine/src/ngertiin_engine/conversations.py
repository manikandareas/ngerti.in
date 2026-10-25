"""Primary conversations, authored welcomes and owner navigation state."""

import json
import os
from datetime import UTC, datetime
from uuid import UUID, uuid4, uuid5

from ngertiin_engine.contracts import (
    EngineError,
    canonical,
    counter,
    digest,
    next_sequence,
    uuid,
)

DDL = (
    "CREATE INDEX nma_conversation_events ON nma_events(owner_id,sequence) WHERE json_extract(payload,'$.type')='conversation.changed'",
    "CREATE TABLE nma_primary_dms (owner_id TEXT NOT NULL, agent_id TEXT NOT NULL, thread_id TEXT NOT NULL, PRIMARY KEY(owner_id,agent_id), UNIQUE(owner_id,thread_id), FOREIGN KEY(owner_id,agent_id) REFERENCES nma_agents(owner_id,agent_id), FOREIGN KEY(owner_id,thread_id) REFERENCES nma_threads(owner_id,thread_id))",
    "CREATE TRIGGER nma_primary_dm_identity BEFORE INSERT ON nma_primary_dms WHEN NOT EXISTS (SELECT 1 FROM nma_threads WHERE owner_id=NEW.owner_id AND thread_id=NEW.thread_id AND kind='dm' AND dm_agent_id=NEW.agent_id) BEGIN SELECT RAISE(ABORT,'Invalid primary DM identity'); END",
    "CREATE TABLE nma_account_setup (owner_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, template_version INTEGER NOT NULL, FOREIGN KEY(owner_id,agent_id) REFERENCES nma_agents(owner_id,agent_id))",
    "CREATE TABLE nma_conversation_state (owner_id TEXT NOT NULL, thread_id TEXT NOT NULL, activity_seq INTEGER NOT NULL DEFAULT 0, last_read_seq INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(owner_id,thread_id), FOREIGN KEY(owner_id,thread_id) REFERENCES nma_threads(owner_id,thread_id))",
    "CREATE INDEX nma_conversation_order ON nma_conversation_state(owner_id,activity_seq DESC,thread_id)",
    "CREATE INDEX nma_message_unread ON nma_messages(owner_id,thread_id,author_kind,message_seq)",
    "CREATE TABLE nma_navigation (owner_id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, revision INTEGER NOT NULL, FOREIGN KEY(owner_id,thread_id) REFERENCES nma_threads(owner_id,thread_id))",
    "CREATE TABLE nma_welcomes (owner_id TEXT NOT NULL, agent_id TEXT NOT NULL, message_id TEXT NOT NULL, template_version INTEGER NOT NULL, PRIMARY KEY(owner_id,agent_id), FOREIGN KEY(owner_id,agent_id) REFERENCES nma_agents(owner_id,agent_id), FOREIGN KEY(owner_id,message_id) REFERENCES nma_messages(owner_id,message_id))",
)
SOUL = """You are a warm, calm, curious and practical generalist assistant.
Help the user clarify needs and carry work through to useful outcomes. Be concise,
honest about uncertainty, and willing to disagree politely. Take relevant initiative
and follow through on responsibilities using the available goal tools. Adapt to the
user's language and communication style. Never claim capabilities or completed work
without evidence."""


def timestamp():
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def event(conn, owner, kind, thread_id, payload):
    seq = next_sequence(conn, owner)
    item = {
        "schema_version": "nma.v1",
        "type": kind,
        "event_id": str(uuid4()),
        "thread_id": thread_id,
        "agent_id": payload.get("author_agent_id"),
        "run_id": None,
        "goal_id": None,
        "seq": str(seq),
        "occurred_at": timestamp(),
        "payload": payload,
    }
    conn.execute(
        "INSERT INTO nma_events VALUES (?,?,?,?)",
        (owner, seq, item["event_id"], canonical(item)),
    )
    return seq


def record_change(conn, owner, thread_id, *, activity=False):
    """Append a conversation.changed event and upsert read/activity state."""
    seq = event(
        conn, owner, "conversation.changed", thread_id, {"thread_id": thread_id}
    )
    conn.execute(
        "INSERT OR IGNORE INTO nma_conversation_state(owner_id,thread_id) VALUES (?,?)",
        (owner, thread_id),
    )
    if activity:
        conn.execute(
            "UPDATE nma_conversation_state SET activity_seq=? WHERE owner_id=? AND thread_id=?",
            (seq, owner, thread_id),
        )
        conn.execute(
            "UPDATE nma_threads SET updated_at=? WHERE owner_id=? AND thread_id=?",
            (timestamp(), owner, thread_id),
        )


def backfill(conn, owner):
    """Preserve duplicate threads; only unambiguous primary mappings are inferred."""
    conn.execute(
        "INSERT INTO nma_primary_dms SELECT owner_id,dm_agent_id,MIN(thread_id) FROM nma_threads WHERE owner_id=? AND kind='dm' GROUP BY owner_id,dm_agent_id HAVING COUNT(*)=1",
        (owner,),
    )
    conn.execute(
        "INSERT INTO nma_conversation_state(owner_id,thread_id,last_read_seq,activity_seq) SELECT t.owner_id,t.thread_id,t.next_message_seq-1,COALESCE((SELECT MAX(e.sequence) FROM nma_events e WHERE e.owner_id=t.owner_id AND json_extract(e.payload,'$.thread_id')=t.thread_id),0) FROM nma_threads t WHERE t.owner_id=?",
        (owner,),
    )


def ensure_dm(conn, owner, agent, *, welcome=False):
    row = conn.execute(
        "SELECT thread_id FROM nma_primary_dms WHERE owner_id=? AND agent_id=?",
        (owner, agent["agent_id"]),
    ).fetchone()
    if row:
        return row[0]
    rows = conn.execute(
        "SELECT thread_id FROM nma_threads WHERE owner_id=? AND dm_agent_id=? ORDER BY created_at,thread_id",
        (owner, agent["agent_id"]),
    ).fetchall()
    if len(rows) > 1:
        raise EngineError(
            "DM_RECONCILIATION_REQUIRED",
            {"agent_id": agent["agent_id"], "thread_ids": [r[0] for r in rows]},
        )
    thread_id = rows[0][0] if rows else str(uuid4())
    if not rows:
        now = timestamp()
        conn.execute(
            "INSERT INTO nma_threads(owner_id,thread_id,kind,title,dm_agent_id,created_at,updated_at) VALUES (?,?,'dm',?,?,?,?)",
            (owner, thread_id, agent["display_name"], agent["agent_id"], now, now),
        )
        conn.execute(
            "INSERT INTO nma_memberships(owner_id,thread_id,agent_id,position) VALUES (?,?,?,0)",
            (owner, thread_id, agent["agent_id"]),
        )
    conn.execute(
        "INSERT INTO nma_primary_dms VALUES (?,?,?)",
        (owner, agent["agent_id"], thread_id),
    )
    record_change(conn, owner, thread_id, activity=not rows)
    if welcome and not rows:
        message_id = str(uuid5(UUID(agent["agent_id"]), "welcome-v1"))
        welcome_text = f"Hi, I'm {agent['display_name']}! I'm here to help you think things through and get things done. What would you like to work on?"
        conn.execute(
            "INSERT INTO nma_messages(owner_id,message_id,thread_id,message_seq,author_kind,author_agent_id,parts,context_generation,created_at) VALUES (?,?,?,1,'agent',?,?,1,?)",
            (
                owner,
                message_id,
                thread_id,
                agent["agent_id"],
                canonical([{"type": "text", "text": welcome_text}]),
                timestamp(),
            ),
        )
        conn.execute(
            "INSERT INTO nma_welcomes VALUES (?,?,?,1)",
            (owner, agent["agent_id"], message_id),
        )
        conn.execute(
            "UPDATE nma_threads SET next_message_seq=2 WHERE owner_id=? AND thread_id=?",
            (owner, thread_id),
        )
        event(
            conn,
            owner,
            "message.created",
            thread_id,
            {
                "message_id": message_id,
                "thread_id": thread_id,
                "message_seq": "1",
                "author_kind": "agent",
                "author_agent_id": agent["agent_id"],
                "run_id": None,
                "content": welcome_text,
                "parts": [{"type": "text", "text": welcome_text}],
                "revision": "1",
                "context_generation": "1",
                "origin": "welcome_template",
                "template_version": 1,
            },
        )
        record_change(conn, owner, thread_id, activity=True)
    return thread_id


class Conversations:
    def __init__(self, adapter):
        self.adapter, self.store = adapter, adapter.store
        self.owner = self.store.owner
        from ngertiin_engine.inbox import Inbox

        self.inbox = Inbox(adapter)

    def state(self, conn):
        row = conn.execute(
            "SELECT agent_id,template_version FROM nma_account_setup WHERE owner_id=?",
            (self.owner,),
        ).fetchone()
        navigation = conn.execute(
            "SELECT thread_id,revision FROM nma_navigation WHERE owner_id=?",
            (self.owner,),
        ).fetchone()
        result = {
            "status": "ready" if row else "pending",
            "last_opened_thread_id": navigation[0] if navigation else None,
            "navigation_revision": str(navigation[1]) if navigation else "1",
        }
        if row:
            agent = self.adapter.agents.get(conn, row[0])
            result.update(
                default_agent_id=row[0],
                primary_dm_thread_id=agent["primary_dm_thread_id"],
                agent_status=agent["status"],
                template_version=row[1],
            )
        return result

    def inventory(self, conn):
        agents = []
        for (agent_id,) in conn.execute(
            "SELECT agent_id FROM nma_agents WHERE owner_id=? ORDER BY agent_id",
            (self.owner,),
        ).fetchall():
            threads = conn.execute(
                "SELECT thread_id,revision,next_message_seq FROM nma_threads WHERE owner_id=? AND dm_agent_id=? ORDER BY thread_id",
                (self.owner, agent_id),
            ).fetchall()
            primary = conn.execute(
                "SELECT thread_id FROM nma_primary_dms WHERE owner_id=? AND agent_id=?",
                (self.owner, agent_id),
            ).fetchone()
            agents.append(
                {
                    "agent_id": agent_id,
                    "primary_dm_thread_id": primary[0] if primary else None,
                    "threads": [
                        {
                            "thread_id": row[0],
                            "revision": str(row[1]),
                            "next_message_seq": str(row[2]),
                        }
                        for row in threads
                    ],
                }
            )
        value = {"owner_id": self.owner, "agents": agents, "setup": self.state(conn)}
        return {**value, "inventory_digest": digest(value)}

    def mutate(self, body):
        def write(conn):
            prior = conn.execute(
                "SELECT payload_digest,result FROM nma_commands WHERE owner_id=? AND command_id=?",
                (self.owner, body["command_id"]),
            ).fetchone()
            if prior:
                if prior[0] != digest(body):
                    raise EngineError("COMMAND_CONFLICT")
                return json.loads(prior[1])
            conn.execute("SAVEPOINT conversation_mutation")
            try:
                kind, p = body["type"], body["payload"]
                if kind == "account.reconcile":
                    if (
                        set(p)
                        != {"inventory_digest", "default_agent_id", "primary_dms"}
                        or body["expected_revision"] is not None
                    ):
                        raise EngineError("INVALID_REQUEST")
                    if (
                        p["inventory_digest"]
                        != self.inventory(conn)["inventory_digest"]
                    ):
                        raise EngineError("REVISION_CONFLICT")
                    if not isinstance(p["primary_dms"], dict):
                        raise EngineError("INVALID_REQUEST")
                    for agent_id, thread_id in p["primary_dms"].items():
                        agent = self.adapter.agents.get(conn, uuid(agent_id))
                        thread = self.adapter.threads.get(conn, uuid(thread_id))
                        if thread["kind"] != "dm" or thread["dm_agent_id"] != agent_id:
                            raise EngineError("INVALID_REQUEST")
                        existing = agent["primary_dm_thread_id"]
                        if existing and existing != thread_id:
                            raise EngineError("INVALID_TRANSITION")
                        conn.execute(
                            "INSERT OR IGNORE INTO nma_primary_dms VALUES (?,?,?)",
                            (self.owner, agent_id, thread_id),
                        )
                        record_change(conn, self.owner, thread_id)
                    if p["default_agent_id"] is not None:
                        agent = self.adapter.agents.get(
                            conn, uuid(p["default_agent_id"])
                        )
                        ensure_dm(conn, self.owner, agent)
                        current = self.state(conn)
                        if (
                            current["status"] == "ready"
                            and current["default_agent_id"] != agent["agent_id"]
                        ):
                            raise EngineError("INVALID_TRANSITION")
                        conn.execute(
                            "INSERT OR IGNORE INTO nma_account_setup VALUES (?,?,0)",
                            (self.owner, agent["agent_id"]),
                        )
                    result = self.inventory(conn)
                elif kind == "account.ensure":
                    if p or body["expected_revision"] is not None:
                        raise EngineError("INVALID_REQUEST")
                    if self.state(conn)["status"] != "ready":
                        migration_id = str(
                            uuid5(UUID(self.owner), "default-agent-migration-v1")
                        )
                        old = conn.execute(
                            "SELECT result FROM nma_commands WHERE owner_id=? AND command_id=?",
                            (self.owner, migration_id),
                        ).fetchone()
                        migrated = (
                            json.loads(old[0]).get("agent") if old and old[0] else None
                        )
                        if migrated:
                            agent = self.adapter.agents.get(conn, migrated["agent_id"])
                            ensure_dm(conn, self.owner, agent)
                        else:
                            handle = "tobi"
                            suffix = 1
                            while conn.execute(
                                "SELECT 1 FROM nma_agents WHERE owner_id=? AND handle=?",
                                (self.owner, handle),
                            ).fetchone():
                                suffix += 1
                                handle = f"tobi-{suffix}"
                            config = {
                                "soul": SOUL,
                                "instructions": "Help the user with the capabilities actually assigned to you.",
                                "model": os.environ.get("NMA_DEFAULT_MODEL", "default"),
                            }
                            try:
                                grants = json.loads(
                                    os.environ.get("NMA_DEFAULT_GRANTS", "{}")
                                )
                            except ValueError:
                                raise EngineError(
                                    "INVALID_DEFAULT_CONFIGURATION"
                                ) from None
                            if not isinstance(grants, dict) or set(grants) - {
                                "tool_grants",
                                "mcp_grants",
                                "skill_refs",
                            }:
                                raise EngineError("INVALID_DEFAULT_CONFIGURATION")
                            config.update(grants)
                            agent = self.adapter.agents.apply(
                                conn,
                                {
                                    "type": "agent.create",
                                    "expected_revision": None,
                                    "payload": {
                                        "display_name": "Tobi",
                                        "handle": handle,
                                        "config": config,
                                    },
                                },
                            )
                        conn.execute(
                            "INSERT INTO nma_account_setup VALUES (?,?,1)",
                            (self.owner, agent["agent_id"]),
                        )
                    for (agent_id,) in conn.execute(
                        "SELECT agent_id FROM nma_agents WHERE owner_id=?",
                        (self.owner,),
                    ).fetchall():
                        ensure_dm(
                            conn, self.owner, self.adapter.agents.get(conn, agent_id)
                        )
                    result = self.state(conn)
                elif kind == "thread.ensure_dm":
                    if set(p) != {"agent_id"} or body["expected_revision"] is not None:
                        raise EngineError("INVALID_REQUEST")
                    agent = self.adapter.agents.get(conn, uuid(p["agent_id"]))
                    thread_id = ensure_dm(conn, self.owner, agent)
                    result = {"thread": self.adapter.threads.get(conn, thread_id)}
                elif kind == "thread.mark_read":
                    if (
                        set(p) != {"thread_id", "message_seq"}
                        or body["expected_revision"] is not None
                    ):
                        raise EngineError("INVALID_REQUEST")
                    thread = self.adapter.threads.get(conn, uuid(p["thread_id"]))
                    seq = int(counter(p["message_seq"]))
                    if not conn.execute(
                        "SELECT 1 FROM nma_messages WHERE owner_id=? AND thread_id=? AND message_seq=?",
                        (self.owner, thread["thread_id"], seq),
                    ).fetchone():
                        raise EngineError("INVALID_REQUEST")
                    conn.execute(
                        "UPDATE nma_conversation_state SET last_read_seq=MAX(last_read_seq,?) WHERE owner_id=? AND thread_id=?",
                        (seq, self.owner, thread["thread_id"]),
                    )
                    record_change(conn, self.owner, thread["thread_id"])
                    result = self.inbox.summary(conn, thread["thread_id"])
                elif kind == "thread.open":
                    if set(p) != {"thread_id"}:
                        raise EngineError("INVALID_REQUEST")
                    self.adapter.threads.get(conn, uuid(p["thread_id"]))
                    current = self.state(conn)["navigation_revision"]
                    if body["expected_revision"] != current:
                        raise EngineError(
                            "REVISION_CONFLICT", {"current_revision": current}
                        )
                    conn.execute(
                        "INSERT INTO nma_navigation VALUES (?,?,?) ON CONFLICT(owner_id) DO UPDATE SET thread_id=excluded.thread_id,revision=excluded.revision",
                        (self.owner, p["thread_id"], int(current) + 1),
                    )
                    result = self.state(conn)
                else:
                    raise EngineError("INVALID_REQUEST")
            except EngineError as exc:
                conn.execute("ROLLBACK TO conversation_mutation")
                if body["type"] == "account.ensure":
                    raise
                result = {"error": {"code": exc.code, "details": exc.details}}
            conn.execute("RELEASE conversation_mutation")
            result = {
                "schema_version": "nma.v1",
                "command_id": body["command_id"],
                "status": "rejected" if "error" in result else "accepted",
                **result,
            }
            conn.execute(
                "INSERT INTO nma_commands VALUES (?,?,?,?,?)",
                (
                    self.owner,
                    body["command_id"],
                    digest(body),
                    canonical(body),
                    canonical(result),
                ),
            )
            return result

        result = self.store.write(write)
        if "error" in result:
            raise EngineError(result["error"]["code"], result["error"]["details"])
        return result
