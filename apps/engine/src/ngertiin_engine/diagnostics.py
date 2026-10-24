"""Owner-scoped read-only diagnosis from durable native and product receipts."""

import json
import math

from ngertiin_engine.contracts import EngineError, uuid
from ngertiin_engine.redaction import result as redact


def correlation(conn, owner, run_id):
    units = conn.execute(
        "SELECT goal_id,parent_run_id FROM nma_goal_units WHERE owner_id=? AND run_id=? ORDER BY goal_id",
        (owner, run_id),
    ).fetchall()
    turns = conn.execute(
        "SELECT discussion_id,task_id FROM nma_discussion_turns WHERE owner_id=? AND run_id=?",
        (owner, run_id),
    ).fetchall()
    triggers = conn.execute(
        "SELECT trigger_id FROM nma_triggers WHERE owner_id=? AND run_id=? UNION ALL SELECT batch_id FROM nma_webhook_batches WHERE owner_id=? AND run_id=?",
        (owner, run_id) * 2,
    ).fetchall()
    return {
        "goal_ids": [r[0] for r in units],
        "parent_run_ids": sorted({r[1] for r in units if r[1]}),
        "discussion_ids": [r[0] for r in turns],
        "handoff_ids": [r[1] for r in turns],
        "trigger_ids": [r[0] for r in triggers],
    }


def usage(receipt):
    # Top-level native usage is the turn delta. result.input_tokens is session
    # cumulative and must never be summed as per-run usage.
    raw = receipt.get("usage", {})
    value = {
        key: raw[key]
        for key in ("input_tokens", "output_tokens", "total_tokens")
        if type(raw.get(key)) is int and raw[key] >= 0
    }
    cost = raw.get("estimated_cost_usd")
    if type(cost) in (float, int) and math.isfinite(cost) and cost >= 0:
        value["native_estimated_cost_usd"] = cost
        value["cost_source"] = redact(str(raw.get("cost_source", "unknown")))
        value["cost_status"] = redact(str(raw.get("cost_status", "unknown")))
    return {"source": "native_terminal_receipt", "available": bool(value), **value}


def install_usage():
    """Extend the pinned native turn-delta receipt, never price or meter twice."""
    from gateway.run_turn_runner import TurnRunner
    from gateway.session_results import execution_result

    original = TurnRunner._run_conversation_with_approval

    def run(turn, agent, *args, **kwargs):
        before = getattr(agent, "session_estimated_cost_usd", 0.0)
        try:
            return original(turn, agent, *args, **kwargs)
        finally:
            captured = execution_result.get()
            after = getattr(agent, "session_estimated_cost_usd", None)
            status = getattr(agent, "session_cost_status", "unknown")
            source = getattr(agent, "session_cost_source", "none")
            if (
                captured is not None
                and type(before) in (int, float)
                and type(after) in (int, float)
                and math.isfinite(after)
                and after >= before
                and status != "unknown"
                and source != "none"
            ):
                captured.setdefault("usage", {}).update(
                    estimated_cost_usd=after - before,
                    cost_status=status,
                    cost_source=source,
                )

    TurnRunner._run_conversation_with_approval = run


class Diagnostics:
    def __init__(self, adapter):
        self.adapter, self.store = adapter, adapter.store

    def read(self, payload):
        if set(payload) != {"run_id"}:
            raise EngineError("INVALID_REQUEST")
        run_id = uuid(payload["run_id"])
        self.adapter.context.transcript.reconcile()
        self.adapter.reliability.reconcile()

        def read(conn):
            from hermes_state_terminal import RESULT_PREFIX, load_result

            snapshot = self.adapter.reliability.snapshot_row(conn, run_id)
            row = conn.execute(
                "SELECT r.operation_id,r.native_admission_id,o.state FROM nma_adapter_runs r JOIN nma_runtime_outbox o ON o.owner_id=r.owner_id AND o.operation_id=r.operation_id WHERE r.owner_id=? AND r.run_id=?",
                (self.store.owner, run_id),
            ).fetchone()
            saved = conn.execute(
                "SELECT value FROM state_meta WHERE key=?",
                (RESULT_PREFIX + (row[1] or ""),),
            ).fetchone()
            events = conn.execute(
                "SELECT e.payload FROM nma_events e JOIN nma_run_events r ON r.owner_id=e.owner_id AND r.sequence=e.sequence WHERE r.owner_id=? AND r.run_id=? ORDER BY e.sequence DESC LIMIT 256",
                (self.store.owner, run_id),
            ).fetchall()
            messages = conn.execute(
                "SELECT message_id FROM nma_messages WHERE owner_id=? AND run_id=? ORDER BY message_seq",
                (self.store.owner, run_id),
            ).fetchall()
            effects = conn.execute(
                "SELECT operation_id,status FROM nma_effects WHERE owner_id=? AND run_id=? ORDER BY operation_id",
                (self.store.owner, run_id),
            ).fetchall()
            return {
                "run": snapshot,
                **correlation(conn, self.store.owner, run_id),
                "command_id": row[0],
                "admission_state": row[2],
                "usage": usage(load_result(saved[0]) if saved else {}),
                "message_ids": [r[0] for r in messages],
                "effects": [{"operation_id": r[0], "status": r[1]} for r in effects],
                "recent_events": [json.loads(r[0]) for r in reversed(events)],
                "event_limit": 256,
            }

        return redact(self.store.write(read))
