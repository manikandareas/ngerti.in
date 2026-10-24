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


def resolve(config):
    """Resolve only assigned IDs; secrets never enter returned durable metadata."""
    data = catalog()
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
                    from toolsets import validate_toolset

                    name = entry["toolset"]
                    if name not in {"nma_workspace", "nma_computer"} and (
                        not validate_toolset(name) or name not in {"todo"}
                    ):
                        raise ValueError
                    toolsets.append(name)
                    identity = {"toolset": name}
                elif field == "skill_refs":
                    content = entry["content"]
                    if not isinstance(content, str) or len(content) > 16000:
                        raise ValueError
                    skills.append(f"# Assigned skill: {key}\n{content}")
                    identity = {"content": content}
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
                snapshots[field][key] = digest(identity)
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
    return {
        field: [
            {"id": key, "label": entry.get("label", key)}
            for key, entry in catalog().get(field, {}).items()
            if entry.get("enabled") is True
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
        resolved, servers = resolve(marker["grants"])
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

    def dispatch(function_name, function_args, original_args, ids, **kwargs):
        policy = active_policy()
        marker = (
            policy.config(secrets=False).get("nma_capabilities") if policy else None
        )
        if marker:
            try:
                from ngertiin_engine.context import authorize_context

                authorize(marker, database, owner)
                authorize_context(policy, database, owner)
                allowed = {
                    name
                    for toolset in marker["toolsets"]
                    for name in resolve_toolset(toolset)
                }
                if policy.editor_mcp_json:
                    allowed.update(json.loads(policy.editor_mcp_json)["schemas"])
                if (
                    function_name not in allowed
                    or registry.get_entry(function_name) is None
                ):
                    raise EngineError("CAPABILITY_DENIED")
            except EngineError as exc:
                return json.dumps({"error": exc.code})
        value = original(function_name, function_args, original_args, ids, **kwargs)
        return redaction.result(value) if marker else value

    model_tools._execute_tool = dispatch
