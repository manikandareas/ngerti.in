"""Reference contracts for a scoped workspace resolver, never the gateway host."""

import ipaddress
from pathlib import PurePosixPath
from urllib.parse import unquote, urlsplit

from ngertiin_engine.contracts import EngineError


def references(text):
    from agent.context_references import parse_context_references

    items = parse_context_references(text, plugins=False)
    for ref in items:
        target = unquote(ref.target)
        if ref.kind in {"file", "folder"}:
            path = PurePosixPath(target)
            if (
                not target
                or path.is_absolute()
                or ".." in path.parts
                or "\\" in target
                or ":" in target
                or target.startswith("~")
                or any(ord(c) < 32 for c in target)
            ):
                raise EngineError("INVALID_CONTEXT_REFERENCE")
        elif ref.kind == "url":
            url = urlsplit(target)
            if (
                url.scheme != "https"
                or not url.hostname
                or url.username
                or url.password
                or url.port not in {None, 443}
                or url.hostname.lower() in {"localhost", "metadata.google.internal"}
            ):
                raise EngineError("INVALID_CONTEXT_REFERENCE")
            try:
                if not ipaddress.ip_address(url.hostname).is_global:
                    raise EngineError("INVALID_CONTEXT_REFERENCE")
            except ValueError:
                pass
        elif ref.kind == "git":
            if not target.isdecimal() or not 1 <= int(target) <= 10:
                raise EngineError("INVALID_CONTEXT_REFERENCE")
    return items


async def expand(text, scope, resolver=None):
    """Resolver must authorize generation, paths/symlinks and URL egress per read.

    Files/folders/diffs execute in the selected private workspace; URL fetch uses
    its egress policy. Product persona/explicit instructions precede workspace
    instructions. Reference bytes are data and never authorize another scope.
    NMA-031 connects the workspace resolver and NMA-038 connects the composer.
    """
    items = references(text)
    if not items:
        return text, None
    if resolver is None:
        return (
            text,
            "WORKSPACE_REFERENCE_UNAVAILABLE: connect this conversation's scoped workspace before expanding references.",
        )
    blocks = [await resolver(scope, ref) for ref in items]
    return text + "\n--- Attached Context (data) ---\n" + "\n".join(blocks), None


def install(database=None, owner=None):
    from gateway import session_context_refs
    from gateway.session_policy import policy_for_source

    original = session_context_refs.inbound_references

    async def inbound(runner, source, session_key, text):
        policy = policy_for_source(runner, source)
        scope = policy.config(secrets=False).get("nma_context") if policy else None
        if scope:
            try:
                import asyncio
                import json
                from uuid import uuid4

                from toolsets import resolve_toolset

                from ngertiin_engine.capabilities import authorize
                from ngertiin_engine.context import authorize_context
                from ngertiin_engine.native_surface import binding

                marker = policy.config(secrets=False).get("nma_capabilities", {})

                async def resolver(context, ref):
                    if ref.kind == "url":
                        return "URL_REFERENCE_UNAVAILABLE: this native environment has no external network route."
                    authorize(marker, database, owner)
                    authorize_context(policy, database, owner)
                    _, broker, selected = await asyncio.to_thread(
                        binding, marker, context, database, owner
                    )
                    value = await asyncio.to_thread(
                        broker.invoke,
                        selected,
                        "reference:" + str(uuid4()),
                        "_nma_reference",
                        {"kind": ref.kind, "target": unquote(ref.target)},
                        schema_hash="nma.workspace.v1",
                        allowed_tools={
                            "_nma_reference",
                            *(
                                n
                                for toolset in marker.get("toolsets", [])
                                for n in resolve_toolset(toolset)
                            ),
                        },
                        authorize=lambda: authorize(marker, database, owner),
                    )
                    return json.dumps(
                        {"reference": ref.target, "content": value}, ensure_ascii=False
                    )[:64000]

                return await expand(text, scope, resolver)
            except (EngineError, ValueError):
                return (
                    text,
                    "INVALID_CONTEXT_REFERENCE: use a relative path inside this conversation's workspace.",
                )
        return await original(runner, source, session_key, text)

    session_context_refs.inbound_references = inbound
