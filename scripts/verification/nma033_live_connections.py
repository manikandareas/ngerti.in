"""Read-only Notion/Linear smoke test using the product's saved native MCP connections.

This verifies transport/authentication and one real read per app, not model-driven
conversation behavior, writes, every connector operation or release reliability.
Run with the pinned engine Python and HERMES_SOURCE/PYTHONPATH configured.
"""

import argparse
import hashlib
import json
import os
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4


def decoded(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError:
            return value
    return value


def oracle(application, envelope, page_id):
    if not isinstance(envelope, dict) or envelope.get("error"):
        raise ValueError("Native MCP dispatch returned an error")
    result = decoded(envelope.get("structuredContent", envelope.get("result")))
    if application == "notion":
        text = json.dumps(result, ensure_ascii=False)
        if (
            page_id.replace("-", "") not in text.replace("-", "")
            or "NMA-033" not in text
        ):
            raise ValueError("The expected task page was not returned")
        return {"expected_page_id_matched": True, "expected_task_title_matched": True}
    if not isinstance(result, dict) or not isinstance(result.get("teams"), list):
        raise TypeError("The expected Linear teams response was not returned")
    teams = result["teams"]
    if len(teams) > 1 or any(not team.get("id") for team in teams):
        raise ValueError("Invalid bounded Linear teams response")
    return {"teams_returned": len(teams), "provider_ids_present": bool(teams)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path, required=True)
    parser.add_argument("--owner", required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--private-results", type=Path, required=True)
    args = parser.parse_args()
    os.environ["HERMES_HOME"] = str(args.home.resolve())
    os.environ["NMA_OWNER_ID"] = args.owner

    from ngertiin_engine import app_runtime, redaction
    from ngertiin_engine.app_connections import AppConnections
    from ngertiin_engine.contracts import uuid
    from ngertiin_engine.runtime import verify

    runtime = verify(Path(os.environ["HERMES_SOURCE"]))
    uuid(args.owner)
    redaction.install()
    app_runtime.install()
    from tools.mcp_tool import _servers
    from tools.mcp_tool_common import mcp_field
    from tools.mcp_tool_discovery import register_mcp_servers
    from tools.mcp_tool_lifecycle import shutdown_mcp_servers
    from tools.mcp_tool_schema import mcp_prefixed_tool_name
    from tools.mcp_tool_scope import _resolve_server_key
    from tools.registry import registry, session_tool_scope

    apps = AppConnections(args.home, args.owner)
    args.private_results.mkdir(parents=True, mode=0o700, exist_ok=True)
    args.private_results.chmod(0o700)
    args.evidence.parent.mkdir(parents=True, exist_ok=True)
    page_id = "404abdd618738161ad81d5857fa09cd1"
    report = {
        "timestamp": datetime.now(UTC).isoformat(),
        "runtime": runtime,
        "path": "product AppConnections.native_config -> native scoped MCP registry -> actual vendor",
        "model_used": False,
        "workspace_writes": 0,
        "denominator": 2,
        "cases": [],
    }
    for application, tool, arguments in [
        ("notion", "notion-fetch", {"id": page_id}),
        ("linear", "list_teams", {"limit": 1, "includeArchived": False}),
    ]:
        matches = [
            value
            for value in apps.items()
            if value["metadata"]["application"] == application
            and value["metadata"]["status"] == "connected"
        ]
        if len(matches) != 1:
            raise ValueError(
                "Expected exactly one connected " + application + " account"
            )
        metadata = matches[0]["metadata"]
        identity, generation = metadata["connection_id"], metadata["generation"]
        scope = "nma033-read-verification:" + uuid4().hex
        name = apps.token_name(identity, generation)
        journal = apps.vault.path(identity)
        before = journal.read_bytes()
        case = {
            "application": application,
            "tool": tool,
            "arguments": arguments,
            "passed": False,
        }
        started = time.monotonic()
        try:
            app_runtime.register_reference(
                name, {"connection_id": identity, "generation": generation}
            )
            config = apps.native_config(identity, generation, name)
            config["tools"] = {"include": [tool]}
            config["tool_timeout"] = 30
            with session_tool_scope(scope):
                names = register_mcp_servers({name: config})
                native_name = mcp_prefixed_tool_name(name, tool)
                if native_name not in names:
                    raise ValueError("Expected read tool was not discovered")
                server = _servers[_resolve_server_key(name)]
                offered = next(value for value in server._tools if value.name == tool)
                if (
                    mcp_field(offered.annotations, "read_only_hint", "readOnlyHint")
                    is not True
                ):
                    raise ValueError("Expected native read-only annotation")
                apps.check(identity, generation)
                envelope = decoded(registry.dispatch(native_name, arguments))
                raw = json.dumps(envelope, ensure_ascii=False).encode()
                destination = args.private_results / (application + ".json")
                destination.touch(mode=0o600, exist_ok=True)
                destination.chmod(0o600)
                destination.write_bytes(raw)
                case.update(
                    oracle(application, envelope, page_id),
                    passed=True,
                    result_sha256=hashlib.sha256(raw).hexdigest(),
                    result_bytes=len(raw),
                    protocol_version=mcp_field(
                        server.initialize_result, "protocol_version", "protocolVersion"
                    ),
                    tools_offered=len(server._tools),
                    tools_enabled=len(names),
                )
        except Exception as error:  # noqa: BLE001 - retain a bounded failure without credential data
            case["error_type"] = type(error).__name__
        finally:
            shutdown_mcp_servers(scope=scope)
            case["connection_journal_unchanged"] = before == journal.read_bytes()
            case["elapsed_seconds"] = round(time.monotonic() - started, 3)
            case["passed"] &= case["connection_journal_unchanged"]
            report["cases"].append(case)
            report["passed"] = sum(item["passed"] for item in report["cases"])
            args.evidence.write_text(json.dumps(report, indent=2) + "\n")
            print(json.dumps(case), flush=True)
    if report["passed"] != report["denominator"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
