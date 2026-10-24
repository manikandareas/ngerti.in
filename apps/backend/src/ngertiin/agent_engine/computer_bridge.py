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


async def execute(request):
    workspace = dict(request["workspace"])
    workspace["deadline"] = datetime.now(UTC) + timedelta(seconds=300)
    provider = E2BComputer()
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
    try:
        operation = request["operation"]
        if operation == "act":
            action = Action.model_validate(request["action"])
            if action.kind not in {"navigate", "click", "type", "select", "scroll"}:
                raise ValueError("Unsupported action")
            if action.kind in {"click", "type", "select"} and action.dom is None:
                raise ValueError("Observed DOM target required")
            target = await provider.target(workspace, action)
            await provider.act(
                workspace,
                action,
                expected_target=target.fingerprint,
                dispatch_id=request["operation_id"],
            )
        elif operation != "observe":
            raise ValueError("Unsupported operation")
        observation = await provider.observe_dom(workspace)
        return {"resource_id": workspace["resource_id"], "observation": observation}
    except BaseException:
        await provider.stop(workspace)
        raise


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
