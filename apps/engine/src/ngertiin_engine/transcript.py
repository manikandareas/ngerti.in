"""Reconstruct scoped, finalized text from native terminal receipts without execution."""

import json
from datetime import UTC, datetime
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import EngineError, canonical, uuid


def now():
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


class Transcript:
    def __init__(self, store):
        self.store = store

    def message(self, conn, message_id):
        row = conn.execute(
            "SELECT message_id,thread_id,message_seq,author_kind,author_agent_id,run_id,parts,context_generation FROM nma_messages WHERE owner_id=? AND message_id=?",
            (self.store.owner, uuid(message_id)),
        ).fetchone()
        if not row:
            raise EngineError("NOT_FOUND")
        item = dict(
            zip(
                (
                    "message_id",
                    "thread_id",
                    "message_seq",
                    "author_kind",
                    "author_agent_id",
                    "run_id",
                    "content",
                    "context_generation",
                ),
                row,
            )
        )
        for key in ("message_seq", "context_generation"):
            item[key] = str(item[key])
        item["parts"] = json.loads(item["content"])
        item["content"] = item["parts"][0]["text"]
        item["revision"] = "1"
        return item

    def append(self, conn, run_id, config, author, content):
        message_id = str(
            uuid5(NAMESPACE_URL, self.store.owner + ":" + run_id + ":" + author)
        )
        if conn.execute(
            "SELECT 1 FROM nma_messages WHERE owner_id=? AND message_id=?",
            (self.store.owner, message_id),
        ).fetchone():
            return
        seq = conn.execute(
            "SELECT next_message_seq FROM nma_threads WHERE owner_id=? AND thread_id=?",
            (self.store.owner, config["thread_id"]),
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO nma_messages(owner_id,message_id,thread_id,message_seq,author_kind,author_agent_id,run_id,parts,context_generation,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                self.store.owner,
                message_id,
                config["thread_id"],
                seq,
                author,
                config["agent_id"] if author == "agent" else None,
                run_id,
                canonical([{"type": "text", "text": content}]),
                int(config["context_generation"]),
                now(),
            ),
        )
        conn.execute(
            "UPDATE nma_threads SET next_message_seq=next_message_seq+1 WHERE owner_id=? AND thread_id=?",
            (self.store.owner, config["thread_id"]),
        )

    def reconcile(self):
        """Read already settled native results; never replay execution or side effects."""
        from gateway.session_results import admission_result

        rows = self.store.write(
            lambda conn: conn.execute(
                "SELECT r.run_id,r.native_admission_id,b.config,c.body FROM nma_adapter_runs r JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id JOIN nma_commands c ON c.owner_id=r.owner_id AND c.command_id=r.operation_id WHERE r.owner_id=? AND r.native_admission_id IS NOT NULL AND EXISTS (SELECT 1 FROM nma_threads t WHERE t.owner_id=r.owner_id AND t.thread_id=json_extract(b.config,'$.thread_id')) AND NOT EXISTS (SELECT 1 FROM nma_context_receipts x WHERE x.owner_id=r.owner_id AND x.run_id=r.run_id) ORDER BY c.rowid",
                (self.store.owner,),
            ).fetchall()
        )
        for run_id, admission_id, raw, body in rows:
            config = json.loads(raw)
            result = admission_result(self.store.authority.db, admission_id)
            if result is None:
                continue

            def record(conn, run_id=run_id, config=config, body=body, result=result):
                thread = conn.execute(
                    "SELECT context_generation FROM nma_threads WHERE owner_id=? AND thread_id=?",
                    (self.store.owner, config["thread_id"]),
                ).fetchone()
                if not thread:
                    return
                self.append(
                    conn, run_id, config, "user", json.loads(body)["payload"]["text"]
                )
                value = result.get("result", {})
                if (
                    not conn.execute(
                        "SELECT 1 FROM nma_effects WHERE owner_id=? AND run_id=? AND status='dispatching'",
                        (self.store.owner, run_id),
                    ).fetchone()
                    and not value.get("failed")
                    and not value.get("error")
                    and not value.get("interrupted")
                    and not conn.execute(
                        "SELECT 1 FROM nma_agent_run_fences WHERE owner_id=? AND run_id=? UNION ALL SELECT 1 FROM nma_context_run_fences WHERE owner_id=? AND run_id=? UNION ALL SELECT 1 FROM nma_run_stops WHERE owner_id=? AND run_id=?",
                        (self.store.owner, run_id) * 3,
                    ).fetchone()
                ):
                    content = value.get("final_response")
                    if isinstance(content, str) and content:
                        self.append(conn, run_id, config, "agent", content)

                conn.execute(
                    "INSERT OR IGNORE INTO nma_context_receipts VALUES (?,?)",
                    (self.store.owner, run_id),
                )

            self.store.write(record)
