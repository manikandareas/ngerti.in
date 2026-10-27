"""Durable, owner-scoped forms for native MCP callbacks and declared cost consent."""

import asyncio
import os
import time
from types import SimpleNamespace
from uuid import uuid4

from ngertiin_engine.app_connections import owner_apps
from ngertiin_engine.contracts import EngineError, uuid
from ngertiin_engine.provider_secrets import Vault
from ngertiin_engine.redaction import result as redact

_store_factory = None


def journal():
    return Vault(
        os.environ["HERMES_HOME"],
        os.environ["NMA_OWNER_ID"],
        directory="app-interactions",
    )


def authorize(value):
    from ngertiin_engine.capabilities import authorize as authorize_capabilities
    from ngertiin_engine.context import authorize_context
    from ngertiin_engine.reliability import Reliability

    apps = owner_apps()
    apps.check(**value["connection"])
    authorize_capabilities(
        value["config"]["nma_capabilities"], apps.home / "state.db", apps.owner
    )
    authorize_context(
        SimpleNamespace(config=lambda **_: value["config"]),
        apps.home / "state.db",
        apps.owner,
    )
    if _store_factory is None:
        raise EngineError("ACCESS_REVOKED")
    store = _store_factory()
    if (
        store.write(lambda conn: Reliability(store).check(conn, value["execution"]))
        is None
    ):
        raise EngineError("ACCESS_REVOKED")


def listing():
    vault = journal()
    items = []
    for path in sorted(vault.root.glob("*.json")):
        value = vault.read(path.stem)
        if value["status"] != "pending":
            continue
        try:
            authorize(value)
            if value["expires_at"] <= time.time():
                continue
        except EngineError:
            continue
        items.append(
            {
                key: value[key]
                for key in (
                    "interaction_id",
                    "connection",
                    "thread_id",
                    "message",
                    "schema",
                    "expires_at",
                )
            }
        )
    return {"items": items}


def answer(payload):
    import jsonschema

    if set(payload) != {"interaction_id", "action", "content"} or payload[
        "action"
    ] not in {"accept", "decline", "cancel"}:
        raise EngineError("INVALID_REQUEST")
    identity, vault = uuid(payload["interaction_id"]), journal()
    with vault.locked(identity):
        value = vault.read(identity)
        authorize(value)
        if value["expires_at"] <= time.time():
            raise EngineError("STALE_GENERATION")
        result = {"action": payload["action"], "content": payload["content"]}
        if value["status"] != "pending":
            if value.get("answer") == result:
                return {"interaction_id": identity, "status": value["status"]}
            raise EngineError("COMMAND_CONFLICT")
        if payload["action"] == "accept":
            try:
                jsonschema.validate(payload["content"], value["schema"])
            except jsonschema.ValidationError:
                raise EngineError("INVALID_REQUEST") from None
        value.update(status="answered", answer=result)
        vault.write(identity, value)
        return {"interaction_id": identity, "status": "answered"}


def request(server_name, message, schema, timeout=300):
    from gateway.session_policy import active_policy

    from ngertiin_engine.app_runtime import reference
    from ngertiin_engine.reliability import execution

    policy, stamp = active_policy(), execution.get()
    if not policy or not stamp or not reference(server_name):
        raise EngineError("ACCESS_REVOKED")
    identity, vault = str(uuid4()), journal()
    config = policy.config(secrets=False)
    value = {
        "interaction_id": identity,
        "connection": reference(server_name),
        "config": config,
        "execution": stamp,
        "thread_id": config["nma_context"]["thread_id"],
        "message": redact(message),
        "schema": redact(schema),
        "status": "pending",
        "expires_at": time.time() + min(300, max(1, timeout)),
    }
    authorize(value)
    vault.write(identity, value)
    try:
        while time.time() < value["expires_at"]:
            authorize(value)
            current = vault.read(identity)
            if current["status"] == "answered":
                return current["answer"]
            time.sleep(0.2)
        return {"action": "cancel", "content": {}}
    finally:
        with vault.locked(identity):
            current = vault.read(identity)
            current["status"] = "consumed"
            vault.write(identity, current)


def install():
    from tools import approval_prompt, mcp_tool_sampling

    from ngertiin_engine.app_runtime import check_callback, reference

    original_elicit = mcp_tool_sampling.ElicitationHandler.__call__
    original_sampling = mcp_tool_sampling.SamplingHandler.__call__
    original_build = mcp_tool_sampling.SamplingHandler._build_llm_call
    original_consent = approval_prompt.request_elicitation_consent

    async def sampling(handler, context, params):
        if not reference(handler.server_name):
            return await original_sampling(handler, context, params)
        try:
            return await original_sampling(handler, context, params)
        except Exception as exc:  # noqa: BLE001 - preserve a typed native protocol error at the callback boundary
            import logging

            logging.getLogger(__name__).warning(
                "Native MCP sampling callback failed (%s): %s",
                type(exc).__name__,
                redact(str(exc))[:500],
            )
            return handler._fail(
                "Native MCP sampling callback failed: " + redact(str(exc))[:500]
            )

    async def elicit(handler, context, params):
        if not reference(handler.server_name):
            return await original_elicit(handler, context, params)
        if getattr(params, "mode", "form") == "url":
            return handler._result("decline", "declined")
        schema = (
            getattr(params, "requested_schema", None)
            or getattr(params, "requestedSchema", None)
            or {}
        )
        message = getattr(params, "message", "")
        try:
            result = await asyncio.to_thread(
                check_callback,
                handler.server_name,
                lambda: request(handler.server_name, message, schema, handler.timeout),
            )
            from mcp.types import ElicitResult

            return ElicitResult(
                action=result["action"],
                content=result.get("content") if result["action"] == "accept" else None,
            )
        except EngineError:
            return handler._result("cancel", "errors")

    def build(handler, params, resolved_model):
        if not reference(handler.server_name):
            return original_build(handler, params, resolved_model)

        def invoke():
            def scoped():
                from gateway.session_policy import active_policy

                from ngertiin_engine.capabilities import authorize as check

                config = active_policy().config(secrets=False)
                apps = owner_apps()
                check(config["nma_capabilities"], apps.home / "state.db", apps.owner)
                # The native auxiliary resolver chooses this run's frozen model.
                # A server-supplied arbitrary model cannot select profile credentials.
                return original_build(handler, params, "")()

            try:
                return check_callback(handler.server_name, scoped)
            except EngineError as exc:
                import logging

                logging.getLogger(__name__).warning(
                    "Native MCP sampling refused: %s", exc.code
                )
                raise

        return invoke

    def consent(message, description="", **kwargs):
        surface = kwargs.get("surface", "")
        server = (
            surface.split("/", 1)[-1]
            if surface.startswith(("mcp-trust/", "mcp-events/"))
            else None
        )
        if server and reference(server):
            result = request(
                server,
                message + "\n" + description,
                {"type": "object", "properties": {}},
                kwargs.get("timeout_seconds", 300),
            )
            return result["action"]
        return original_consent(message, description, **kwargs)

    mcp_tool_sampling.ElicitationHandler.__call__ = elicit
    mcp_tool_sampling.SamplingHandler.__call__ = sampling
    mcp_tool_sampling.SamplingHandler._build_llm_call = build
    approval_prompt.request_elicitation_consent = consent


def attach(runner, owner):
    global _store_factory
    from gateway.session_authorities import active_authority

    from ngertiin_engine.store import Store

    _store_factory = lambda: Store(active_authority(runner), owner)
