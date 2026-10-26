"""One-shot E2B actuator for the gateway; no admission, queue or lifecycle owner.

The gateway supplies trusted workspace identity on stdin. This operator-only
process reuses low-level computer operations, never legacy task stores/workers.
"""

import asyncio
import json
import sys
from datetime import UTC, datetime, timedelta

from ngertiin.computer.contracts import Action, DomUnavailable, NeedsHuman, StaleTarget
from ngertiin.computer.e2b import E2BComputer, resource


def rejected_input(error, workspace, operation_id):
    return {
        "resource_id": workspace["resource_id"],
        "outcome": "rejected",
        "error": type(error).__name__,
        "execution": {"outcome": "not_dispatched"},
        "receipt_ref": operation_id,
        "next_step": (
            "Observe the current target before a new action; "
            "private inputs require human assistance."
        ),
    }


async def execute(request):
    workspace = dict(request["workspace"])
    workspace["deadline"] = datetime.now(UTC) + timedelta(seconds=300)
    provider = E2BComputer()
    if request["operation"] == "receipt":
        existing = await resource(workspace)
        if existing is None or str(existing.state) != "running":
            return {"outcome": "indeterminate", "error": "RECEIPT_UNAVAILABLE"}
        workspace["resource_id"] = existing.sandbox_id
        workspace["deadline"] = existing.end_at
        try:
            receipt = await provider.dispatch_receipt(workspace, request["receipt_operation_id"])
        except (StaleTarget, NeedsHuman) as error:
            # These typed refusals come from the stored actuator result and prove
            # that its guarded input was never executed.
            return rejected_input(error, workspace, request["receipt_operation_id"])
        return {
            "outcome": "indeterminate" if receipt.get("unknown") else "completed",
            "resource_id": existing.sandbox_id,
            "execution": receipt,
            "receipt_ref": request["receipt_operation_id"],
        }
    if request["operation"] == "delete":
        return {"deleted": await provider.delete(workspace)}
    if request["operation"] == "pause":
        await provider.stop(workspace)
        return {"paused": True}
    existing = await resource(workspace)
    if existing is not None and str(existing.state) == "running":
        workspace["resource_id"] = existing.sandbox_id
        workspace["deadline"] = existing.end_at
        await provider.control(workspace)
    else:
        workspace["resource_id"] = await provider.start(workspace, 300)
    dispatched = False
    execution = None
    try:
        operation = request["operation"]
        if operation == "act":
            action = Action.model_validate(request["action"])
            if action.kind not in {"navigate", "click", "type", "select", "scroll"}:
                raise ValueError("Unsupported action")
            if action.kind in {"click", "type", "select"} and action.dom is None:
                raise ValueError("Observed DOM target required")
            target = await provider.target(workspace, action)
            dispatched = True
            await provider.act(
                workspace,
                action,
                expected_target=target.fingerprint,
                dispatch_id=request["operation_id"],
            )
            execution = {"outcome": "completed", "receipt_ref": request["operation_id"]}
        elif operation != "observe":
            raise ValueError("Unsupported operation")
        try:
            observation = await provider.observe_dom(workspace)
        except Exception as error:
            return {
                "resource_id": workspace["resource_id"],
                "outcome": "completed" if execution else "rejected",
                "execution": execution,
                "observation": {"outcome": "failed", "error": type(error).__name__},
            }
        return {
            "resource_id": workspace["resource_id"],
            "outcome": "completed",
            "execution": execution,
            "observation": observation,
        }
    except (StaleTarget, NeedsHuman) as error:
        # The actuator's final target/privacy guard can reject after the RPC
        # starts but before input. Preserve that known no-effect result.
        return rejected_input(error, workspace, request.get("operation_id"))
    except Exception as error:
        # Other errors after dispatch cannot establish whether input occurred.
        return {
            "resource_id": workspace["resource_id"],
            "outcome": "indeterminate" if dispatched else "rejected",
            "error": type(error).__name__,
            "execution": {"outcome": "unknown" if dispatched else "not_dispatched"},
        }


def main():
    try:
        raw = sys.stdin.buffer.read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            raise ValueError("Request too large")
        result = asyncio.run(execute(json.loads(raw)))
    except (NeedsHuman, DomUnavailable, StaleTarget) as error:
        result = {"error": type(error).__name__, "outcome": "rejected"}
    except Exception:
        # Never send native exception text, environment or credential values.
        result = {"error": "COMPUTER_OUTCOME_UNKNOWN", "outcome": "indeterminate"}
    print(json.dumps(result, allow_nan=False))


if __name__ == "__main__":
    main()
