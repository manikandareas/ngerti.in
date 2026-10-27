"""Server-owned capability catalog and live authorization for frozen native sessions."""

import json
import os
import re
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit

from ngertiin_engine import redaction
from ngertiin_engine.contracts import EngineError, digest

FIELDS = ("tool_grants", "mcp_grants", "skill_refs")


def install_discovery_guard():
    """Reject credential-bearing schemas before native staging, refreeze or execution."""
    from gateway import session_local_mcp
    from hermes_state_runtime import RuntimeStoreError

    original = session_local_mcp._borrowed

    @contextmanager
    def borrowed(authority, scope, servers, names, cwd, *, partial=False):
        for server in servers:
            redaction.remember(server)
        with original(authority, scope, servers, names, cwd, partial=partial) as value:
            schemas, _ = value
            # Reject rather than rewriting names/parameter schemas or native fingerprints.
            # This shared seam also covers background schema refresh and post-restart discovery.
            if redaction.result(schemas) != schemas:
                raise RuntimeStoreError("acp_mcp_discovery_failed")
            yield value

    session_local_mcp._borrowed = borrowed


def catalog():
    path = os.environ.get("NMA_CAPABILITIES_FILE")
    try:
        data = json.loads(Path(path).read_text()) if path else {}
        if not isinstance(data, dict):
            raise TypeError
        return data
    except (OSError, ValueError, TypeError):
        raise EngineError("CAPABILITY_UNAVAILABLE") from None


def resolve(config, *, expected_snapshots=None):
    """Resolve only assigned IDs; secrets never enter returned durable metadata."""
    data = catalog()
    if expected_snapshots is None:
        expected_snapshots = config.get("runtime_capabilities", {}).get("snapshots", {})
    snapshots, toolsets, skills, servers = {}, [], [], []
    for field in FIELDS:
        ids = config.get(field, [])
        if (
            not isinstance(ids, list)
            or len(ids) > 16
            or any(
                not isinstance(i, str) or not re.fullmatch(r"[a-z][a-z0-9_-]{0,63}", i)
                for i in ids
            )
            or len(set(ids)) != len(ids)
        ):
            raise EngineError("INVALID_REQUEST")
        snapshots[field] = {}
        for key in ids:
            entry = data.get(field, {}).get(key)
            if not isinstance(entry, dict) or entry.get("enabled") is not True:
                raise EngineError("CAPABILITY_UNAVAILABLE")
            try:
                if field == "tool_grants":
                    from ngertiin_engine.native_catalog import (
                        inspect_bundle,
                        unchanged_historical_bundle,
                    )

                    identity = inspect_bundle(key, entry, data)
                    missing = set(identity["requires"]) - set(ids)
                    if missing:
                        raise EngineError(
                            "CAPABILITY_DEPENDENCY_REQUIRED",
                            {"capability": key, "dependencies": sorted(missing)},
                        )
                    toolsets.append(identity["toolset"])
                elif field == "skill_refs":
                    content = entry["content"]
                    if not isinstance(content, str) or len(content) > 16000:
                        raise ValueError
                    skills.append(f"# Assigned skill: {key}\n{content}")
                    identity = {"content": content}
                    from ngertiin_engine.skill_assets import directory, manifest

                    assets = manifest(entry)
                    if assets:
                        if not any(
                            data.get("execution_surfaces", {})
                            .get(
                                data.get("tool_grants", {})
                                .get(grant, {})
                                .get("execution_surface"),
                                {},
                            )
                            .get("kind")
                            == "scoped_linux"
                            for grant in config.get("tool_grants", [])
                        ):
                            raise EngineError(
                                "CAPABILITY_DEPENDENCY_REQUIRED",
                                {"skill": key, "reason": "native_workspace_required"},
                            )
                        identity["native_assets"] = assets
                        skills.append(
                            "Native skill assets: /work/"
                            + directory(entry)
                            + "/\n"
                            + "\n".join(assets)
                        )
                else:
                    # Native session-scoped MCP supports these private transport specifications.
                    # A separate private file keeps values out of catalog responses and SQLite.
                    server = json.loads(Path(entry["server_file"]).read_text())
                    from gateway.session_local_mcp import validate_servers

                    url = urlsplit(server.get("url", ""))
                    if (
                        server.get("type") != "http"
                        or url.scheme not in {"http", "https"}
                        or not url.hostname
                        or url.username
                        or url.password
                        or url.query
                        or url.fragment
                    ):
                        raise ValueError
                    validate_servers([server])
                    redaction.remember(server)
                    servers.append(server)
                    identity = {"server": server}
                # Preserve existing immutable grants without increasing permissions.
                legacy = (
                    field == "tool_grants"
                    and unchanged_historical_bundle(identity)
                    and (
                        data.get("version", 1) == 1
                        or expected_snapshots.get(field, {}).get(key)
                        == digest({"toolset": identity["toolset"]})
                    )
                )
                snapshots[field][key] = digest(
                    {"toolset": identity["toolset"]} if legacy else identity
                )
            except EngineError:
                raise
            except Exception:  # noqa: BLE001 - invalid catalog/connector details stay private
                raise EngineError("CAPABILITY_UNAVAILABLE") from None
    if len({server["name"] for server in servers}) != len(servers):
        raise EngineError("CAPABILITY_UNAVAILABLE")
    return {
        "snapshots": snapshots,
        "toolsets": sorted(set(toolsets)),
        "skills": skills,
    }, servers


def public_catalog():
    from ngertiin_engine.native_catalog import public_bundle

    data = catalog()
    return {
        field: [
            public_bundle(key, entry, data)
            if field == "tool_grants"
            else {"id": key, "label": entry.get("label", key)}
            for key, entry in data.get(field, {}).items()
            if isinstance(entry, dict)
            and (field == "tool_grants" or entry.get("enabled") is True)
        ]
        for field in FIELDS
    }


def authorize(marker, database, owner):
    """Check committed access generation and live catalog before new effects, including restart."""
    try:
        with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as conn:
            row = conn.execute(
                "SELECT status,access_generation FROM nma_agents WHERE owner_id=? AND agent_id=?",
                (owner, marker["agent_id"]),
            ).fetchone()
        if row != ("active", int(marker["access_generation"])):
            raise EngineError("ACCESS_REVOKED")
        resolved, servers = resolve(
            marker["grants"], expected_snapshots=marker["snapshots"]
        )
        if resolved["snapshots"] != marker["snapshots"]:
            raise EngineError("ACCESS_REVOKED")
        return servers
    except Exception:  # noqa: BLE001 - authorization must fail closed
        # Authorization failures, including a missing catalog or secret, must never fail open.
        raise EngineError("ACCESS_REVOKED") from None


def install_dispatch_guard(database, owner):
    """Wrap the pinned final native dispatch seam, including deferred tool_call children."""
    import model_tools
    from gateway.session_policy import active_policy
    from tools.registry import registry
    from toolsets import resolve_toolset

    original = model_tools._execute_tool

    original_registry = registry.dispatch
    original_definitions = registry.get_definitions

    def definitions(tool_names, quiet=False):
        values = original_definitions(tool_names, quiet=quiet)
        policy = active_policy()
        marker = (
            policy.config(secrets=False).get("nma_capabilities") if policy else None
        )
        if not marker:
            return values
        data = catalog()
        isolated = {
            name
            for key in marker["grants"].get("tool_grants", [])
            if (entry := data.get("tool_grants", {}).get(key, {}))
            and data.get("execution_surfaces", {})
            .get(entry.get("execution_surface"), {})
            .get("kind")
            == "scoped_linux"
            for name in resolve_toolset(entry["toolset"])
        }
        present = {value["function"]["name"] for value in values}
        for name in sorted(set(tool_names) & isolated - present):
            entry = registry.get_entry(name)
            if entry is not None:
                definition = {
                    "type": "function",
                    "function": {**entry.schema, "name": name},
                }
                if name == "browser_exec" and entry.dynamic_schema_overrides:
                    # Availability belongs to the capsule, not this gateway host.
                    # Reuse native helper guidance while retaining the capsule's
                    # fixed parameters; host real-profile consent adds no surface.
                    overrides = entry.dynamic_schema_overrides()
                    definition["function"]["description"] = overrides["description"]
                if redaction.result(definition) != definition:
                    raise EngineError("CAPABILITY_UNAVAILABLE")
                values.append(definition)
        return values

    def check(function_name):
        policy = active_policy()
        marker = (
            policy.config(secrets=False).get("nma_capabilities") if policy else None
        )
        if not marker:
            return False
        from ngertiin_engine.context import authorize_context

        authorize(marker, database, owner)
        authorize_context(policy, database, owner)
        allowed = {
            name for toolset in marker["toolsets"] for name in resolve_toolset(toolset)
        }
        if policy.editor_mcp_json:
            allowed.update(json.loads(policy.editor_mcp_json)["schemas"])
        if function_name not in allowed or registry.get_entry(function_name) is None:
            raise EngineError("CAPABILITY_DENIED")
        return True

    def registry_dispatch(name, args, **kwargs):
        # Native execute_code RPC and plugin-to-plugin dispatch can call the
        # registry directly, bypassing the model_tools wrapper.
        try:
            scoped = check(name)
        except EngineError as exc:
            return json.dumps({"error": exc.code, "outcome": "rejected"})
        if scoped:
            from ngertiin_engine.native_surface import invoke

            policy = active_policy()
            placed, value = invoke(
                name,
                args,
                policy.config(secrets=False)["nma_capabilities"],
                database,
                owner,
            )
            if placed:
                return redaction.result(value)
        value = original_registry(name, args, **kwargs)
        return redaction.result(value) if scoped else value

    def dispatch(function_name, function_args, original_args, ids, **kwargs):
        policy = active_policy()
        marker = (
            policy.config(secrets=False).get("nma_capabilities") if policy else None
        )
        if marker:
            try:
                check(function_name)
            except EngineError as exc:
                return json.dumps({"error": exc.code, "outcome": "rejected"})
        from ngertiin_engine.native_surface import call_identity

        token = call_identity.set(ids)
        try:
            value = original(function_name, function_args, original_args, ids, **kwargs)
            return redaction.result(value) if marker else value
        finally:
            call_identity.reset(token)

    model_tools._execute_tool = dispatch
    registry.dispatch = registry_dispatch
    registry.get_definitions = definitions
