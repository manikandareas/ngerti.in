"""Native history is canonical; product context adds only authorized scoped data."""

import json
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import EngineError, canonical


class SessionContext:
    def __init__(self, store):
        self.store = store

    def bind(self, key, config, ref):
        """Seed a new config binding once, atomically with its lineage receipt.

        This narrowly pinned native transaction helper retains rich tool/reasoning
        rows and compression summaries. Original rows and old bindings stay intact.
        A revoked context generation is never selected as a parent.
        """
        from gateway.session_local_recovery import owned_receipt

        authority = self.store.authority
        if self.store.write(
            lambda conn: conn.execute(
                "SELECT 1 FROM nma_session_lineage WHERE owner_id=? AND binding_id=?",
                (self.store.owner, key),
            ).fetchone()
        ):
            return
        prior = self.store.write(
            lambda conn: conn.execute(
                "SELECT binding_id,native_session_id FROM nma_adapter_bindings WHERE owner_id=? AND binding_id<>? AND native_session_id IS NOT NULL AND json_extract(config,'$.agent_id')=? AND json_extract(config,'$.thread_id')=? AND json_extract(config,'$.context_generation')=? ORDER BY rowid DESC LIMIT 1",
                (
                    self.store.owner,
                    key,
                    config["agent_id"],
                    config["thread_id"],
                    config["context_generation"],
                ),
            ).fetchone()
        )
        receipt = owned_receipt(authority, ref.session_id)[0]
        target = receipt["entry"]["session_id"]
        parent, history = None, []
        if prior:
            old = owned_receipt(authority, prior[1])[0]
            parent = prior[0]
            history = authority.db.get_messages_as_conversation(
                old["entry"]["session_id"]
            )
        logical = str(
            uuid5(
                NAMESPACE_URL,
                canonical(
                    [
                        self.store.owner,
                        config["agent_id"],
                        config["thread_id"],
                        "logical-session",
                    ]
                ),
            )
        )

        def seed(conn):
            if conn.execute(
                "SELECT 1 FROM nma_session_lineage WHERE owner_id=? AND binding_id=?",
                (self.store.owner, key),
            ).fetchone():
                return
            existing = conn.execute(
                "SELECT 1 FROM messages WHERE session_id=? LIMIT 1", (target,)
            ).fetchone()
            if not existing and history:
                authority.db._append_messages_in_transaction(conn, target, history)
            conn.execute(
                "INSERT INTO nma_session_lineage VALUES (?,?,?,?,?,0)",
                (
                    self.store.owner,
                    key,
                    logical,
                    parent if not existing else None,
                    target,
                ),
            )

        self.store.write(seed)

    def references(self, conn, config, transcript, history):
        """Return peer/unexecuted shared messages without re-injecting own transcript."""
        runs = {
            row[0]
            for row in conn.execute(
                "SELECT r.run_id FROM nma_adapter_runs r JOIN nma_adapter_bindings b USING(owner_id,binding_id) WHERE r.owner_id=? AND json_extract(b.config,'$.agent_id')=? AND json_extract(b.config,'$.thread_id')=? AND json_extract(b.config,'$.context_generation')=?",
                (
                    self.store.owner,
                    config["agent_id"],
                    config["thread_id"],
                    config["context_generation"],
                ),
            )
        }
        watermark = conn.execute(
            "SELECT COALESCE(MAX(l.context_watermark),0) FROM nma_session_lineage l JOIN nma_adapter_bindings b USING(owner_id,binding_id) WHERE b.owner_id=? AND json_extract(b.config,'$.agent_id')=? AND json_extract(b.config,'$.thread_id')=?",
            (self.store.owner, config["agent_id"], config["thread_id"]),
        ).fetchone()[0]
        return [
            m
            for m in transcript
            if int(m["message_seq"]) > watermark
            and m["run_id"] not in runs
            and not (
                m["author_kind"] == "agent"
                and m["author_agent_id"] == config["agent_id"]
                and m.get("origin") != "selected_history"
            )
        ]

    def metadata(self, key):
        return self.store.write(lambda conn: self._metadata(conn, key))

    def _metadata(self, conn, key):
        row = conn.execute(
            "SELECT l.logical_session_id,l.parent_binding_id,b.native_session_id,b.config FROM nma_adapter_bindings b LEFT JOIN nma_session_lineage l USING(owner_id,binding_id) WHERE b.owner_id=? AND b.binding_id=?",
            (self.store.owner, key),
        ).fetchone()
        if not row:
            raise EngineError("NOT_FOUND")
        from hermes_state_local import local_receipt

        receipt = local_receipt(self.store.authority.db, row[2]) if row[2] else None
        return {
            "logical_session_id": row[0],
            "parent_binding_id": row[1],
            "native_session_id": row[2],
            "native_tip": receipt["entry"]["session_id"] if receipt else None,
            "lineage": receipt.get("lineage", []) if receipt else [],
            "settings": json.loads(row[3]).get("session", {}),
        }
