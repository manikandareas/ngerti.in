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


def install():
    from gateway import session_context_refs
    from gateway.session_policy import policy_for_source

    original = session_context_refs.inbound_references

    async def inbound(runner, source, session_key, text):
        policy = policy_for_source(runner, source)
        scope = policy.config(secrets=False).get("nma_context") if policy else None
        if scope:
            try:
                return await expand(text, scope)
            except (EngineError, ValueError):
                return (
                    text,
                    "INVALID_CONTEXT_REFERENCE: use a relative path inside this conversation's workspace.",
                )
        return await original(runner, source, session_key, text)

    session_context_refs.inbound_references = inbound
