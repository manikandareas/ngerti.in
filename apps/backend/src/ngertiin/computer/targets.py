"""Sandbox-local target reconciliation, used under the actuator's exclusive lock.

Poll browser Target.getTargets instead of consuming Harness's shared event queue.
The persisted baseline is written before input, so a lost reply cannot refocus the
old tab before reconciling the popup. No model-supplied CDP is accepted here.
"""

import json
import os
import time
from pathlib import Path

ROOT = Path("/tmp/ng036")


def atomic(path, value):
    temporary = path.with_suffix(".new")
    with temporary.open("w") as file:
        file.write(json.dumps(value))
        file.flush()
        os.fsync(file.fileno())
    temporary.replace(path)
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def choose(current, baseline, pages):
    """Return one causally related page or None; ambiguity never picks newest."""
    new = [p for p in pages if p["targetId"] not in baseline and p.get("type") == "page"]
    related = [p for p in new if p.get("openerId") == current]
    if new and (len(new) != 1 or len(related) != 1):
        raise ValueError("Ambiguous browser popup; explicit handback required")
    if related and related[0].get("url") not in ("", "about:blank"):
        return related[0]
    if new:
        return None
    return next((p for p in pages if p["targetId"] == current), None)


def begin(epoch):
    from cdp import call, page_target

    target = page_target()
    pages = call("Target.getTargets", page=False)["targetInfos"]
    atomic(
        ROOT / "transition.json",
        {
            "epoch": epoch,
            "target": target["id"],
            "baseline": [p["targetId"] for p in pages],
            "started": time.time(),
        },
    )


def reconcile(epoch, deadline):
    from cdp import call, list_pages

    path = ROOT / "transition.json"
    if not path.exists():
        return
    transition = json.loads(path.read_text())
    if transition["epoch"] != epoch:
        path.unlink(missing_ok=True)
        return
    until = min(deadline, time.time() + 15)
    stable = None
    since = time.monotonic()
    while time.time() < until:
        pages = call("Target.getTargets", page=False)["targetInfos"]
        selected = choose(transition["target"], transition["baseline"], pages)
        if selected:
            identity = (selected["targetId"], selected.get("url", ""))
            if identity != stable:
                stable, since = identity, time.monotonic()
            # Short bounded stabilization also catches delayed window.open.
            if time.monotonic() - since >= 0.8:
                page = next((p for p in list_pages() if p["id"] == selected["targetId"]), None)
                if page:
                    ready = call(
                        "Runtime.evaluate",
                        {
                            "expression": "!!document.body && document.readyState !== 'loading'",
                            "returnByValue": True,
                        },
                        target=page,
                    )
                    if ready.get("result", {}).get("value") is True:
                        atomic(ROOT / "target.json", {"id": selected["targetId"]})
                        path.unlink(missing_ok=True)
                        return
        time.sleep(0.1)
    raise ValueError("Browser transition not ready")


def handback():
    """Select the human's focused page without exporting its content."""
    from cdp import call, list_pages

    focused = []
    for page in list_pages():
        value = call(
            "Runtime.evaluate",
            {
                "expression": "document.hasFocus()",
                "returnByValue": True,
            },
            target=page,
        )
        if value.get("result", {}).get("value") is True:
            focused.append(page)
    if len(focused) != 1:
        raise ValueError("Select one browser tab before returning control")
    atomic(ROOT / "target.json", {"id": focused[0]["id"]})
    (ROOT / "transition.json").unlink(missing_ok=True)
