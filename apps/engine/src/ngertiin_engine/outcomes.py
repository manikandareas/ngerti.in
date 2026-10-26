"""Effect evidence is independent of tool delivery and subsequent observation."""

import json

from ngertiin_engine.contracts import canonical
from ngertiin_engine.redaction import result as redact

DDL = (
    "CREATE TABLE nma_effect_outcomes (owner_id TEXT NOT NULL, run_id TEXT NOT NULL, operation_id TEXT NOT NULL, tool_name TEXT, semantics TEXT NOT NULL, phase TEXT NOT NULL, provider_operation_id TEXT, execution_receipt TEXT, observation_receipt TEXT, PRIMARY KEY(owner_id,run_id,operation_id), FOREIGN KEY(owner_id,run_id,operation_id) REFERENCES nma_effects(owner_id,run_id,operation_id))",
    "CREATE TABLE nma_session_lineage (owner_id TEXT NOT NULL, binding_id TEXT NOT NULL, logical_session_id TEXT NOT NULL, parent_binding_id TEXT, native_tip TEXT, context_watermark INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(owner_id,binding_id), FOREIGN KEY(owner_id,binding_id) REFERENCES nma_adapter_bindings(owner_id,binding_id))",
    "CREATE TABLE nma_goal_unit_outcomes (owner_id TEXT NOT NULL, run_id TEXT NOT NULL, goal_id TEXT NOT NULL, outcome TEXT NOT NULL, verdict TEXT, continuation_run_id TEXT, receipt_refs TEXT NOT NULL, PRIMARY KEY(owner_id,run_id,goal_id), FOREIGN KEY(owner_id,run_id) REFERENCES nma_adapter_runs(owner_id,run_id), FOREIGN KEY(owner_id,goal_id) REFERENCES nma_goals(owner_id,goal_id))",
)


def semantics(name, args):
    if name in {"read_file", "search_files"}:
        return "read"
    if name == "coding" and args.get("action") in {"inspect", "diagnostics", "diff"}:
        return "read"
    if name == "process_manage" and args.get("action") in {"list", "poll", "log", "wait"}:
        return "read"
    if name == "computer" and args.get("operation") in {"observe", "receipt"}:
        return "read"
    # Arbitrary Python, shell and nested/batched calls can contain many writes.
    return "mutation"


def preflight(name, args):
    """Reject invalid synchronous browser code before any executor dispatch.

    The pinned browser worker uses Python exec, without top-level await. Compile
    with the same pinned Python grammar but never execute the resulting code.
    Runtime exceptions, including a raised SyntaxError, cannot prove absence of
    earlier effects and must still follow the ordinary unknown-outcome protocol.
    """
    if name != "browser_exec" or not isinstance(args.get("code"), str):
        return None
    try:
        compile(args["code"], "<browser_exec>", "exec", dont_inherit=True)
    except (SyntaxError, ValueError) as error:
        return canonical(
            {
                "error": "INVALID_TOOL_CODE",
                "outcome": "rejected",
                "failure_phase": "pre_dispatch",
                "detail": redact(getattr(error, "msg", str(error))),
                "line": getattr(error, "lineno", None),
                "next_step": "Repair syntax before retrying. This executor runs synchronous Python; use js() for DOM interactions and page_info()/wait_for_load() for inspection, without top-level await.",
            }
        )
    return None


def decode(value):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (ValueError, TypeError):
            return {}
    return value if isinstance(value, dict) else {}


def evidence(value):
    if isinstance(value, str) and value.lstrip().lower().startswith(
        ("error:", "[error]", "tool execution failed")
    ):
        return "unknown"
    item = decode(value)
    outcome = item.get("outcome")
    if outcome in {"indeterminate", "unknown"} or item.get("error") in {
        "INDETERMINATE",
        "COMPUTER_OUTCOME_UNKNOWN",
    }:
        return "unknown"
    if outcome == "rejected":
        return "rejected"
    if outcome != "completed" and failed(item):
        return "unknown"
    return "completed"


def failed(item):
    if not isinstance(item, dict):
        return False
    if item.get("error") or item.get("isError") or item.get("exit_code", 0):
        return True
    return any(
        failed(child)
        for key in ("results", "calls")
        if isinstance(item.get(key), list)
        for child in item[key]
    )


def record(conn, owner, run_id, operation_id, value):
    state = evidence(value)
    row = conn.execute(
        "SELECT semantics FROM nma_effect_outcomes WHERE owner_id=? AND run_id=? AND operation_id=?",
        (owner, run_id, operation_id),
    ).fetchone()
    if state == "unknown" and row and row[0] == "read":
        state = "observation_failed"
    item = decode(value)
    conn.execute(
        "UPDATE nma_effect_outcomes SET phase=?,execution_receipt=?,observation_receipt=? WHERE owner_id=? AND run_id=? AND operation_id=?",
        (
            state,
            canonical(redact(item.get("execution", {"outcome": state}))),
            canonical(redact(item.get("observation")))
            if "observation" in item
            else None,
            owner,
            run_id,
            operation_id,
        ),
    )
    conn.execute(
        "UPDATE nma_effects SET status=?,receipt=? WHERE owner_id=? AND run_id=? AND operation_id=?",
        (
            "dispatching" if state == "unknown" else "confirmed",
            canonical({"value": redact(value)}),
            owner,
            run_id,
            operation_id,
        ),
    )
    return state
