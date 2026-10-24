"""Durable external event admission inside the Hermes gateway authority."""

import base64
import hashlib
import hmac
import json
import os
import time
from pathlib import Path
from uuid import uuid4

from ngertiin_engine.contracts import EngineError, canonical, digest
from ngertiin_engine.goal_commands import GoalCommands
from ngertiin_engine.wakes import Wakes

DDL = (
    "CREATE TABLE nma_webhook_batches (owner_id TEXT NOT NULL, batch_id TEXT NOT NULL, route_id TEXT NOT NULL, route_digest TEXT NOT NULL, target TEXT NOT NULL, entity_key TEXT NOT NULL, first_at REAL NOT NULL, deadline REAL NOT NULL, latest_delivery TEXT NOT NULL, payload TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','admitted','settled','cancelled','rejected')), run_id TEXT, error_code TEXT, PRIMARY KEY(owner_id,batch_id), FOREIGN KEY(owner_id) REFERENCES nma_partition(owner_id), FOREIGN KEY(owner_id,run_id) REFERENCES nma_adapter_runs(owner_id,run_id))",
    "CREATE INDEX nma_webhook_due ON nma_webhook_batches(owner_id,state,deadline)",
    "CREATE TABLE nma_webhook_events (owner_id TEXT NOT NULL, route_id TEXT NOT NULL, delivery_id TEXT NOT NULL, payload_digest TEXT NOT NULL, batch_id TEXT NOT NULL, received_at REAL NOT NULL, payload TEXT NOT NULL, superseded_by TEXT, PRIMARY KEY(owner_id,route_id,delivery_id), FOREIGN KEY(owner_id,batch_id) REFERENCES nma_webhook_batches(owner_id,batch_id))",
)


def route(identity):
    try:
        value = json.loads(Path(os.environ["NMA_WEBHOOK_ROUTES_FILE"]).read_text())[
            identity
        ]
        if not isinstance(value, dict):
            raise EngineError("INVALID_CONFIGURATION")
        if not value.get("enabled", True):
            raise KeyError(identity)
        required = {"owner_id", "agent_id", "goal_id", "secret_file"}
        if not required <= value.keys() or any(
            not isinstance(value[k], str) for k in required
        ):
            raise EngineError("INVALID_CONFIGURATION")
        if not isinstance(value.get("coalesce", {}), dict):
            raise EngineError("INVALID_CONFIGURATION")
        return value
    except (KeyError, OSError, ValueError) as exc:
        raise EngineError("NOT_FOUND") from exc


def route_digest(value):
    return digest({k: v for k, v in value.items() if k != "secret_file"})


class Webhooks:
    def __init__(self, adapter):
        self.adapter, self.store = adapter, adapter.store

    def target(self, conn, cfg):
        if cfg["owner_id"] != self.store.owner:
            raise EngineError("NOT_FOUND")
        goal = GoalCommands(self.adapter).get(conn, cfg["goal_id"])
        if goal["responsible_agent_id"] != cfg["agent_id"]:
            raise EngineError("NOT_FOUND")
        if goal["status"] not in {"active", "waiting"}:
            raise EngineError("GOAL_STOPPED")
        thread = self.adapter.threads.get(conn, goal["thread_id"])
        self.adapter.threads.check_binding(
            conn,
            {
                "thread_id": goal["thread_id"],
                "agent_id": cfg["agent_id"],
                "context_generation": thread["context_generation"],
            },
        )
        agent = self.adapter.agents.get(conn, cfg["agent_id"])
        if agent["status"] != "active":
            raise EngineError("AGENT_UNAVAILABLE")
        return goal, {
            "goal_id": goal["goal_id"],
            "agent_id": cfg["agent_id"],
            "thread_id": goal["thread_id"],
            "generation": goal["generation"],
            "context_generation": thread["context_generation"],
            "membership_revision": thread["membership_revision"],
            "config_revision": agent["config_revision"],
            "access_generation": agent["access_generation"],
        }

    def receive(self, body):
        from gateway.platforms.webhook_filters import _MISSING, WebhookRouteProcessor

        p = body["payload"]
        if body["expected_revision"] is not None or set(p) != {
            "route_id",
            "delivery_id",
            "event_type",
            "body_base64",
            "signature",
        }:
            raise EngineError("INVALID_REQUEST")
        for field in ("route_id", "delivery_id", "event_type"):
            if not isinstance(p[field], str) or not 1 <= len(p[field]) <= 200:
                raise EngineError("INVALID_REQUEST")
        cfg = route(p["route_id"])
        try:
            raw = base64.b64decode(p["body_base64"], validate=True)
            try:
                secret = Path(cfg["secret_file"]).read_bytes()
            except OSError as exc:
                raise EngineError("INVALID_CONFIGURATION") from exc
            expected = "sha256=" + hmac.new(secret, raw, "sha256").hexdigest()
            if (
                len(secret) < 32
                or not isinstance(p["signature"], str)
                or not hmac.compare_digest(expected, p["signature"])
            ):
                raise EngineError("UNAUTHENTICATED")
            payload = json.loads(raw)
            if not isinstance(payload, dict) or len(raw) > 512 * 1024:
                raise ValueError
        except (ValueError, TypeError) as exc:
            raise EngineError("INVALID_REQUEST") from exc
        processor = WebhookRouteProcessor()
        if (
            cfg.get("events") and p["event_type"] not in cfg["events"]
        ) or not processor.route_filters_match(cfg, payload, p["event_type"], {}):
            return {"status": "ignored", "reason": "filter"}
        coalesce = cfg.get("coalesce", {})
        window = coalesce.get("window_seconds", 0)
        cap = coalesce.get("max_wait_seconds", 300)
        if (
            type(window) is not int
            or type(cap) is not int
            or not 0 <= window <= cap <= 3600
        ):
            raise EngineError("INVALID_CONFIGURATION")
        entity = processor.resolve_filter_field(
            coalesce.get("key"), payload, p["event_type"], {}
        )
        entity = (
            canonical(entity)
            if entity is not _MISSING and entity is not None
            else "delivery:" + p["delivery_id"]
        )
        fingerprint = digest([p["event_type"], hashlib.sha256(raw).hexdigest()])
        now = time.time()

        def accept(conn):
            previous = conn.execute(
                "SELECT payload_digest,batch_id FROM nma_webhook_events WHERE owner_id=? AND route_id=? AND delivery_id=?",
                (self.store.owner, p["route_id"], p["delivery_id"]),
            ).fetchone()
            if previous:
                if previous[0] != fingerprint:
                    raise EngineError("COMMAND_CONFLICT")
                return {
                    "status": "accepted",
                    "batch_id": previous[1],
                    "duplicate": True,
                }
            _, target = self.target(conn, cfg)
            frozen, config_hash = canonical(target), route_digest(cfg)
            old = (
                conn.execute(
                    "SELECT batch_id,first_at,latest_delivery FROM nma_webhook_batches WHERE owner_id=? AND route_id=? AND route_digest=? AND target=? AND entity_key=? AND state='pending' AND deadline>? ORDER BY first_at LIMIT 1",
                    (self.store.owner, p["route_id"], config_hash, frozen, entity, now),
                ).fetchone()
                if window
                else None
            )
            batch = old[0] if old else str(uuid4())
            deadline = min(now + window, (old[1] if old else now) + cap)
            if old:
                conn.execute(
                    "UPDATE nma_webhook_events SET superseded_by=? WHERE owner_id=? AND route_id=? AND delivery_id=?",
                    (p["delivery_id"], self.store.owner, p["route_id"], old[2]),
                )
                conn.execute(
                    "UPDATE nma_webhook_batches SET deadline=?,latest_delivery=?,payload=? WHERE owner_id=? AND batch_id=?",
                    (
                        deadline,
                        p["delivery_id"],
                        canonical(payload),
                        self.store.owner,
                        batch,
                    ),
                )
            else:
                conn.execute(
                    "INSERT INTO nma_webhook_batches VALUES (?,?,?,?,?,?,?,?,?,?,'pending',NULL,NULL)",
                    (
                        self.store.owner,
                        batch,
                        p["route_id"],
                        config_hash,
                        frozen,
                        entity,
                        now,
                        deadline,
                        p["delivery_id"],
                        canonical(payload),
                    ),
                )
            conn.execute(
                "INSERT INTO nma_webhook_events VALUES (?,?,?,?,?,?,?,NULL)",
                (
                    self.store.owner,
                    p["route_id"],
                    p["delivery_id"],
                    fingerprint,
                    batch,
                    now,
                    canonical(payload),
                ),
            )
            return {"status": "accepted", "batch_id": batch, "duplicate": False}

        return self.store.write(accept)

    def prepare(self, bridge, now):
        rows = self.store.write(
            lambda conn: conn.execute(
                "SELECT batch_id,route_id,route_digest,target,payload,latest_delivery FROM nma_webhook_batches WHERE owner_id=? AND state='pending' AND deadline<=? ORDER BY deadline,batch_id LIMIT 100",
                (self.store.owner, now),
            ).fetchall()
        )
        for row in rows:
            self.admit_batch(bridge, row)
        self.store.write(
            lambda conn: conn.execute(
                "UPDATE nma_webhook_batches SET state='settled' WHERE owner_id=? AND state='admitted' AND EXISTS (SELECT 1 FROM nma_run_terminals r WHERE r.owner_id=nma_webhook_batches.owner_id AND r.run_id=nma_webhook_batches.run_id)",
                (self.store.owner,),
            )
        )

    def admit_batch(self, bridge, row):
        identity, route_id, frozen_hash, frozen_target, payload, delivery = row
        try:
            cfg = route(route_id)
            goal, target = self.store.write(lambda conn: self.target(conn, cfg))
            if route_digest(cfg) != frozen_hash or canonical(target) != frozen_target:
                raise EngineError("STALE_GENERATION")
            if self.store.write(
                lambda conn: Wakes(self.store).busy(conn, target["thread_id"])
            ):
                return
            agent = self.store.write(
                lambda conn: self.adapter.agents.get(conn, target["agent_id"])
            )
            key, config = self.adapter.binding(
                {
                    "agent_id": target["agent_id"],
                    "thread_id": target["thread_id"],
                    "config_revision": agent["config_revision"],
                    "context_generation": target["context_generation"],
                }
            )

            def admit(conn):
                current, current_target = self.target(conn, cfg)
                if canonical(current_target) != frozen_target:
                    raise EngineError("STALE_GENERATION")
                bridge.lifecycle.changed(conn, goal["goal_id"])
                bridge.lifecycle.state(
                    conn, goal["goal_id"], "active", goal["progress"]
                )
                run_id = bridge.prepare(
                    conn,
                    current,
                    current["source_run_id"],
                    current["source_message_id"],
                    identity,
                    key,
                    config,
                    {
                        "trigger_id": identity,
                        "configuration": {"kind": "webhook"},
                        "route_id": route_id,
                        "latest_delivery_id": delivery,
                        "untrusted_external_payload": json.loads(payload),
                    },
                )
                conn.execute(
                    "UPDATE nma_webhook_batches SET state='admitted',run_id=? WHERE owner_id=? AND batch_id=?",
                    (run_id, self.store.owner, identity),
                )

            self.store.write(admit)
        except EngineError as exc:
            if exc.code in {"ENGINE_UNAVAILABLE", "AUTHORITY_LOST"}:
                raise
            self.store.write(
                lambda conn, code=exc.code, identity=identity: conn.execute(
                    "UPDATE nma_webhook_batches SET state='rejected',error_code=? WHERE owner_id=? AND batch_id=?",
                    (code, self.store.owner, identity),
                )
            )
