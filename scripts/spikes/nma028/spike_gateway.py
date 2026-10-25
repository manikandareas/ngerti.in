"""Exact-pin gateway with an explicit native-tool placement prototype.

This launcher is disposable NMA-028 evidence, not an installed production mode.
Hermes owns model execution, admission, history, scheduling and cancellation.
Only native tool handlers are placed in the separately scoped tool executor.
"""

import contextvars
import hashlib
import json
import os
import sys
import threading
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

ROOT = Path(__file__).resolve().parents[3]
SOURCE = Path(os.environ["HERMES_SOURCE"]).resolve()
sys.path[:0] = [str(ROOT / "apps/engine/src"), str(SOURCE), str(Path(__file__).parent)]
from isolated_tools import IsolatedTools, Scope
from ngertiin_engine.runtime import verify

verify(SOURCE)
OWNER = os.environ["NMA028_OWNER_ID"]
CONTROL = Path(os.environ["NMA028_CONTROL_DIR"]).resolve()
broker = IsolatedTools(CONTROL, OWNER)
call_context = contextvars.ContextVar("nma028_native_tool_call", default=None)
active_scopes = {}
scope_lock = threading.Lock()
NATIVE = {
    "browser_exec",
    "terminal",
    "read_file",
    "write_file",
    "search_files",
    "patch",
}


def scope_for(session_id):
    from gateway.session_policy import active_policy

    policy = active_policy()
    config = policy.config(secrets=False) if policy else {}
    context = config.get("nma_context")
    if context:
        return Scope(
            OWNER,
            context["agent_id"],
            context["thread_id"],
            int(context["context_generation"]),
        )
    if not session_id:
        raise ValueError("Native tool dispatch requires a trusted session identity")
    home = str(Path(os.environ["HERMES_HOME"]).resolve())
    return Scope(
        OWNER,
        str(uuid5(NAMESPACE_URL, OWNER + ":profile:" + home)),
        str(uuid5(NAMESPACE_URL, OWNER + ":session:" + session_id)),
    )


def install_tools():
    import model_tools
    from tools.registry import registry

    for name in NATIVE:
        entry = registry.get_entry(name)
        if entry is None:
            raise RuntimeError("Pinned native tool is missing: " + name)

        def invoke(arguments, _name=name, **metadata):
            captured = call_context.get()
            if captured is None or captured[0] != _name:
                raise ValueError("Native tool dispatch identity is absent")
            _, scope, operation_id = captured
            return broker.invoke(scope, operation_id, _name, arguments, timeout=90)

        registry.register(
            name=name,
            toolset="nma_computer",
            schema=entry.schema,
            handler=invoke,
            check_fn=lambda: True,
            override=True,
        )

    original = model_tools._execute_tool

    def dispatch(name, args, original_args, ids, **kwargs):
        if name not in NATIVE:
            return original(name, args, original_args, ids, **kwargs)
        scope = scope_for(ids.session_id)
        operation_id = hashlib.sha256(
            json.dumps([ids.turn_id, ids.tool_call_id, name]).encode()
        ).hexdigest()
        with scope_lock:
            active_scopes.setdefault(ids.session_id, set()).add(scope)
        token = call_context.set((name, scope, operation_id))
        try:
            result = original(name, args, original_args, ids, **kwargs)
            receipt = broker.receipt(scope, operation_id)
            if receipt and receipt.get("state") in {
                "unknown",
                "indeterminate",
                "dispatching",
            }:
                # Raise outside registry.dispatch, whose general exception adapter
                # would otherwise turn an unknown effect into a known error result.
                from ngertiin_engine.contracts import EngineError

                raise EngineError("INDETERMINATE")
            return result
        finally:
            call_context.reset(token)

    model_tools._execute_tool = dispatch

    from run_agent import AIAgent

    original_interrupt = AIAgent.hard_interrupt

    def interrupt(agent, *args, **kwargs):
        result = original_interrupt(agent, *args, **kwargs)
        with scope_lock:
            scopes = list(active_scopes.get(getattr(agent, "session_id", None), ()))
        for scope in scopes:
            broker.cancel(scope)
        return result

    AIAgent.hard_interrupt = interrupt


if os.environ.get("NMA028_SURFACE") == "direct":
    install_tools()
    from gateway.run import main

    main()
else:
    # Native registry override is installed at the product's existing capability
    # installation point. The live grant/context/final-dispatch fences remain.
    from ngertiin_engine import computer, service

    computer.install = install_tools
    service.main()
