"""Sandbox-local dispatch barrier. All GUI/CDP entry points share one epoch lock.

Uploaded as trusted code, invoked by E2B commands, never exposed as a web service.
No model keys, generated code, selectors or shell are accepted.
"""

import fcntl
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path("/tmp/ng036")


def privacy():
    from cdp import call

    value = call(
        "Runtime.evaluate",
        {
            "expression": (ROOT / "privacy.js").read_text(),
            "returnByValue": True,
        },
    )
    state = value.get("result", {}).get("value") or {}
    return bool(state.get("private", True) or not state.get("focused"))


def perform(request, current):
    from targets import begin, handback, reconcile

    operation = request["operation"]
    if current.get("control") == "resuming":
        handback()
    else:
        reconcile(request["epoch"], current["deadline"])
    from cdp import call, page_target

    call("Target.activateTarget", {"targetId": page_target()["id"]}, page=False)
    call("Page.bringToFront")
    if privacy():
        return {"private": True}
    if operation == "screen":
        subprocess.run(
            ["scrot", "-o", str(ROOT / "screen.png")],
            env={**os.environ, "DISPLAY": ":0"},
            check=True,
            timeout=10,
        )
        if privacy():
            (ROOT / "screen.png").unlink(missing_ok=True)
            return {"private": True}
        return {"captured": True}
    if operation in ("dom", "dom_target", "dom_act"):
        from jev_runner import execute

        if operation == "dom_act":
            begin(request["epoch"])
        return execute(request)
    if operation == "target":
        from cdp import target_fingerprint

        return target_fingerprint(request["action"])
    if operation == "act":
        if request.get("expected_target") and request["action"]["kind"] in (
            "click",
            "type",
            "key",
        ):
            from cdp import target_fingerprint

            fresh = target_fingerprint(request["action"])
            if fresh.get("private") or fresh["fingerprint"] != request["expected_target"]:
                return {"stale": True}
        from desktop_io import act

        begin(request["epoch"])
        if request["action"]["kind"] == "wait":
            time.sleep(0.2)
        else:
            act(request["action"])
        return {"executed": True}
    raise ValueError("Unsupported actuator operation")


def dispatch(request):
    ROOT.mkdir(mode=0o700, exist_ok=True)
    with (ROOT / "actuator.lock").open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        path = ROOT / "control.json"
        current = json.loads(path.read_text()) if path.exists() else {}
        epoch = int(request["epoch"])
        if request["operation"] == "control":
            if epoch < current.get("epoch", 0):
                raise ValueError("Stale control epoch")
            path.write_text(json.dumps(request))
            return {"quiesced": request["control"] != "agent"}
        if (
            current.get("epoch") != epoch
            or current.get("task") != request["task"]
            or current.get("deadline", 0) <= time.time()
        ):
            raise ValueError("Stale actuator lease")
        operation = request["operation"]
        if current.get("control") != "agent" and not (
            current.get("control") == "resuming" and operation == "screen"
        ):
            raise ValueError("Computer is under human control")
        if operation == "receipt":
            ident = hashlib.sha256(str(request["dispatch_id"]).encode()).hexdigest()
            path = ROOT / "receipts" / (ident + ".json")
            if not path.exists():
                return {"unknown": True}
            return json.loads(path.read_text()).get("result", {"unknown": True})
        if operation not in ("act", "dom_act"):
            return perform(request, current)
        dispatch_id = request.get("dispatch_id")
        if not dispatch_id:
            raise ValueError("Dispatch identity required")
        ident = hashlib.sha256(str(dispatch_id).encode()).hexdigest()
        directory = ROOT / "receipts"
        directory.mkdir(mode=0o700, exist_ok=True)
        receipt = directory / (ident + ".json")
        digest = hashlib.sha256(json.dumps(request, sort_keys=True).encode()).hexdigest()
        if receipt.exists():
            previous = json.loads(receipt.read_text())
            if previous["digest"] != digest:
                raise ValueError("Dispatch payload changed")
            return previous.get("result", {"unknown": True})
        # Persist acceptance BEFORE any input. A crash leaves unknown, never retry.
        from targets import atomic

        atomic(receipt, {"digest": digest})
        result = perform(request, current)
        atomic(receipt, {"digest": digest, "result": result})
        return result


if __name__ == "__main__":
    try:
        print(json.dumps(dispatch(json.loads(sys.argv[1]))))
    except Exception:
        # Never export raw provider/DOM exceptions (which can contain private values).
        print('{"error":"actuator_rejected"}')
        raise SystemExit(1) from None
