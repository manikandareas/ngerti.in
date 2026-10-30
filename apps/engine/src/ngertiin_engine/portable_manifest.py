"""Versioned, scoped agent distributions with atomic inactive history import.

Hermes profile archives contain host configuration, schedules and client state.
The web product uses a strict manifest instead of extracting arbitrary archives.
SOUL.md and relative skill assets retain their native content and hashes.
"""

import base64
import hashlib
import re
from pathlib import PurePosixPath

from ngertiin_engine.contracts import EngineError, canonical, uuid

VERSION = "ngertiin.agent.v1"
MAX_BUNDLE = 1024 * 1024
SELECTIONS = ("message_ids", "memory_ids", "skill_ids", "artifact_ids")


def text(value, limit=16000):
    if not isinstance(value, str) or len(value) > limit:
        raise EngineError("INVALID_BUNDLE")
    return value


def safe_path(value):
    from ngertiin_engine.skill_packages import checked_path

    checked_path(value)
    if value in {".", ".."}:
        raise EngineError("INVALID_BUNDLE_PATH")
    parts = PurePosixPath(value).parts
    forbidden = {
        ".env",
        ".envrc",
        "auth.json",
        "mcp.json",
        "config.yaml",
        "vault",
        "mcp-tokens",
        ".ssh",
        ".aws",
        ".gnupg",
        ".kube",
        ".docker",
        ".azure",
        "node_modules",
        ".git",
    }
    if (
        any(p.lower() in forbidden or p.lower().startswith(".env.") for p in parts)
        or ":" in value
        or value != str(PurePosixPath(value))
    ):
        raise EngineError("INVALID_BUNDLE_PATH")
    return value


def asset(data):
    from ngertiin_engine.redaction import _values

    if any(secret.encode() in data for secret in _values.copy() if secret):
        raise EngineError("CREDENTIAL_EXPORT_REJECTED")
    return {
        "data_base64": base64.b64encode(data).decode(),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def decode(item):
    if (
        not isinstance(item, dict)
        or set(item) - {"data_base64", "sha256", "executable"}
        or not {"data_base64", "sha256"} <= set(item)
        or "executable" in item
        and type(item["executable"]) is not bool
    ):
        raise EngineError("INVALID_BUNDLE")
    try:
        data = base64.b64decode(item["data_base64"], validate=True)
    except (ValueError, TypeError):
        raise EngineError("INVALID_BUNDLE") from None
    if hashlib.sha256(data).hexdigest() != item["sha256"]:
        raise EngineError("FILE_HASH_MISMATCH")
    return data


def validate(bundle):
    try:
        return _validate(bundle)
    except (TypeError, ValueError, KeyError, OverflowError, UnicodeError) as error:
        raise EngineError("INVALID_BUNDLE") from error


def _validate(bundle):
    if not isinstance(bundle, dict) or bundle.get("format") != VERSION:
        raise EngineError("UNSUPPORTED_VERSION")
    if len(canonical(bundle).encode()) > MAX_BUNDLE:
        raise EngineError("BUNDLE_TOO_LARGE")
    if set(bundle) != {
        "format",
        "source",
        "agent",
        "messages",
        "memories",
        "skills",
        "artifacts",
        "history",
    }:
        raise EngineError("INVALID_BUNDLE")
    history = bundle["history"]
    if (
        not isinstance(history, dict)
        or set(history) != {"kind", "title", "authors"}
        or history["kind"] not in {"dm", "group"}
        or not isinstance(history["authors"], dict)
        or len(history["authors"]) > 100
    ):
        raise EngineError("INVALID_BUNDLE")
    text(history["title"], 120)
    for author_id, name in history["authors"].items():
        uuid(author_id)
        text(name, 80)
    source, agent = bundle["source"], bundle["agent"]
    if not isinstance(source, dict) or set(source) != {
        "agent_id",
        "config_revision",
        "hermes_revision",
    }:
        raise EngineError("INVALID_BUNDLE")
    uuid(source["agent_id"])
    if (
        not isinstance(source["config_revision"], str)
        or not source["config_revision"].isdigit()
        or not isinstance(source["hermes_revision"], str)
        or not re.fullmatch("[0-9a-f]{40}", source["hermes_revision"])
    ):
        raise EngineError("INVALID_BUNDLE")
    if not isinstance(agent, dict) or set(agent) != {
        "display_name",
        "handle",
        "soul",
        "instructions",
        "model_reference",
        "session",
        "requirements",
        "inference_reference",
    }:
        raise EngineError("INVALID_BUNDLE")
    text(agent["display_name"], 80)
    if not agent["display_name"].strip():
        raise EngineError("INVALID_BUNDLE")
    if not isinstance(agent["handle"], str) or not re.fullmatch(
        "[a-z][a-z0-9_-]{0,39}", agent["handle"]
    ):
        raise EngineError("INVALID_BUNDLE")
    for k in ("soul", "instructions", "model_reference"):
        text(agent[k])
    from ngertiin_engine.session_settings import validate as session_validate

    session_validate(agent["session"])
    if not isinstance(agent["inference_reference"], dict):
        raise EngineError("INVALID_BUNDLE")
    # References are retained for review, never applied as live inference routes.
    if any(
        key in canonical(agent["inference_reference"]).lower()
        for key in (
            '"api_key"',
            '"password"',
            '"headers"',
            '"access_token"',
            '"refresh_token"',
            '"base_url"',
        )
    ):
        raise EngineError("INVALID_BUNDLE")
    if not isinstance(agent["requirements"], dict) or set(agent["requirements"]) != {
        "tool_grants",
        "mcp_grants",
        "skill_refs",
    }:
        raise EngineError("INVALID_BUNDLE")
    for items in agent["requirements"].values():
        if (
            not isinstance(items, list)
            or len(items) > 200
            or any(not isinstance(x, str) or len(x) > 200 for x in items)
        ):
            raise EngineError("INVALID_BUNDLE")
    for key in ("messages", "memories", "skills", "artifacts"):
        if not isinstance(bundle[key], list) or len(bundle[key]) > 1000:
            raise EngineError("INVALID_BUNDLE")
        ids = []
        for item in bundle[key]:
            if not isinstance(item, dict):
                raise EngineError("INVALID_BUNDLE")
            uuid(item.get("id"))
            ids.append(item["id"])
        if len(set(ids)) != len(ids):
            raise EngineError("INVALID_BUNDLE")
    for m in bundle["messages"]:
        if set(m) != {
            "id",
            "author_kind",
            "author_agent_id",
            "text",
            "created_at",
        } or m["author_kind"] not in {"user", "agent"}:
            raise EngineError("INVALID_BUNDLE")
        if (
            m["author_kind"] == "user"
            and m["author_agent_id"] is not None
            or m["author_kind"] == "agent"
            and m["author_agent_id"] not in history["authors"]
        ):
            raise EngineError("INVALID_BUNDLE")
        if (
            history["kind"] == "dm"
            and m["author_kind"] == "agent"
            and m["author_agent_id"] != source["agent_id"]
        ):
            raise EngineError("INVALID_BUNDLE")
        text(m["text"], 100000)
        text(m["created_at"], 50)
    for m in bundle["memories"]:
        if set(m) != {"id", "content", "revision"}:
            raise EngineError("INVALID_BUNDLE")
        text(m["content"])
        text(m["revision"], 20)
    names = []
    for s in bundle["skills"]:
        if set(s) != {"id", "name", "revision", "files"}:
            raise EngineError("INVALID_BUNDLE")
        name = safe_path(s["name"])
        if (
            "/" in name
            or len(name) > 64
            or not isinstance(s["files"], dict)
            or "SKILL.md" not in s["files"]
            or len(s["files"]) > 256
        ):
            raise EngineError("INVALID_BUNDLE")
        names.append(name)
        text(s["revision"], 20)
        for path, value in s["files"].items():
            safe_path(path)
            decode(value)
    if len(set(names)) != len(names):
        raise EngineError("INVALID_BUNDLE")
    for f in bundle["artifacts"]:
        if set(f) != {"id", "filename", "media_type", "asset"}:
            raise EngineError("INVALID_BUNDLE")
        from ngertiin_engine.files import filename

        filename(f["filename"])
        safe_path(f["filename"])
        text(f["media_type"], 100)
        decode(f["asset"])
    return bundle
