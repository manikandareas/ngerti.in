"""Thread-private E2B resources invoked through an operator-provisioned actuator.

The gateway persists resource identity before provisioning. Neither provisioning
nor browser inputs are blindly replayed. An actuator attempt the model observed
as failed settles as an error receipt, so the conversation decides how to adapt;
only an outcome nobody observed (process death, authority loss) stays dispatching
until an explicit reconciliation settles it.
"""

import json
import logging
import os
import subprocess
import threading
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import EngineError, canonical, digest
from ngertiin_engine.redaction import result as redact

logger = logging.getLogger(__name__)

TOOL = "computer"
dispatch_lock = threading.Lock()
DDL = (
    "CREATE TABLE nma_computers (owner_id TEXT NOT NULL, thread_id TEXT NOT NULL, workspace_id TEXT NOT NULL, resource_id TEXT, status TEXT NOT NULL CHECK(status IN ('retained','deleted')), PRIMARY KEY(owner_id,thread_id), UNIQUE(owner_id,workspace_id), FOREIGN KEY(owner_id,thread_id) REFERENCES nma_threads(owner_id,thread_id))",
)
SCHEMA = {
    "name": TOOL,
    "description": "Use this conversation's private E2B browser. Observe, act with a fresh guarded DOM target, pause when finished, or delete browser data. Resources automatically pause after five minutes. Only filesystem survives pause; re-observe after restore. Never pass host paths or resource identities. A private field requires human assistance.",
    "parameters": {
        "type": "object",
        "properties": {
            "operation": {
                "type": "string",
                "enum": ["observe", "act", "pause", "delete"],
            },
            "action": {
                "type": "object",
                "description": "For act: kind navigate/click/type/select/scroll, description; url for navigate; dom from latest observation for click/type/select. No arbitrary scripts.",
            },
        },
        "required": ["operation"],
        "additionalProperties": False,
    },
}


class Computer:
    def __init__(self, store):
        self.store = store

    def invoke(self, stamp, args, ids):
        from ngertiin_engine.capabilities import resolve
        from ngertiin_engine.goals import Goals

        if (
            not isinstance(args, dict)
            or args.get("operation") not in {"observe", "act", "pause", "delete"}
            or set(args)
            != (
                {"operation", "action"}
                if args.get("operation") == "act"
                else {"operation"}
            )
        ):
            raise EngineError("INVALID_REQUEST")
        try:
            command = json.loads(os.environ["NMA_COMPUTER_COMMAND"])
            if (
                not isinstance(command, list)
                or not command
                or any(not isinstance(x, str) for x in command)
            ):
                raise ValueError
        except KeyError, ValueError:
            raise EngineError("CAPABILITY_UNAVAILABLE") from None

        def prepare(conn):
            _run_id, config, _ = Goals(self.store).scope(conn, stamp)
            current_operation = digest([ids.turn_id, ids.tool_call_id, TOOL])
            if conn.execute(
                "SELECT 1 FROM nma_effects e JOIN nma_adapter_runs r ON r.owner_id=e.owner_id AND r.run_id=e.run_id JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id WHERE e.owner_id=? AND e.status='dispatching' AND json_extract(b.config,'$.thread_id')=? AND NOT (e.run_id=? AND e.operation_id=?)",
                (self.store.owner, config["thread_id"], _run_id, current_operation),
            ).fetchone():
                # Nothing was dispatched for this operation, so its outcome is a
                # known refusal, not an unknown actuator outcome. The pending row
                # keeps its evidence until an explicit reconciliation settles it.
                raise EngineError("COMPUTER_UNRESOLVED")
            marker = config.get("nma_capabilities", {})
            resolved, _ = resolve(marker.get("grants", {}))
            if (
                resolved.get("snapshots") != marker.get("snapshots")
                or "nma_computer" not in resolved["toolsets"]
            ):
                raise EngineError("ACCESS_REVOKED")
            identity = str(
                uuid5(
                    NAMESPACE_URL, self.store.owner + ":computer:" + config["thread_id"]
                )
            )
            conn.execute(
                "INSERT OR IGNORE INTO nma_computers VALUES (?,?,?,NULL,'retained')",
                (self.store.owner, config["thread_id"], identity),
            )
            row = conn.execute(
                "SELECT resource_id,status FROM nma_computers WHERE owner_id=? AND thread_id=?",
                (self.store.owner, config["thread_id"]),
            ).fetchone()
            if row[1] == "deleted":
                raise EngineError("WORKSPACE_DELETED")
            return config, {
                "id": identity,
                "resource_name": "nma-" + identity,
                "resource_id": row[0],
                "control_version": int(config["context_generation"]),
                "control": "agent",
            }

        config, workspace = self.store.write(prepare)
        operation = str(
            uuid5(NAMESPACE_URL, digest([stamp, ids.turn_id, ids.tool_call_id, TOOL]))
        )
        request = {**args, "workspace": workspace, "operation_id": operation}
        result = None
        try:
            result = subprocess.run(
                command,
                input=canonical(request),
                capture_output=True,
                text=True,
                timeout=240,
                check=True,
            )
            if len(result.stdout) > 4 * 1024 * 1024:
                raise ValueError
            value = json.loads(result.stdout)
            if not isinstance(value, dict) or value.get("outcome") == "indeterminate":
                raise ValueError
        except (OSError, ValueError, subprocess.SubprocessError) as exc:
            stderr = ""
            if result is not None and result.stderr:
                stderr = (
                    result.stderr
                    if isinstance(result.stderr, str)
                    else result.stderr.decode(errors="replace")
                )
            logger.warning(
                "Computer actuator attempt failed (%s) for thread %s: %s",
                type(exc).__name__,
                config["thread_id"],
                redact(stderr.strip()[:2000] or str(exc)),
            )
            # The model observed this failure, so it is a known error receipt
            # rather than an unresolved outcome: the reliability wrapper settles
            # the effect and the conversation adapts instead of the thread
            # staying blocked until an operator reconciles.
            return canonical({"error": "INDETERMINATE"})
        # Persist the confirmed provider identity, even if access was revoked while
        # the effect was in flight. This is cleanup evidence, not publication rights.
        self.store.write(
            lambda conn: conn.execute(
                "UPDATE nma_computers SET resource_id=COALESCE(?,resource_id),status=? WHERE owner_id=? AND thread_id=?",
                (
                    value.get("resource_id"),
                    "deleted" if value.get("deleted") else "retained",
                    self.store.owner,
                    config["thread_id"],
                ),
            )
        )
        value.pop("resource_id", None)
        self.store.write(lambda conn: Goals(self.store).scope(conn, stamp))
        return canonical(redact(value))

    def reconcile(self, payload):
        """Explicitly settle computer effects whose run already reached a terminal decision.

        An actuator attempt with an unknown outcome keeps its dispatching row as
        evidence and blocks later effects for the thread until an operator or the
        recovery flow decides otherwise. Reconciliation never re-executes the
        attempt: the settled receipt reports the unresolved outcome, and the
        browser is re-observed before further actions.
        """
        if set(payload) != {"thread_id"} or not isinstance(payload["thread_id"], str):
            raise EngineError("INVALID_REQUEST")
        receipt = canonical({"value": {"error": "INDETERMINATE", "reconciled": True}})

        def write(conn):
            if not conn.execute(
                "SELECT 1 FROM nma_threads WHERE owner_id=? AND thread_id=?",
                (self.store.owner, payload["thread_id"]),
            ).fetchone():
                raise EngineError("NOT_FOUND")
            rows = conn.execute(
                "SELECT e.run_id,e.operation_id FROM nma_effects e JOIN nma_adapter_runs r ON r.owner_id=e.owner_id AND r.run_id=e.run_id JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id JOIN nma_run_terminals t ON t.owner_id=r.owner_id AND t.run_id=r.run_id WHERE e.owner_id=? AND e.status='dispatching' AND json_extract(b.config,'$.thread_id')=?",
                (self.store.owner, payload["thread_id"]),
            ).fetchall()
            resolved = 0
            for run_id, operation_id in rows:
                resolved += conn.execute(
                    "UPDATE nma_effects SET status='confirmed',receipt=? WHERE owner_id=? AND run_id=? AND operation_id=? AND status='dispatching'",
                    (receipt, self.store.owner, run_id, operation_id),
                ).rowcount
            return {"thread_id": payload["thread_id"], "reconciled": resolved}

        return self.store.write(write)


def install():
    import model_tools
    from gateway.session_policy import active_policy
    from tools.registry import registry

    registry.register(
        name=TOOL,
        toolset="nma_computer",
        schema=SCHEMA,
        handler=lambda args, **kwargs: canonical({"error": "NOT_FOUND"}),
    )
    original = model_tools.get_tool_definitions

    def definitions(*args, **kwargs):
        definitions = original(*args, **kwargs)
        policy = active_policy()
        marker = (
            policy.config(secrets=False).get("nma_capabilities", {}) if policy else {}
        )
        if "nma_computer" in marker.get("toolsets", []):
            definitions = [d for d in definitions if d["function"]["name"] != TOOL]
            return [*definitions, {"type": "function", "function": SCHEMA}]
        return definitions

    model_tools.get_tool_definitions = definitions
