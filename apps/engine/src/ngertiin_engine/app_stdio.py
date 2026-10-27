"""Operator-pinned MCP processes, isolated from gateway files and model credentials."""

import json
import os
import re
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import EngineError, digest


def configuration(apps, value, scope_name="setup"):
    path = os.environ.get("NMA_APP_SERVERS_FILE")
    profiles = json.loads(Path(path).read_text()) if path else {}
    spec = profiles.get(value.get("stdio_profile"))
    if not isinstance(spec, dict):
        raise EngineError(
            "CAPABILITY_UNAVAILABLE", {"reason": "app_server_profile_required"}
        )
    if spec.get("application") != value["metadata"]["application"]:
        raise EngineError(
            "INVALID_CONFIGURATION", {"reason": "app_server_profile_mismatch"}
        )
    from ngertiin_engine.native_surface import verify_image

    image, command = spec.get("image"), spec.get("command")
    verify_image(image)
    if (
        not isinstance(command, list)
        or not command
        or any(not isinstance(v, str) or "\x00" in v for v in command)
    ):
        raise EngineError("INVALID_CONFIGURATION")
    network, env = "none", {}
    if spec.get("public_network") is True:
        from ngertiin_engine.browser_egress import ensure_network
        from ngertiin_engine.native_executor import IsolatedTools, Scope

        broker = IsolatedTools(
            apps.home / "app-execution" / value["metadata"]["connection_id"],
            apps.owner,
            image=image,
        )
        scope = Scope(
            apps.owner,
            value["metadata"]["connection_id"],
            str(uuid5(NAMESPACE_URL, scope_name)),
            value["metadata"]["generation"],
        )
        network = ensure_network(broker, scope)
        env.update(
            http_proxy="http://egress:8080",
            https_proxy="http://egress:8080",
            HTTP_PROXY="http://egress:8080",
            HTTPS_PROXY="http://egress:8080",
        )
    for key, reference in spec.get("credential_env", {}).items():
        if not re.fullmatch(r"[A-Z][A-Z0-9_]{0,100}", key) or reference not in {
            "api_key",
            "oauth_client_id",
            "oauth_client_secret",
        }:
            raise EngineError("INVALID_CONFIGURATION")
        if value.get(reference):
            env[key] = value[reference]
    return {
        "command": "docker",
        "args": [
            "run",
            "--rm",
            "-i",
            "--name",
            "nma-mcp-"
            + digest(
                [
                    apps.owner,
                    value["metadata"]["connection_id"],
                    value["metadata"]["generation"],
                    scope_name,
                ]
            )[:32],
            "--label",
            "nma-mcp.owner=" + apps.owner,
            "--label",
            "nma-mcp.connection=" + value["metadata"]["connection_id"],
            "--network",
            network,
            "--read-only",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--user",
            "10001:10001",
            "--pids-limit",
            "128",
            "--memory",
            "512m",
            "--tmpfs",
            "/tmp:rw,nosuid,nodev,size=128m,mode=1777",
            *[part for name in env for part in ("--env", name)],
            "--entrypoint",
            command[0],
            image,
            *command[1:],
        ],
        "env": env,
    }


def stop(apps, identity):
    from ngertiin_engine.native_executor import IsolatedTools

    found = IsolatedTools._docker(
        "ps",
        "-aq",
        "--filter",
        "label=nma-mcp.owner=" + apps.owner,
        "--filter",
        "label=nma-mcp.connection=" + identity,
        check=False,
        timeout=10,
    )
    if found.returncode:
        return False
    for container in found.stdout.split():
        if not re.fullmatch(r"[a-f0-9]{12,64}", container):
            raise EngineError("INVALID_CONFIGURATION")
        IsolatedTools._docker("rm", "--force", container)
    control = apps.home / "app-execution" / identity
    if (control / "isolated-tools.db").is_file():
        import sqlite3

        from ngertiin_engine.browser_egress import cleanup

        with sqlite3.connect(control / "isolated-tools.db") as db:
            image = db.execute(
                "SELECT value FROM metadata WHERE key='image'"
            ).fetchone()[0]
        cleanup(IsolatedTools(control, apps.owner, image=image))
    return True
