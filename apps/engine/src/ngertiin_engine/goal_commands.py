"""Authenticated optional goal controls; ordinary chat remains the default ingress."""

import json

from ngertiin_engine.contracts import (
    EngineError,
    canonical,
    counter,
    digest,
    next_sequence,
    uuid,
)
from ngertiin_engine.goal_lifecycle import Lifecycle


class GoalCommands:
    def __init__(self, adapter):
        self.adapter, self.store = adapter, adapter.store

    def read(self, payload):
        if set(payload) != {"goal_id"}:
            raise EngineError("INVALID_REQUEST")
        return self.store.write(
            lambda conn: {"goal": self.get(conn, payload["goal_id"])}
        )

    def get(self, conn, identity):
        row = conn.execute(
            "SELECT thread_id,responsible_agent_id FROM nma_goals WHERE owner_id=? AND goal_id=?",
            (self.store.owner, uuid(identity)),
        ).fetchone()
        if not row:
            raise EngineError("NOT_FOUND")
        return next(
            g
            for g in self.adapter.goals.listing(conn, *row)
            if g["goal_id"] == identity
        )

    def mutate(self, body):
        action, payload = body["type"].removeprefix("goal."), body["payload"]
        if action not in {"pause", "stop", "resume", "reopen"}:
            raise EngineError("INVALID_REQUEST")
        expected = {"goal_id"} | (
            {"source_message_id"} if action in {"resume", "reopen"} else set()
        )
        if set(payload) != expected:
            raise EngineError("INVALID_REQUEST")
        if action in {"pause", "stop"}:
            if body["expected_revision"] is not None:
                raise EngineError("INVALID_REQUEST")
        else:
            counter(body["expected_revision"])

        def apply(conn):
            prior = conn.execute(
                "SELECT payload_digest,result FROM nma_commands WHERE owner_id=? AND command_id=?",
                (self.store.owner, body["command_id"]),
            ).fetchone()
            if prior:
                if prior[0] != digest(body):
                    raise EngineError("COMMAND_CONFLICT")
                return json.loads(prior[1])
            try:
                goal = self.get(conn, payload["goal_id"])
                run_id, message_id = goal["source_run_id"], goal["source_message_id"]
                args = {"action": action, "goal_id": goal["goal_id"]}
                if action in {"resume", "reopen"}:
                    row = conn.execute(
                        "SELECT run_id FROM nma_messages WHERE owner_id=? AND message_id=? AND thread_id=? AND author_kind='user'",
                        (
                            self.store.owner,
                            uuid(payload["source_message_id"]),
                            goal["thread_id"],
                        ),
                    ).fetchone()
                    if not row:
                        raise EngineError("NOT_FOUND")
                    run_id, message_id = row[0], payload["source_message_id"]
                    args["expected_revision"] = body["expected_revision"]
                lifecycle = Lifecycle(self.store)
                changed = lifecycle.mutate(
                    conn, goal, run_id, message_id, args, owner=True
                )
                updated = self.get(conn, goal["goal_id"])
                if action in {"resume", "reopen"}:
                    lifecycle.link(conn, updated, run_id, message_id, "continue")
                    # Fresh generation makes this an independent explicit wake.
                    conn.execute(
                        "UPDATE nma_goal_units SET settled=0 WHERE owner_id=? AND goal_id=? AND generation=? AND run_id=?",
                        (
                            self.store.owner,
                            goal["goal_id"],
                            int(updated["generation"]),
                            run_id,
                        ),
                    )
                    updated = self.get(conn, goal["goal_id"])
                if changed:
                    config = json.loads(
                        conn.execute(
                            "SELECT b.config FROM nma_adapter_runs r JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id WHERE r.owner_id=? AND r.run_id=?",
                            (self.store.owner, run_id),
                        ).fetchone()[0]
                    )
                    self.adapter.reliability.append(
                        conn,
                        run_id,
                        config,
                        "goal.changed",
                        {
                            "goal": updated,
                            "source_message_id": message_id,
                            "command_id": body["command_id"],
                        },
                    )
                result = {"goal": updated}
            except EngineError as exc:
                result = {"error_code": exc.code}
            seq = next_sequence(conn, self.store.owner)
            receipt = {
                "schema_version": "nma.v1",
                "command_id": body["command_id"],
                "status": "rejected" if result.get("error_code") else "accepted",
                "committed_seq": str(seq),
                **result,
            }
            encoded = canonical(receipt)
            conn.execute(
                "INSERT INTO nma_commands VALUES (?,?,?,?,?)",
                (
                    self.store.owner,
                    body["command_id"],
                    digest(body),
                    canonical(body),
                    encoded,
                ),
            )
            conn.execute(
                "INSERT INTO nma_events VALUES (?,?,?,?)",
                (self.store.owner, seq, body["command_id"], encoded),
            )
            return receipt

        result = self.store.write(apply)
        if result.get("error_code"):
            raise EngineError(result["error_code"])
        return result
