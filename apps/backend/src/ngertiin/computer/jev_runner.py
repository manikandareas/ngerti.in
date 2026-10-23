"""Fixed local DOM operations; adapted from Jev Ultrafast, see jev_assets/LICENSE.

Host owns prediction, exact text approval and receipts. No autonomous input loop.
"""

import hashlib
import json
import os
from pathlib import Path


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def execute(request):
    os.environ["BU_CDP_URL"] = "http://127.0.0.1:9222"
    os.environ.pop("BU_CDP_WS", None)
    os.environ.pop("BU_BROWSER_ID", None)
    os.environ["BU_NAME"] = "ngertiin-" + str(request["epoch"])
    os.environ["BH_UPDATE_CHECK"] = "0"
    from browser_harness.admin import ensure_daemon
    from browser_harness.helpers import cdp

    ensure_daemon()
    from cdp import page_target

    target = page_target()
    cdp("Target.activateTarget", targetId=target["id"])
    session = cdp("Target.attachToTarget", targetId=target["id"], flatten=True)["sessionId"]

    def call(method, **params):
        return cdp(method, session_id=session, **params)

    def evaluate(expression):
        value = call("Runtime.evaluate", expression=expression, returnByValue=True)
        if value.get("exceptionDetails"):
            raise ValueError("Document changed")
        return value.get("result", {}).get("value")

    try:
        call("Page.bringToFront")
        private = evaluate(Path("/tmp/ng036/privacy.js").read_text())
        if not private or private.get("private"):
            return {"private": True}
        evaluate("window.__ngertiinContext = " + Path("/tmp/ng036/target_context.js").read_text())
        # Gate and extract in one JS turn: page events cannot insert a private
        # field between separate privacy and snapshot evaluations.
        page = evaluate(
            "(() => { const privacy = "
            + Path("/tmp/ng036/privacy.js").read_text()
            + "; if (!privacy || privacy.private) return {private:true}; return ("
            + Path("/tmp/ng036/snapshot.js").read_text()
            + "); })()"
        )
        if not page or page.get("private"):
            return {"stale": True} if request["operation"] == "dom_act" else {"private": True}
        document = digest(page["page_key"])
        operation = request["operation"]
        if operation == "dom":
            for action in page["actions"]:
                if action.get("node"):
                    action["guard"] = digest(page["guards"][str(action["node"])])
            return {
                "target_id": target["id"],
                "document": document,
                **{
                    k: page[k]
                    for k in ("url", "title", "text", "scroll", "actions", "omitted_actions")
                },
            }
        action = request["action"]
        selected = action["dom"]
        actual = next(
            (
                a
                for a in page["actions"]
                if a.get("node") == selected["node"]
                and a["kind"] == selected["operation"]
                and (a["kind"] != "select" or a["value"] == selected["value"])
            ),
            None,
        )
        if (
            target["id"] != selected["target_id"]
            or (
                not (actual and actual.get("context", {}).get("href"))
                and document != selected["document"]
            )
            or not actual
            or digest(page["guards"][str(selected["node"])]) != selected["guard"]
        ):
            return {"stale": True}
        # Link identity tolerates unrelated page changes during model latency.
        # Approval/dispatch still bind the full current document and payload.
        fingerprint = digest([selected, document])
        if operation == "dom_target":
            return {"fingerprint": fingerprint, "context": actual["context"]}
        routine_link = (
            request.get("strict_target") is False
            and action["kind"] == "click"
            and bool(actual.get("context", {}).get("href"))
        )
        if (
            not routine_link
            and request.get("expected_target")
            and request["expected_target"] != fingerprint
        ):
            return {"stale": True}
        node = int(selected["node"])
        geometry = evaluate(
            "(() => {const e=window.__jevFast?.nodes.get(" + str(node) + ");"
            "if(!e?.isConnected||e.matches(':disabled')||e.closest('[inert],[aria-disabled=true]'))"
            "return null;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;"
            "return e.contains(document.elementFromPoint(x,y))?{x,y}:null})()"
        )
        if not geometry:
            return {"stale": True}
        # From this point an interruption is an unknown effect, never a stale read.
        if selected["operation"] == "select":
            evaluate(
                "(() => {const e=window.__jevFast.nodes.get("
                + str(node)
                + ");e.value="
                + json.dumps(selected["value"])
                + ";e.dispatchEvent(new Event('input',{bubbles:true}));"
                "e.dispatchEvent(new Event('change',{bubbles:true}));return true})()"
            )
        else:
            for event in ("mousePressed", "mouseReleased"):
                call(
                    "Input.dispatchMouseEvent", type=event, button="left", clickCount=1, **geometry
                )
            if selected["operation"] == "fill":
                call(
                    "Input.dispatchKeyEvent",
                    type="keyDown",
                    key="a",
                    code="KeyA",
                    modifiers=2,
                    commands=["selectAll"],
                )
                call("Input.dispatchKeyEvent", type="keyUp", key="a", code="KeyA", modifiers=2)
                call("Input.insertText", text=action["text"])
                form = actual.get("context", {}).get("form") or {}
                if (
                    request.get("strict_target") is False
                    and form.get("search")
                    and form.get("method") == "get"
                ):
                    # Host policy already classified this exact observed form as a
                    # routine search. Submit it atomically with the same journal ID.
                    for event in ("keyDown", "keyUp"):
                        call(
                            "Input.dispatchKeyEvent",
                            type=event,
                            key="Enter",
                            code="Enter",
                            windowsVirtualKeyCode=13,
                        )
        return {"executed": True}
    finally:
        cdp("Target.detachFromTarget", sessionId=session)
