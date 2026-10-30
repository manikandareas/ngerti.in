"""Scope native Hermes delegation and retain its lifecycle and result semantics."""

import inspect
import json
import logging
import time
from contextvars import ContextVar
from dataclasses import replace
from uuid import uuid4

from ngertiin_engine.contracts import EngineError, canonical

request = ContextVar("nma_delegation_request", default=None)
_adapter = None


def configured(adapter):
    global _adapter
    _adapter = adapter


def policy_config():
    from gateway.session_policy import active_policy

    policy = active_policy()
    return policy.config(secrets=False) if policy else {}


def check():
    from ngertiin_engine.capabilities import authorize
    from ngertiin_engine.context import authorize_context
    from ngertiin_engine.reliability import execution

    config = policy_config()
    if not config.get("nma_capabilities"):
        raise EngineError("ACCESS_REVOKED")
    store = _adapter.store
    database = store.authority.db.db_path
    authorize(config["nma_capabilities"], database, store.owner)
    from gateway.session_policy import active_policy

    authorize_context(active_policy(), database, store.owner)
    stamp = execution.get()
    row = store.write(lambda conn: _adapter.reliability.check(conn, stamp or {}))
    if row is None:
        raise EngineError("ACCESS_REVOKED")
    return config, stamp


def install():
    import model_tools
    from agent import tool_executor
    from agent.delegation_provider import DelegationProvider, DelegationRouteError
    from agent.delegation_registry import register_provider
    from gateway.session_policy import active_policy, policy_scope
    from model_tools import _CallIds
    from run_agent import AIAgent
    from tools import (
        delegate_tool,
        delegate_tool_child_run,
        delegate_tool_dispatch,
        delegate_tool_registry,
    )

    from ngertiin_engine.delegation_store import Children
    from ngertiin_engine.integration import require_signature
    from ngertiin_engine.reliability import execution

    class ScopedDelegation(DelegationProvider):
        name = "ngertiin"

        def task_parameters(self, config):
            selected = policy_config()
            parameters = {
                "model_ref": {
                    "type": "string",
                    "description": "Optional owner-local model ID from the configured delegation model catalog.",
                },
                "allowed_toolsets": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional subset of the parent's toolsets. Empty means no tools.",
                },
            }
            # Account catalogs can exceed provider tool-schema enum limits.
            # route_task validates references against the frozen owner catalog.
            toolsets = selected.get("nma_capabilities", {}).get("toolsets", [])
            if toolsets:
                parameters["allowed_toolsets"]["items"]["enum"] = list(toolsets)
            return parameters

        def route_task(self, task, config):
            selected, stamp = check()
            models = selected.get("nma_delegation_models", {})
            reference = task.get("model_ref")
            snapshot = (
                models.get(reference) if reference else selected.get("nma_provider")
            )
            if not snapshot:
                raise DelegationRouteError(
                    "Select an available owner-local model_ref; no child was started."
                )
            row = _adapter.store.write(
                lambda conn: _adapter.reliability.check(conn, stamp)
            )
            _, runtime = _adapter.provider_transport.runtime(
                snapshot,
                selected["nma_context"]["thread_id"],
                row[0],
                _adapter.row(row[0])[2],
                {**stamp, "delegation_route_id": str(uuid4())},
            )
            return {
                **{
                    k: runtime[k]
                    for k in ("provider", "base_url", "api_key", "api_mode")
                },
                "model": snapshot["model"],
                "request_overrides": {},
                "label": reference or snapshot["provider_id"] + ":" + snapshot["model"],
            }

    register_provider(ScopedDelegation())

    for function, names in (
        (tool_executor._resolve_sequential_dispatch, ("agent", "ref", "messages")),
        (delegate_tool._build_child_agent, ("task_index", "goal", "parent_agent")),
        (delegate_tool._run_single_child, ("task_index", "goal", "child")),
        (AIAgent.run_conversation, ("user_message",)),
        (delegate_tool_dispatch._resolve_async_wake_sid, ("origin_wake_sid",)),
        (delegate_tool_registry.interrupt_subagent, ("subagent_id",)),
    ):
        require_signature(function, names)

    original_dispatch = tool_executor._resolve_sequential_dispatch
    original_build = delegate_tool._build_child_agent
    original_run = delegate_tool._run_single_child
    original_conversation = AIAgent.run_conversation
    original_seed = delegate_tool_child_run._ChildRun.seed_workspace
    original_hint = delegate_tool._resolve_workspace_hint
    original_definitions = model_tools.get_tool_definitions
    original_config = delegate_tool._load_config
    original_toolsets = delegate_tool._resolve_child_toolsets
    original_delivery = delegate_tool_dispatch._resolve_async_wake_sid
    original_interrupt = delegate_tool_registry.interrupt_subagent
    signature = inspect.signature(original_build)

    def dispatch(agent, ref, messages):
        selected = original_dispatch(agent, ref, messages)
        if ref.name != "delegate_task" or not policy_config().get("nma_capabilities"):
            return selected

        def invoke(args):
            try:
                config, stamp = check()
                if "delegation" not in config["nma_capabilities"]["toolsets"]:
                    raise EngineError("CAPABILITY_DENIED")
                ids = _CallIds(
                    task_id=ref.task_id,
                    session_id=agent.session_id,
                    tool_call_id=ref.call_id,
                    turn_id=agent._current_turn_id,
                )
                token = request.set({"arguments": args, "policy": active_policy()})
                try:
                    # Native top-level dispatch omits output_schema at this pin.
                    # Use its public lifecycle entry point with the complete schema.
                    def native():
                        result = delegate_tool.delegate_task(
                            **{
                                k: v
                                for k, v in args.items()
                                if k
                                in {
                                    "goal",
                                    "context",
                                    "tasks",
                                    "role",
                                    "output_schema",
                                    "images",
                                    "action",
                                    "subagent_id",
                                    "message",
                                }
                            },
                            parent_agent=agent,
                            background=not (getattr(agent, "_delegate_depth", 0) > 0),
                        )
                        from ngertiin_engine.delegation_delivery import (
                            completion_data,
                            record,
                        )

                        record(_adapter, stamp, ids, result)
                        return canonical(completion_data(json.loads(result)))

                    return _adapter.reliability.tool(stamp, ref.name, args, ids, native)
                finally:
                    request.reset(token)
            except EngineError as error:
                logging.getLogger(__name__).exception("Scoped delegation refused")
                return canonical({"error": error.code, "outcome": "rejected"})

        return replace(selected, execute=invoke)

    def build(*args, **kwargs):
        config = policy_config()
        if not config.get("nma_capabilities"):
            return original_build(*args, **kwargs)
        config, stamp = check()
        bound = signature.bind(*args, **kwargs)
        index = bound.arguments["task_index"]
        descriptor = {"goal": bound.arguments["goal"], "task_index": index}
        current = request.get() or {}
        tasks = current.get("arguments", {}).get("tasks") or []
        task = tasks[index] if index < len(tasks) else {}
        permitted = config["nma_capabilities"]["toolsets"]
        narrowed = task.get("allowed_toolsets", permitted)
        if not isinstance(narrowed, list) or set(narrowed) - set(permitted):
            raise EngineError("CAPABILITY_DENIED")
        bound.arguments["toolsets"] = narrowed
        # Profile routing and host workspace discovery are never model inputs.
        bound.arguments["profile_home"] = None
        child = original_build(*bound.args, **bound.kwargs)
        child_config = json.loads(canonical(config))
        child_config["nma_capabilities"]["toolsets"] = list(
            child.enabled_toolsets or []
        )
        child_config["nma_child_session_id"] = child.session_id
        child_config["nma_child_mcp"] = "allowed_toolsets" not in task
        child._nma_policy = replace(
            active_policy(),
            config_json=canonical(child_config),
            toolsets=tuple(child.enabled_toolsets or []),
        )
        child._nma_stamp = {**stamp, "child_session_id": child.session_id}
        route_id = child.base_url.rstrip("/").rsplit("/", 1)[-1]
        route = _adapter.provider_transport.routes.get(route_id)
        if route is None:
            child.close()
            raise EngineError("ACCESS_REVOKED")
        route["execution"] = child._nma_stamp
        descriptor.update(
            model=child.model, toolsets=list(child.enabled_toolsets or [])
        )
        from ngertiin_engine.native_surface import child_resource_agent

        descriptor["resource_agent_id"] = child_resource_agent(
            _adapter.owner, config["nma_context"]["agent_id"], child.session_id
        )
        descriptor["agent_id"] = config["nma_context"]["agent_id"]
        try:
            Children(_adapter.store).register(stamp, child, descriptor)
        except BaseException:
            child.close()
            raise
        return child

    def conversation(agent, *args, **kwargs):
        policy = getattr(agent, "_nma_policy", None)
        if policy is None:
            return original_conversation(agent, *args, **kwargs)
        token = execution.set(agent._nma_stamp)
        try:
            with policy_scope(policy, authority=_adapter.authority):
                check()
                return original_conversation(agent, *args, **kwargs)
        finally:
            execution.reset(token)

    def run(*args, **kwargs):
        child = kwargs.get("child")
        if child is None or not hasattr(child, "_nma_stamp"):
            return original_run(*args, **kwargs)
        value = original_run(*args, **kwargs)
        Children(_adapter.store).finish(child._nma_stamp, child, value)
        return value

    def seed(run):
        if not hasattr(run.child, "_nma_stamp"):
            return original_seed(run)
        # Actual tool work runs in a child-bound capsule. Native host worktree
        # discovery/terminal aliases must not touch the gateway filesystem.
        run.child_task_id = run.subagent_id
        run.parent_task_id = getattr(run.parent_agent, "_current_task_id", None)
        run.wall_start = time.time()
        run.parent_reads_snapshot = []

    def hint(parent):
        return (
            None if policy_config().get("nma_capabilities") else original_hint(parent)
        )

    def load_config():
        config = policy_config()
        return (
            config.get("delegation", {})
            if config.get("nma_capabilities")
            else original_config()
        )

    def toolsets(parent, narrowed, role):
        if policy_config().get("nma_capabilities") and narrowed == []:
            return [], []
        return original_toolsets(parent, narrowed, role)

    def delivery(origin_wake_sid, origin_session_history_delivery=False):
        from gateway.session_finite import finite_turn_required

        if (
            policy_config().get("nma_context")
            and not policy_config().get("nma_child_session_id")
            and finite_turn_required() is not True
        ):
            _config, stamp = check()
            row = _adapter.store.write(
                lambda conn: _adapter.reliability.check(conn, stamp)
            )
            # Ngertiin consumes only native durable results and re-enters through
            # its existing admission outbox. This grants no native model wake.
            return _adapter.row(row[0])[2]
        return original_delivery(origin_wake_sid, origin_session_history_delivery)

    def definitions(*args, **kwargs):
        values = original_definitions(*args, **kwargs)
        from agent.delegation_context import is_delegated_child_context

        from ngertiin_engine.learning import TOOLS

        if policy_config().get("nma_capabilities") and is_delegated_child_context():
            excluded = TOOLS | {"responsibility", "collaboration"}
            return [d for d in values if d["function"]["name"] not in excluded]
        return values

    def interrupt(subagent_id):
        # Fence the complete native subtree before its cooperative interrupt can
        # race a late provider response or a new tool boundary.
        if _adapter is not None:
            Children(_adapter.store).cancel_tree(subagent_id)
        return original_interrupt(subagent_id)

    tool_executor._resolve_sequential_dispatch = dispatch
    delegate_tool._build_child_agent = build
    delegate_tool._run_single_child = run
    delegate_tool._resolve_workspace_hint = hint
    delegate_tool._load_config = load_config
    delegate_tool._resolve_child_toolsets = toolsets
    model_tools.get_tool_definitions = definitions
    delegate_tool_dispatch._resolve_async_wake_sid = delivery
    delegate_tool_registry.interrupt_subagent = interrupt
    delegate_tool_child_run._ChildRun.seed_workspace = seed
    AIAgent.run_conversation = conversation
