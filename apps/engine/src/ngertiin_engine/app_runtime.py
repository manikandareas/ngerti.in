"""Adapt full native MCP configuration to Hermes's private session transport seam."""

import threading
from importlib.metadata import version

from ngertiin_engine.app_connections import owner_apps
from ngertiin_engine.contracts import EngineError

_references = {}
_lock = threading.RLock()


def reference(server_name):
    with _lock:
        return _references.get(server_name)


def register_reference(server_name, ref):
    with _lock:
        _references[server_name] = ref


def discover(apps, identity, generation):
    from tools.mcp_tool import _servers
    from tools.mcp_tool_common import mcp_field
    from tools.mcp_tool_discovery import register_mcp_servers
    from tools.mcp_tool_lifecycle import shutdown_mcp_servers
    from tools.mcp_tool_schema import _build_utility_schemas, mcp_prefixed_tool_name
    from tools.mcp_tool_scope import _resolve_server_key
    from tools.registry import registry, session_tool_scope

    name = apps.token_name(identity, generation)
    scope = "nma-app-discovery:" + apps.owner + ":" + name
    ref = {"connection_id": identity, "generation": generation}
    register_reference(name, ref)
    config = apps.native_config(identity, generation, name)
    # Discovery lists the complete offered catalog. Dispatch still applies the
    # frozen selection, so an excluded tool can be selected again in the UI.
    config["tools"] = {}
    try:
        with session_tool_scope(scope):
            names = register_mcp_servers({name: config})
            server = _servers.get(_resolve_server_key(name))
            if server is None:
                raise EngineError("CONNECTOR_UNAVAILABLE")
            raw_names = {
                mcp_prefixed_tool_name(name, tool.name): tool.name
                for tool in server._tools
            }
            raw_names.update(
                {
                    entry["schema"]["name"]: entry["handler_key"]
                    for entry in _build_utility_schemas(name)
                }
            )
            annotations = {
                tool.name: tool.annotations.model_dump(by_alias=True, exclude_none=True)
                if tool.annotations is not None
                else {}
                for tool in server._tools
            }
            tools = []
            for native_name in names:
                entry = registry.get_entry(native_name)
                if entry is None:
                    continue
                # This is the native schema, not a rewritten generic tool contract.
                tools.append(
                    {
                        "name": raw_names[native_name],
                        "schema": entry.schema,
                        "annotations": annotations.get(raw_names[native_name], {}),
                        "side_effects": "read"
                        if annotations.get(raw_names[native_name], {}).get(
                            "readOnlyHint"
                        )
                        is True
                        else "may_mutate",
                        "verification": "operation_acceptance_pending",
                    }
                )
            initialized = getattr(server, "initialize_result", None)
            server_info = mcp_field(initialized, "server_info", "serverInfo")
            protocol = {
                "sdk": version("mcp"),
                "protocol_version": mcp_field(
                    initialized, "protocol_version", "protocolVersion"
                ),
                "server": server_info.model_dump(exclude_none=True)
                if server_info is not None
                else None,
            }
            return apps.discovered(identity, generation, tools, protocol)
    finally:
        shutdown_mcp_servers(scope=scope)


def install():
    from gateway import session_local_mcp
    from hermes_cli import mcp_config
    from tools import mcp_oauth_provider, mcp_tool_loop, mcp_tool_registration
    from tools.mcp_oauth import HermesTokenStorage

    from ngertiin_engine.integration import require_signature

    require_signature(session_local_mcp._configs, ("servers", "names", "cwd"))
    require_signature(
        mcp_oauth_provider.prepare_oauth_config,
        ("server_name", "server_url", "oauth_config"),
    )
    original = session_local_mcp._configs
    original_prepare = mcp_oauth_provider.prepare_oauth_config
    original_get_tokens = HermesTokenStorage.get_tokens
    original_set_tokens = HermesTokenStorage.set_tokens
    original_stop = mcp_tool_loop._stop_mcp_loop
    original_save = mcp_config._save_mcp_server
    original_utilities = mcp_tool_registration._select_utility_schemas
    require_signature(original_stop, ("only_if_idle",))
    require_signature(original_utilities, ("server_name", "server", "config"))
    require_signature(original_save, ("name", "server_config"))

    def save_server(name, server_config):
        if reference(name):
            # The native OAuth worker persists a profile entry at commit. Keep
            # that receipt disabled and secret-free: only an agent's scoped
            # private connection reference can activate this server.
            server_config = {
                "url": server_config["url"],
                "auth": "oauth",
                "enabled": False,
            }
        return original_save(name, server_config)

    def utilities(server_name, server, config):
        selected = original_utilities(server_name, server, config)
        if reference(server_name) and "include" in (config.get("tools") or {}):
            include = set(config["tools"]["include"])
            return [entry for entry in selected if entry["handler_key"] in include]
        return selected

    def stop_loop(*, only_if_idle=False):
        # A scoped disconnect can race a new native discovery pass after it has
        # ensured the shared loop. Keep that one native loop until gateway-wide
        # shutdown; scoped servers and their credentials are still torn down.
        if only_if_idle:
            return False
        return original_stop(only_if_idle=False)

    def remember_tokens(tokens):
        if tokens is not None:
            from ngertiin_engine.redaction import remember

            for key in ("access_token", "refresh_token", "id_token"):
                value = getattr(tokens, key, None)
                if value:
                    remember({"headers": [{"value": value}]})

    async def get_tokens(storage):
        tokens = await original_get_tokens(storage)
        remember_tokens(tokens)
        return tokens

    async def set_tokens(storage, tokens):
        remember_tokens(tokens)
        return await original_set_tokens(storage, tokens)

    def configs(servers, names, cwd):
        values = original(servers, names, cwd)
        for index, name in names.items():
            ref = servers[index].get("_nma_app")
            if ref:
                apps = owner_apps()
                if servers[index].get("_nma_configuration") != apps.fingerprint(
                    apps.check(**ref)
                ):
                    raise EngineError("ACCESS_REVOKED")
                config = apps.native_config(**ref, scope_name=name)
                values[name] = config
                register_reference(name, ref)
        return values

    def prepare(server_name, server_url, oauth_config):
        ref = reference(server_name)
        if ref:
            apps = owner_apps()
            apps.check(**ref)
            server_name = apps.token_name(ref["connection_id"], ref["generation"])
        return original_prepare(server_name, server_url, oauth_config)

    session_local_mcp._configs = configs
    mcp_oauth_provider.prepare_oauth_config = prepare
    HermesTokenStorage.get_tokens = get_tokens
    HermesTokenStorage.set_tokens = set_tokens
    mcp_tool_loop._stop_mcp_loop = stop_loop
    mcp_tool_registration._select_utility_schemas = utilities
    mcp_config._save_mcp_server = save_server


def check_callback(server_name, context):
    """Callbacks inherit the exact tool call's policy; a background server has no grant."""
    from tools.mcp_tool import _servers
    from tools.mcp_tool_scope import _resolve_server_key

    server = _servers.get(_resolve_server_key(server_name))
    captured = getattr(server, "_pending_call_context", None)
    if not reference(server_name) or captured is None:
        raise EngineError("ACCESS_REVOKED")
    return captured.copy().run(context)
