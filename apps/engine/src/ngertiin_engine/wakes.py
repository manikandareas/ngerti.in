"""Gateway-owned durable schedule/idle-heartbeat ingress (ADR-05).

Native Hermes heartbeat due checks and interval arithmetic are wake producers.
Product receipts/outbox share the existing owner transaction and admission path.
No native cron job or session heartbeat is also registered for these definitions.
"""

import json
import time
from datetime import UTC, datetime
from uuid import NAMESPACE_URL, uuid5
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from ngertiin_engine.contracts import EngineError, canonical, counter, digest

DDL = (
    "CREATE TABLE nma_trigger_definitions (owner_id TEXT NOT NULL, definition_id TEXT NOT NULL, goal_id TEXT NOT NULL, goal_generation INTEGER NOT NULL, context_generation INTEGER NOT NULL, revision INTEGER NOT NULL CHECK(revision>=1), kind TEXT NOT NULL CHECK(kind IN ('schedule','heartbeat')), state TEXT NOT NULL CHECK(state IN ('enabled','paused','deleted')), configuration TEXT NOT NULL, timezone TEXT NOT NULL, missed_policy TEXT NOT NULL CHECK(missed_policy='coalesce'), next_at REAL, PRIMARY KEY(owner_id,definition_id), UNIQUE(owner_id,goal_id), FOREIGN KEY(owner_id,goal_id) REFERENCES nma_goals(owner_id,goal_id))",
    "CREATE TABLE nma_triggers (owner_id TEXT NOT NULL, trigger_id TEXT NOT NULL, definition_id TEXT NOT NULL, definition_revision INTEGER NOT NULL, source_key TEXT NOT NULL, payload_digest TEXT NOT NULL, source_payload TEXT NOT NULL, intended_at REAL NOT NULL, coalesced_through REAL NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','admitted','settled','cancelled','rejected')), run_id TEXT, PRIMARY KEY(owner_id,trigger_id), UNIQUE(owner_id,source_key), FOREIGN KEY(owner_id,definition_id) REFERENCES nma_trigger_definitions(owner_id,definition_id), FOREIGN KEY(owner_id,run_id) REFERENCES nma_adapter_runs(owner_id,run_id))",
    "CREATE INDEX nma_wakes_due ON nma_trigger_definitions(owner_id,state,next_at)",
)


def utc(value):
    return datetime.fromtimestamp(value, UTC).isoformat().replace("+00:00", "Z")


def configuration(args, now):
    """Explicit UTC instants/fixed elapsed intervals; no implicit local DST rules."""
    from hermes_cli.heartbeat import MIN_INTERVAL_SECONDS

    try:
        zone = args["timezone"]
        ZoneInfo(zone)
        mode = args["kind"]
        if mode not in {"once", "interval", "heartbeat"}:
            raise ValueError
        expected = {"kind", "timezone", "missed_policy"}
        expected.add("at" if mode == "once" else "interval_seconds")
        if set(args) != expected or args["missed_policy"] != "coalesce":
            raise ValueError
        if mode == "once":
            stamp = datetime.fromisoformat(args["at"])
            if stamp.tzinfo is None:
                raise ValueError
            due = stamp.timestamp()
            if due <= now:
                raise ValueError
        else:
            interval = args["interval_seconds"]
            if (
                type(interval) is not int
                or not MIN_INTERVAL_SECONDS <= interval <= 31536000
            ):
                raise ValueError
            due = now + interval
        return dict(args), due
    except (
        KeyError,
        TypeError,
        ValueError,
        OverflowError,
        ZoneInfoNotFoundError,
    ) as exc:
        raise EngineError("INVALID_WAKE_CONFIGURATION") from exc


def next_time(config, now):
    if config["kind"] == "once":
        return None
    if config["kind"] == "heartbeat":
        return now + config["interval_seconds"]
    from cron.jobs import compute_next_run

    result = compute_next_run(
        {"kind": "interval", "minutes": config["interval_seconds"] / 60}, utc(now)
    )
    return datetime.fromisoformat(result).timestamp()


class Wakes:
    def __init__(self, store):
        self.store = store

    def read(self, conn, goal_id):
        row = conn.execute(
            "SELECT definition_id,revision,kind,state,configuration,next_at,goal_generation FROM nma_trigger_definitions WHERE owner_id=? AND goal_id=?",
            (self.store.owner, goal_id),
        ).fetchone()
        if not row:
            return None
        return {
            "definition_id": row[0],
            "revision": str(row[1]),
            "kind": row[2],
            "state": row[3],
            "configuration": json.loads(row[4]),
            "next_at": utc(row[5]) if row[5] is not None else None,
            "goal_generation": str(row[6]),
        }

    def set(self, conn, goal, config, run_id, message_id, args, now=None):
        from ngertiin_engine.goal_lifecycle import Lifecycle

        now = time.time() if now is None else now
        if set(args) != {"action", "goal_id", "expected_revision", "wake"}:
            raise EngineError("INVALID_REQUEST")
        if counter(args["expected_revision"]) != goal["revision"]:
            raise EngineError("REVISION_CONFLICT")
        if goal["status"] not in {"active", "waiting"}:
            raise EngineError("GOAL_STOPPED")
        settings, due = configuration(args["wake"], now)
        identity = str(
            uuid5(NAMESPACE_URL, self.store.owner + ":wake:" + goal["goal_id"])
        )
        previous = self.read(conn, goal["goal_id"])
        revision = int(previous["revision"]) + 1 if previous else 1
        lifecycle = Lifecycle(self.store)
        # Editing the definition fences prior queued/running automatic work as well.
        lifecycle.fence(conn, goal["goal_id"], except_run=run_id)
        lifecycle.changed(conn, goal["goal_id"], generation=True)
        lifecycle.state(
            conn, goal["goal_id"], "waiting", goal["progress"], "Scheduled wake"
        )
        conn.execute(
            "UPDATE nma_triggers SET status='cancelled' WHERE owner_id=? AND definition_id=? AND status IN ('pending','admitted')",
            (self.store.owner, identity),
        )
        conn.execute(
            "INSERT INTO nma_trigger_definitions VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,definition_id) DO UPDATE SET goal_generation=excluded.goal_generation,context_generation=excluded.context_generation,revision=excluded.revision,kind=excluded.kind,state=excluded.state,configuration=excluded.configuration,timezone=excluded.timezone,missed_policy=excluded.missed_policy,next_at=excluded.next_at",
            (
                self.store.owner,
                identity,
                goal["goal_id"],
                int(goal["generation"]) + 1,
                int(config["context_generation"]),
                revision,
                "heartbeat" if settings["kind"] == "heartbeat" else "schedule",
                "enabled",
                canonical(settings),
                settings["timezone"],
                "coalesce",
                due,
            ),
        )
        updated = dict(goal, generation=str(int(goal["generation"]) + 1))
        lifecycle.link(conn, updated, run_id, message_id, "wait")
        return True

    def invalidate(self, conn):
        # Old-generation watches never resurrect after pause/resume, reset or completion.
        conn.execute(
            "UPDATE nma_trigger_definitions SET state='paused',next_at=NULL WHERE owner_id=? AND state='enabled' AND EXISTS (SELECT 1 FROM nma_goals g JOIN nma_goal_lifecycle l ON l.owner_id=g.owner_id AND l.goal_id=g.goal_id JOIN nma_threads t ON t.owner_id=g.owner_id AND t.thread_id=g.thread_id WHERE g.owner_id=nma_trigger_definitions.owner_id AND g.goal_id=nma_trigger_definitions.goal_id AND (g.generation!=nma_trigger_definitions.goal_generation OR t.context_generation!=nma_trigger_definitions.context_generation OR t.status!='open' OR l.status NOT IN ('active','waiting')))",
            (self.store.owner,),
        )
        conn.execute(
            "UPDATE nma_triggers SET status='cancelled' WHERE owner_id=? AND status='pending' AND EXISTS (SELECT 1 FROM nma_trigger_definitions d WHERE d.owner_id=nma_triggers.owner_id AND d.definition_id=nma_triggers.definition_id AND (d.state!='enabled' OR d.revision!=nma_triggers.definition_revision))",
            (self.store.owner,),
        )

    def collect(self, conn, now):
        from hermes_cli.heartbeat import HeartbeatState

        self.invalidate(conn)
        rows = conn.execute(
            "SELECT definition_id,revision,kind,configuration,next_at,goal_generation,context_generation FROM nma_trigger_definitions WHERE owner_id=? AND state='enabled' AND next_at<=? ORDER BY next_at,definition_id",
            (self.store.owner, now),
        ).fetchall()
        for identity, revision, kind, raw, due, generation, context in rows:
            config = json.loads(raw)
            if kind == "heartbeat" and not HeartbeatState(
                prompt="Persistent responsibility",
                interval_seconds=config["interval_seconds"],
                created_at=due - config["interval_seconds"],
            ).is_due(now):
                continue
            source = {
                "configuration": config,
                "goal_generation": str(generation),
                "context_generation": str(context),
            }
            key = canonical([kind, identity, str(revision), utc(due)])
            trigger = str(uuid5(NAMESPACE_URL, self.store.owner + ":" + key))
            # One durable due window. Its start/end encode every missed periodic tick;
            # no unbounded insertion loop after a long outage and no lost accepted input.
            conn.execute(
                "INSERT OR IGNORE INTO nma_triggers VALUES (?,?,?,?,?,?,?,?,?,'pending',NULL)",
                (
                    self.store.owner,
                    trigger,
                    identity,
                    revision,
                    key,
                    digest(source),
                    canonical(source),
                    due,
                    now,
                ),
            )

    def busy(self, conn, thread_id):
        return (
            conn.execute(
                "SELECT 1 FROM nma_adapter_runs r JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id LEFT JOIN nma_run_terminals t ON t.owner_id=r.owner_id AND t.run_id=r.run_id WHERE r.owner_id=? AND json_extract(b.config,'$.thread_id')=? AND t.run_id IS NULL LIMIT 1",
                (self.store.owner, thread_id),
            ).fetchone()
            is not None
        )

    def prepare(self, adapter, bridge, now):
        self.store.write(lambda conn: self.collect(conn, now))
        rows = self.store.write(
            lambda conn: conn.execute(
                "SELECT t.trigger_id,d.goal_id FROM nma_triggers t JOIN nma_trigger_definitions d ON d.owner_id=t.owner_id AND d.definition_id=t.definition_id WHERE t.owner_id=? AND t.status='pending' ORDER BY t.intended_at,t.trigger_id",
                (self.store.owner,),
            ).fetchall()
        )
        for trigger_id, goal_id in rows:
            self.admit_pending(adapter, bridge, now, trigger_id, goal_id)
        self.store.write(
            lambda conn: conn.execute(
                "UPDATE nma_triggers SET status='settled' WHERE owner_id=? AND status='admitted' AND EXISTS (SELECT 1 FROM nma_run_terminals r WHERE r.owner_id=nma_triggers.owner_id AND r.run_id=nma_triggers.run_id)",
                (self.store.owner,),
            )
        )

    def admit_pending(self, adapter, bridge, now, trigger_id, goal_id):
        from ngertiin_engine.goal_commands import GoalCommands

        goal = self.store.write(lambda conn: GoalCommands(adapter).get(conn, goal_id))
        if self.store.write(lambda conn: self.busy(conn, goal["thread_id"])):
            return
        agent = self.store.write(
            lambda conn: adapter.agents.get(conn, goal["responsible_agent_id"])
        )
        thread = self.store.write(
            lambda conn: adapter.threads.get(conn, goal["thread_id"])
        )
        try:
            key, config = adapter.binding(
                {
                    "agent_id": goal["responsible_agent_id"],
                    "thread_id": goal["thread_id"],
                    "config_revision": agent["config_revision"],
                    "context_generation": thread["context_generation"],
                }
            )
        except EngineError as exc:
            if exc.code in {"AUTHORITY_LOST", "ENGINE_UNAVAILABLE"}:
                raise

            def reject(conn, reason=exc.code):
                conn.execute(
                    "UPDATE nma_triggers SET status='rejected' WHERE owner_id=? AND trigger_id=?",
                    (self.store.owner, trigger_id),
                )
                bridge.lifecycle.changed(conn, goal_id)
                bridge.lifecycle.state(conn, goal_id, "blocked", reason)
                previous = conn.execute(
                    "SELECT b.config FROM nma_adapter_runs r JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id WHERE r.owner_id=? AND r.run_id=?",
                    (self.store.owner, goal["source_run_id"]),
                ).fetchone()
                adapter.reliability.append(
                    conn,
                    goal["source_run_id"],
                    json.loads(previous[0]),
                    "goal.changed",
                    {
                        "goal": GoalCommands(adapter).get(conn, goal_id),
                        "trigger_id": trigger_id,
                    },
                )

            self.store.write(reject)
            return

        def admit(conn):
            self.invalidate(conn)
            row = conn.execute(
                "SELECT t.status,d.configuration FROM nma_triggers t JOIN nma_trigger_definitions d ON d.owner_id=t.owner_id AND d.definition_id=t.definition_id WHERE t.owner_id=? AND t.trigger_id=?",
                (self.store.owner, trigger_id),
            ).fetchone()
            if row[0] != "pending" or self.busy(conn, goal["thread_id"]):
                return
            current = GoalCommands(adapter).get(conn, goal_id)
            bridge.lifecycle.changed(conn, goal_id)
            bridge.lifecycle.state(conn, goal_id, "active", current["progress"])
            run_id = bridge.prepare(
                conn,
                current,
                current["source_run_id"],
                current["source_message_id"],
                trigger_id,
                key,
                config,
                {"trigger_id": trigger_id, "configuration": json.loads(row[1])},
            )
            conn.execute(
                "UPDATE nma_triggers SET status='admitted',run_id=?,coalesced_through=? WHERE owner_id=? AND trigger_id=?",
                (run_id, now, self.store.owner, trigger_id),
            )
            conn.execute(
                "UPDATE nma_trigger_definitions SET next_at=? WHERE owner_id=? AND goal_id=?",
                (next_time(json.loads(row[1]), now), self.store.owner, goal_id),
            )
            adapter.reliability.append(
                conn,
                run_id,
                config,
                "goal.changed",
                {
                    "goal": GoalCommands(adapter).get(conn, goal_id),
                    "trigger_id": trigger_id,
                },
            )

        self.store.write(admit)
