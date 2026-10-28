"""Place native handlers inside the selected isolation boundary without renaming them."""

import json
import threading
from contextvars import ContextVar
from functools import lru_cache
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import EngineError, digest

call_identity = ContextVar("nma_native_call_identity", default=None)
_brokers = {}
_active = {}
_lock = threading.RLock()


def child_resource_agent(owner, parent_agent_id, child_session_id):
    return str(
        uuid5(
            NAMESPACE_URL,
            digest(
                [owner, parent_agent_id, "temporary-child-resource", child_session_id]
            ),
        )
    )


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


def binding(marker, context, database, owner):
    from gateway.session_policy import active_policy

    from ngertiin_engine.capabilities import catalog
    from ngertiin_engine.native_executor import IsolatedTools, Scope

    data = catalog()
    selected = [
        data.get("execution_surfaces", {}).get(
            data.get("tool_grants", {}).get(key, {}).get("execution_surface"), {}
        )
        for key in marker["grants"].get("tool_grants", [])
    ]
    images = {s.get("image") for s in selected if s.get("kind") == "scoped_linux"}
    if len(images) != 1:
        raise EngineError("WORKSPACE_UNAVAILABLE")
    image = images.pop()
    verify_image(image)
    policy = active_policy()
    child_id = context.get("child_session_id") or (
        policy.config(secrets=False).get("nma_child_session_id") if policy else None
    )
    components = [marker["access_generation"], context["context_generation"]]
    if child_id:
        components.append(child_id)
    generation = (
        int(
            digest(components)[:15],
            16,
        )
        + 1
    )
    resource_agent = (
        child_resource_agent(owner, marker["agent_id"], child_id)
        if child_id
        else marker["agent_id"]
    )
    scope = Scope(owner, resource_agent, context["thread_id"], generation)
    key = digest([owner, image])
    with _lock:
        if key not in _brokers:
            _brokers[key] = IsolatedTools(
                Path(database).parent / "native-execution" / key, owner, image=image
            )
    return key, _brokers[key], _brokers[key].current_scope(scope)


def invoke(name, arguments, marker, database, owner):
    import jsonschema
    from gateway.session_policy import active_policy
    from tools.registry import registry
    from toolsets import resolve_toolset

    from ngertiin_engine.capabilities import authorize, catalog
    from ngertiin_engine.native_executor import NativeUnavailable, UnknownOutcome
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
    entry = registry.get_entry(name)
    if entry is None:
        raise EngineError("CAPABILITY_DENIED")
    try:
        jsonschema.validate(arguments, entry.schema["parameters"])
    except jsonschema.ValidationError:
        return True, json.dumps(
            {
                "error": "INVALID_TOOL_ARGUMENTS",
                "outcome": "rejected",
                "dispatched": False,
            }
        )

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
    if config.get("nma_child_session_id"):
        context = {**context, "child_session_id": config["nma_child_session_id"]}
    key, broker, scope = binding(marker, context, database, owner)
    with _lock:
        _active.setdefault(ids.session_id, set()).add((key, scope))
    operation = digest([ids.turn_id, ids.tool_call_id, name])

    def reauthorize():
        import sqlite3
        from types import SimpleNamespace

        from ngertiin_engine.context import authorize_context
        from ngertiin_engine.reliability import Reliability

        authorize(marker, database, owner)
        authorize_context(active_policy(), database, owner)
        with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as conn:
            epoch = conn.execute(
                "SELECT authority_epoch FROM nma_partition WHERE owner_id=?", (owner,)
            ).fetchone()
            if not epoch:
                raise EngineError("ACCESS_REVOKED")
            store = SimpleNamespace(
                owner=owner, authority=SimpleNamespace(epoch=epoch[0])
            )
            if Reliability(store).check(conn, stamp) is None:
                raise EngineError("ACCESS_REVOKED")

    try:
        from ngertiin_engine.skill_assets import stage

        if name == "request_human":
            reauthorize()
            return True, json.dumps(broker.screen.request(scope))
        if name == "browser_vault":
            from ngertiin_engine.browser_vault import invoke as vault_invoke

            return True, vault_invoke(arguments, broker, scope, reauthorize)
        stage(marker, broker, scope, reauthorize)
        from ngertiin_engine.learning_assets import stage as stage_learning

        stage_learning(context, broker, scope, reauthorize)
        value = broker.invoke(
            scope,
            operation,
            name,
            arguments,
            schema_hash=digest(registry.get_entry(name).schema),
            allowed_tools={
                n for toolset in marker["toolsets"] for n in resolve_toolset(toolset)
            },
            authorize=reauthorize,
            admission_id=stamp["admission_id"],
            timeout=min(1800, max(1, arguments.get("timeout_s", 300))) + 15
            if name == "browser_exec"
            else 90,
        )
        receipt = broker.receipt(scope, operation)
        if receipt and receipt["state"] in {"indeterminate", "dispatching", "unknown"}:
            from ngertiin_engine.outcomes import unknown_result

            return True, unknown_result(value, scope.key, operation, receipt["state"])
        return True, value
    except NativeUnavailable:
        raise EngineError(
            "CAPABILITY_UNAVAILABLE", {"reason": "isolated_display_unavailable"}
        ) from None
    except UnknownOutcome:
        raise EngineError("INDETERMINATE") from None


def settle_session(session_id):
    with _lock:
        _active.pop(session_id, set())
    # Native background jobs and code kernels belong to the scoped worker. Model
    # completion does not destroy them. Explicit stop/revoke or resource retirement
    # ends RAM; volume files and job receipts have their own durable contract.


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
