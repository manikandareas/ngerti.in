"""Persistent responsibility lifecycle under the Hermes gateway transaction owner.

The native Kanban/session bridge lives in goal_continuation. These mutations never
invoke a model, deliver cancellation or cross a native transaction boundary.
"""

import json
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import EngineError, canonical, counter, digest
from ngertiin_engine.direct_messages import command
from ngertiin_engine.reliability import Reliability

DDL = (
    "CREATE TABLE nma_goal_lifecycle (owner_id TEXT NOT NULL, goal_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','waiting','blocked','paused','stopped','completed')), progress TEXT NOT NULL DEFAULT '', wake_condition TEXT, PRIMARY KEY(owner_id,goal_id), FOREIGN KEY(owner_id,goal_id) REFERENCES nma_goals(owner_id,goal_id))",
    "INSERT INTO nma_goal_lifecycle(owner_id,goal_id,status) SELECT owner_id,goal_id,status FROM nma_goals",
    "CREATE TABLE nma_goal_units (owner_id TEXT NOT NULL, goal_id TEXT NOT NULL, generation INTEGER NOT NULL, run_id TEXT NOT NULL, source_message_id TEXT NOT NULL, parent_run_id TEXT, verdict TEXT CHECK(verdict IN ('continue','wait','blocked','done')), settled INTEGER NOT NULL DEFAULT 0 CHECK(settled IN (0,1)), native_card_id TEXT, PRIMARY KEY(owner_id,goal_id,generation,run_id), FOREIGN KEY(owner_id,goal_id) REFERENCES nma_goals(owner_id,goal_id), FOREIGN KEY(owner_id,run_id) REFERENCES nma_adapter_runs(owner_id,run_id), FOREIGN KEY(owner_id,source_message_id) REFERENCES nma_messages(owner_id,message_id), FOREIGN KEY(owner_id,parent_run_id) REFERENCES nma_adapter_runs(owner_id,run_id))",
    "CREATE INDEX nma_goal_units_run ON nma_goal_units(owner_id,run_id)",
    "CREATE INDEX nma_goal_units_pending ON nma_goal_units(owner_id,settled)",
    "CREATE TABLE nma_goal_evidence (owner_id TEXT NOT NULL, evidence_id TEXT NOT NULL, goal_id TEXT NOT NULL, generation INTEGER NOT NULL, producing_run_id TEXT NOT NULL, source_message_id TEXT NOT NULL, criterion TEXT NOT NULL, summary TEXT NOT NULL, accepted_by_agent_id TEXT NOT NULL, PRIMARY KEY(owner_id,evidence_id), UNIQUE(owner_id,goal_id,generation,source_message_id,criterion), FOREIGN KEY(owner_id,goal_id) REFERENCES nma_goals(owner_id,goal_id), FOREIGN KEY(owner_id,source_message_id) REFERENCES nma_messages(owner_id,message_id), FOREIGN KEY(owner_id,producing_run_id) REFERENCES nma_adapter_runs(owner_id,run_id))",
)
ACTIONS = {
    "continue",
    "wait",
    "block",
    "complete",
    "pause",
    "resume",
    "reopen",
    "submit_evidence",
}


class Lifecycle:
    def __init__(self, store):
        self.store = store
        self.reliability = Reliability(store)

    def enrich(self, conn, goal):
        row = conn.execute(
            "SELECT status,progress,wake_condition FROM nma_goal_lifecycle WHERE owner_id=? AND goal_id=?",
            (self.store.owner, goal["goal_id"]),
        ).fetchone()
        if row:
            goal.update(status=row[0], progress=row[1], wake_condition=row[2])
        else:
            goal.update(progress="", wake_condition=None)
        goal["evidence"] = [
            dict(
                zip(
                    (
                        "evidence_id",
                        "generation",
                        "producing_run_id",
                        "source_message_id",
                        "criterion",
                        "summary",
                        "accepted_by_agent_id",
                    ),
                    row,
                )
            )
            for row in conn.execute(
                "SELECT evidence_id,CAST(generation AS TEXT),producing_run_id,source_message_id,criterion,summary,accepted_by_agent_id FROM nma_goal_evidence WHERE owner_id=? AND goal_id=? ORDER BY rowid",
                (self.store.owner, goal["goal_id"]),
            )
        ]
        goal["units"] = [
            {
                "run_id": r[0],
                "generation": str(r[1]),
                "parent_run_id": r[2],
                "verdict": r[3],
                "settled": bool(r[4]),
                "agent_id": r[5],
                "status": r[6] or "pending",
            }
            for r in conn.execute(
                "SELECT u.run_id,u.generation,u.parent_run_id,u.verdict,u.settled,json_extract(b.config,'$.agent_id'),t.status FROM nma_goal_units u JOIN nma_adapter_runs r ON r.owner_id=u.owner_id AND r.run_id=u.run_id JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id LEFT JOIN nma_run_terminals t ON t.rowid=(SELECT MAX(x.rowid) FROM nma_run_terminals x WHERE x.owner_id=u.owner_id AND x.run_id=u.run_id) WHERE u.owner_id=? AND u.goal_id=? ORDER BY u.rowid",
                (self.store.owner, goal["goal_id"]),
            )
        ]
        from ngertiin_engine.wakes import Wakes

        goal["wake"] = Wakes(self.store).read(conn, goal["goal_id"])
        return goal

    def state(self, conn, goal_id, status, progress="", wake=None):
        conn.execute(
            "INSERT INTO nma_goal_lifecycle VALUES (?,?,?,?,?) ON CONFLICT(owner_id,goal_id) DO UPDATE SET status=excluded.status,progress=excluded.progress,wake_condition=excluded.wake_condition",
            (self.store.owner, goal_id, status, progress, wake),
        )
        from ngertiin_engine.wakes import Wakes

        Wakes(self.store).invalidate(conn)

    def link(self, conn, goal, run_id, message_id, verdict=None, parent=None):
        conn.execute(
            "INSERT INTO nma_goal_units(owner_id,goal_id,generation,run_id,source_message_id,parent_run_id,verdict) VALUES (?,?,?,?,?,?,?) ON CONFLICT(owner_id,goal_id,generation,run_id) DO UPDATE SET verdict=excluded.verdict,settled=0",
            (
                self.store.owner,
                goal["goal_id"],
                int(goal["generation"]),
                run_id,
                message_id,
                parent,
                verdict,
            ),
        )

    def fence(self, conn, goal_id, *, except_run=None):
        conn.execute(
            "UPDATE nma_discussions SET status='cancelled',reason='goal_fenced' WHERE owner_id=? AND discussion_id IN (SELECT discussion_id FROM nma_discussion_goals WHERE owner_id=? AND goal_id=?)",
            (self.store.owner, self.store.owner, goal_id),
        )
        rows = conn.execute(
            "SELECT DISTINCT run_id FROM nma_goal_units WHERE owner_id=? AND goal_id=?",
            (self.store.owner, goal_id),
        ).fetchall()
        for (run_id,) in rows:
            if run_id == except_run:
                continue
            # Settled results remain valid evidence; only live/pending work is cancelled.
            if conn.execute(
                "SELECT 1 FROM nma_run_terminals WHERE owner_id=? AND run_id=?",
                (self.store.owner, run_id),
            ).fetchone():
                continue
            cancel = command(
                "run.cancel",
                {"run_id": run_id},
                str(uuid5(NAMESPACE_URL, self.store.owner + ":goal-stop:" + run_id)),
            )
            conn.execute(
                "INSERT OR IGNORE INTO nma_commands VALUES (?,?,?,?,NULL)",
                (
                    self.store.owner,
                    cancel["command_id"],
                    digest(cancel),
                    canonical(cancel),
                ),
            )
            conn.execute(
                "INSERT OR IGNORE INTO nma_runtime_outbox VALUES (?,?,?,'pending',NULL)",
                (self.store.owner, cancel["command_id"], canonical(cancel)),
            )
            self.reliability.cancel_event(conn, run_id)

    def changed(self, conn, goal_id, *, generation=False):
        conn.execute(
            "UPDATE nma_goals SET revision=revision+1,generation=generation+?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE owner_id=? AND goal_id=?",
            (int(generation), self.store.owner, goal_id),
        )

    def mutate(self, conn, goal, run_id, message_id, args, *, owner=False):
        action = args["action"]
        fields = {"action", "goal_id"}
        if action not in {"pause", "stop"}:
            fields.add("expected_revision")
        if action in {"continue", "wait", "block"}:
            fields.add("summary")
        if action == "wait":
            fields.add("wake_condition")
        if action == "complete":
            fields.add("evidence_ids")
        if action == "submit_evidence":
            fields |= {"source_message_id", "criterion", "summary"}
        if set(args) != fields:
            raise EngineError(
                "INVALID_REQUEST",
                {
                    "required_fields": sorted(fields),
                    "unexpected_fields": sorted(set(args) - fields),
                },
            )
        if (
            action not in {"pause", "stop"}
            and counter(args["expected_revision"]) != goal["revision"]
        ):
            raise EngineError("REVISION_CONFLICT")
        for key in ("summary", "wake_condition", "criterion"):
            if key in args and (
                not isinstance(args[key], str)
                or not 1 <= len(args[key].strip()) <= 4000
            ):
                raise EngineError("INVALID_REQUEST")
        status = goal["status"]
        if action in {"pause", "stop"}:
            target = "paused" if action == "pause" else "stopped"
            if status == target:
                return False
            if status in {"stopped", "completed"}:
                raise EngineError("INVALID_TRANSITION")
            self.changed(conn, goal["goal_id"], generation=True)
            self.state(conn, goal["goal_id"], target, goal["progress"])
            if action == "stop":
                conn.execute(
                    "UPDATE nma_goals SET status='stopped' WHERE owner_id=? AND goal_id=?",
                    (self.store.owner, goal["goal_id"]),
                )
            self.fence(conn, goal["goal_id"])
            return True
        if action in {"resume", "reopen"}:
            valid = (
                {"paused", "waiting", "blocked"}
                if action == "resume"
                else {"stopped", "completed"}
            )
            if status not in valid:
                raise EngineError("INVALID_TRANSITION")
            # Agent-driven resume/reopen must originate in a fresh real user turn.
            if (
                not owner
                and not conn.execute(
                    "SELECT 1 FROM nma_messages WHERE owner_id=? AND run_id=? AND message_id=? AND author_kind='user'",
                    (self.store.owner, run_id, message_id),
                ).fetchone()
            ):
                raise EngineError("USER_INTENT_REQUIRED")
            self.fence(conn, goal["goal_id"], except_run=run_id)
            self.changed(conn, goal["goal_id"], generation=True)
            conn.execute(
                "UPDATE nma_goals SET status='active' WHERE owner_id=? AND goal_id=?",
                (self.store.owner, goal["goal_id"]),
            )
            self.state(conn, goal["goal_id"], "active", goal["progress"])
            # The fresh user turn owns the next decision. Owner controls queue via bridge.
            if not owner:
                self.link(
                    conn,
                    {**goal, "generation": str(int(goal["generation"]) + 1)},
                    run_id,
                    message_id,
                    "continue",
                )
            return True
        if status in {"paused", "stopped", "completed"}:
            raise EngineError("INVALID_TRANSITION")
        if action == "submit_evidence":
            self.evidence(conn, goal, args)
            self.changed(conn, goal["goal_id"])
            return True
        if action == "complete":
            ids = args["evidence_ids"]
            if (
                not isinstance(ids, list)
                or not ids
                or len(ids) > 100
                or any(not isinstance(i, str) for i in ids)
            ):
                raise EngineError("EVIDENCE_REQUIRED")
            evidence = {
                e["evidence_id"]: e
                for e in goal["evidence"]
                if e["generation"] == goal["generation"]
            }
            if not set(ids) <= evidence.keys():
                raise EngineError("EVIDENCE_REQUIRED")
            for identity in ids:
                if self.reliability.stopped(
                    conn, evidence[identity]["producing_run_id"]
                ):
                    raise EngineError("EVIDENCE_REQUIRED")
            target, verdict, progress, wake = (
                "completed",
                "done",
                "\n".join(
                    evidence[identity]["summary"] for identity in dict.fromkeys(ids)
                ),
                None,
            )
        else:
            target = {"continue": "active", "wait": "waiting", "block": "blocked"}[
                action
            ]
            verdict = {"continue": "continue", "wait": "wait", "block": "blocked"}[
                action
            ]
            progress, wake = args["summary"], args.get("wake_condition")
        self.link(conn, goal, run_id, message_id, verdict)
        self.changed(conn, goal["goal_id"], generation=action == "complete")
        self.state(conn, goal["goal_id"], target, progress, wake)
        if action == "complete":
            self.fence(conn, goal["goal_id"], except_run=run_id)
        return True

    def agent_unavailable(self, conn, agent_id):
        from ngertiin_engine.goals import Goals

        rows = conn.execute(
            "SELECT DISTINCT thread_id FROM nma_goals WHERE owner_id=? AND responsible_agent_id=?",
            (self.store.owner, agent_id),
        ).fetchall()
        for (thread_id,) in rows:
            for goal in Goals(self.store).listing(conn, thread_id, agent_id):
                if goal["status"] not in {"active", "waiting", "blocked"}:
                    continue
                if (
                    goal["status"] == "blocked"
                    and goal["progress"] == "AGENT_UNAVAILABLE"
                ):
                    continue
                self.changed(conn, goal["goal_id"], generation=True)
                self.state(conn, goal["goal_id"], "blocked", "AGENT_UNAVAILABLE")
                self.fence(conn, goal["goal_id"])
                updated = self.enrich(
                    conn,
                    {
                        **goal,
                        "revision": str(int(goal["revision"]) + 1),
                        "generation": str(int(goal["generation"]) + 1),
                    },
                )
                config = json.loads(
                    conn.execute(
                        "SELECT b.config FROM nma_adapter_runs r JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id WHERE r.owner_id=? AND r.run_id=?",
                        (self.store.owner, goal["source_run_id"]),
                    ).fetchone()[0]
                )
                self.reliability.append(
                    conn,
                    goal["source_run_id"],
                    config,
                    "goal.changed",
                    {"goal": updated},
                )

    def evidence(self, conn, goal, args):
        from ngertiin_engine.transcript import Transcript

        message = Transcript(self.store).message(conn, args["source_message_id"])
        if (
            message["thread_id"] != goal["thread_id"]
            or message["author_kind"] != "agent"
            or not message["content"].strip()
        ):
            raise EngineError("NOT_FOUND")
        linked = conn.execute(
            "SELECT 1 FROM nma_goal_units WHERE owner_id=? AND goal_id=? AND generation=? AND run_id=?",
            (
                self.store.owner,
                goal["goal_id"],
                int(goal["generation"]),
                message["run_id"],
            ),
        ).fetchone()
        succeeded = conn.execute(
            "SELECT 1 FROM nma_run_terminals WHERE owner_id=? AND run_id=? AND status='succeeded'",
            (self.store.owner, message["run_id"]),
        ).fetchone()
        if (
            not linked
            or not succeeded
            or self.reliability.stopped(conn, message["run_id"])
        ):
            raise EngineError("EVIDENCE_REQUIRED")
        identity = str(
            uuid5(
                NAMESPACE_URL,
                canonical(
                    [
                        self.store.owner,
                        goal["goal_id"],
                        goal["generation"],
                        message["message_id"],
                        args["criterion"],
                    ]
                ),
            )
        )
        conn.execute(
            "INSERT OR IGNORE INTO nma_goal_evidence VALUES (?,?,?,?,?,?,?,?,?)",
            (
                self.store.owner,
                identity,
                goal["goal_id"],
                int(goal["generation"]),
                message["run_id"],
                message["message_id"],
                args["criterion"],
                args["summary"],
                goal["responsible_agent_id"],
            ),
        )
