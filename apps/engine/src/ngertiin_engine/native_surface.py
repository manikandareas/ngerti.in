"""Place native handlers inside the selected isolation boundary without renaming them."""

import json
import threading
from contextvars import ContextVar
from functools import lru_cache
from pathlib import Path

from ngertiin_engine.contracts import EngineError, digest

call_identity = ContextVar("nma_native_call_identity", default=None)
_brokers = {}
_active = {}
_lock = threading.RLock()


@lru_cache(maxsize=32)
def verify_image(image):
    from ngertiin_engine.native_executor import IsolatedTools

    if (
        not isinstance(image, str)
        or not image.startswith("sha256:")
        or len(image) != 71
    ):
        raise EngineError(
            "CAPABILITY_UNAVAILABLE", {"reason": "immutable_native_image_required"}
        )
    try:
        inspected = json.loads(
            IsolatedTools._docker("image", "inspect", image, timeout=10)
        )[0]
        actual = inspected["Id"]
    except (RuntimeError, OSError):
        raise EngineError(
            "CAPABILITY_UNAVAILABLE", {"reason": "native_image_not_installed"}
        ) from None
    if actual != image:
        raise EngineError("CAPABILITY_UNAVAILABLE", {"reason": "native_image_mismatch"})
    labels = inspected.get("Config", {}).get("Labels", {}) or {}
    pin = json.loads(Path(__file__).with_name("runtime-pin.json").read_text())
    if (
        labels.get("org.ngertiin.native.protocol") != "nma.native-tools.v1"
        or labels.get("org.ngertiin.hermes.revision") != pin["revision"]
    ):
        raise EngineError(
            "CAPABILITY_UNAVAILABLE", {"reason": "native_image_contract_mismatch"}
        )


def invoke(name, arguments, marker, database, owner):
    from gateway.session_policy import active_policy
    from tools.registry import registry
    from toolsets import resolve_toolset

    from ngertiin_engine.capabilities import catalog
    from ngertiin_engine.native_executor import IsolatedTools, Scope, UnknownOutcome
    from ngertiin_engine.reliability import execution

    data = catalog()
    surfaces = {
        entry.get("execution_surface")
        for key in marker["grants"].get("tool_grants", [])
        if (entry := data.get("tool_grants", {}).get(key, {}))
        and name in resolve_toolset(entry["toolset"])
    }
    selected = [data.get("execution_surfaces", {}).get(key, {}) for key in surfaces]
    selected = [s for s in selected if s.get("kind") == "scoped_linux"]
    if not selected:
        return False, None
    if len({s.get("image") for s in selected}) != 1:
        raise EngineError(
            "CAPABILITY_UNAVAILABLE", {"reason": "conflicting_execution_surfaces"}
        )
    image = selected[0]["image"]
    verify_image(image)
    ids = call_identity.get()
    stamp = execution.get()
    if ids is None or stamp is None:
        raise EngineError("ACCESS_REVOKED")
    config = active_policy().config(secrets=False)
    context = config.get("nma_context")
    if not context:
        raise EngineError("ACCESS_REVOKED")
    generation = (
        int(
            digest([marker["access_generation"], context["context_generation"], stamp])[
                :15
            ],
            16,
        )
        + 1
    )
    scope = Scope(owner, marker["agent_id"], context["thread_id"], generation)
    key = digest([owner, image])
    with _lock:
        if key not in _brokers:
            _brokers[key] = IsolatedTools(
                Path(database).parent / "native-execution" / key, owner, image=image
            )
        broker = _brokers[key]
        _active.setdefault(ids.session_id, set()).add((key, scope))
    operation = digest([ids.turn_id, ids.tool_call_id, name])
    try:
        value = broker.invoke(
            scope,
            operation,
            name,
            arguments,
            schema_hash=digest(registry.get_entry(name).schema),
            allowed_tools={
                n for toolset in marker["toolsets"] for n in resolve_toolset(toolset)
            },
        )
        receipt = broker.receipt(scope, operation)
        if receipt and receipt["state"] in {"indeterminate", "dispatching", "unknown"}:
            raise EngineError("INDETERMINATE")
        return True, value
    except UnknownOutcome:
        raise EngineError("INDETERMINATE") from None


def settle_session(session_id):
    with _lock:
        scopes = _active.pop(session_id, set())
    for key, scope in scopes:
        try:
            _brokers[key].pause(scope)
        except ValueError:
            # Unknown/cancelled scopes stay fenced and their volumes stay intact.
            pass


def install():
    from run_agent import AIAgent

    original = AIAgent.hard_interrupt

    def interrupt(agent, *args, **kwargs):
        result = original(agent, *args, **kwargs)
        with _lock:
            scopes = _active.pop(getattr(agent, "session_id", None), set())
        for key, scope in scopes:
            _brokers[key].cancel(scope)
        return result

    AIAgent.hard_interrupt = interrupt
