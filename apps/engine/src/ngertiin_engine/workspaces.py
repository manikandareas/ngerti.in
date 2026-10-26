"""Authorized workspace projections and file delivery under the Hermes authority."""

import base64
import json
import mimetypes
import os
from pathlib import Path

from ngertiin_engine.contracts import EngineError, canonical, digest, uuid


class Workspaces:
    def __init__(self, adapter):
        self.adapter = adapter
        self.store = adapter.store

    def selected(self, payload):
        from ngertiin_engine.capabilities import FIELDS, resolve
        from ngertiin_engine.native_surface import binding

        thread_id, agent_id = (
            uuid(payload.get("thread_id")),
            uuid(payload.get("agent_id")),
        )

        def check(conn):
            thread = self.adapter.context.scope(conn, agent_id, thread_id)
            agent = self.adapter.agents.get(conn, agent_id)
            return thread, agent

        thread, agent = self.store.write(check)
        config = agent["config"]
        grants = {field: config.get(field, []) for field in FIELDS}
        resolved, _ = resolve(grants)
        if "nma_coding" not in resolved["toolsets"]:
            raise EngineError("CAPABILITY_DENIED")
        marker = {
            **resolved,
            "grants": grants,
            "agent_id": agent_id,
            "access_generation": agent["access_generation"],
        }
        context = {
            "thread_id": thread_id,
            "context_generation": thread["context_generation"],
        }
        _, broker, scope = binding(
            marker,
            context,
            Path(os.environ["HERMES_HOME"]) / "state.db",
            self.store.owner,
        )
        return broker, scope, marker

    def action(self, body):
        from ngertiin_engine.coding import SCHEMA

        payload = body["payload"]
        if body["expected_revision"] is not None or set(payload) != {
            "thread_id",
            "agent_id",
            "arguments",
        }:
            raise EngineError("INVALID_REQUEST")
        import jsonschema

        try:
            jsonschema.validate(payload["arguments"], SCHEMA["parameters"])
        except jsonschema.ValidationError:
            raise EngineError("INVALID_REQUEST") from None
        broker, scope, _ = self.selected(payload)
        if payload["arguments"]["action"] not in {"inspect", "diff", "diagnostics"}:
            busy = self.store.write(
                lambda conn: conn.execute(
                    "SELECT 1 FROM nma_adapter_runs r JOIN nma_adapter_bindings b USING(owner_id,binding_id) LEFT JOIN session_admissions a ON a.admission_id=r.native_admission_id WHERE r.owner_id=? AND json_extract(b.config,'$.thread_id')=? AND (a.status IS NULL OR a.status!='terminal') LIMIT 1",
                    (self.store.owner, payload["thread_id"]),
                ).fetchone()
            )
            if busy:
                raise EngineError("WORKSPACE_BUSY")
        result = broker.invoke(
            scope,
            body["command_id"],
            "coding",
            payload["arguments"],
            schema_hash=digest(SCHEMA),
            allowed_tools={"coding"},
            authorize=lambda: self.selected(payload),
        )
        value = json.loads(result) if isinstance(result, str) else result
        return value


def file_tool(store, stamp, args, ids):
    from ngertiin_engine.capabilities import resolve
    from ngertiin_engine.files import PART_BYTES, Files
    from ngertiin_engine.goals import Goals
    from ngertiin_engine.native_surface import binding
    from ngertiin_engine.reliability import Reliability

    def check(conn):
        run_id, config, _ = Goals(store).scope(conn, stamp)
        marker = config["nma_capabilities"]
        resolved, _ = resolve(marker["grants"])
        if (
            "nma_workspace" not in resolved["toolsets"]
            or resolved["snapshots"] != marker["snapshots"]
        ):
            raise EngineError("ACCESS_REVOKED")
        return run_id, config

    run_id, config = store.write(check)
    operation = digest([run_id, ids.turn_id, ids.tool_call_id, "workspace"])
    previous = store.write(
        lambda conn: conn.execute(
            "SELECT payload_digest,result FROM nma_workspace_operations WHERE owner_id=? AND operation_id=?",
            (store.owner, operation),
        ).fetchone()
    )
    if previous:
        if previous[0] != digest(args):
            raise EngineError("EFFECT_CONFLICT")
        return previous[1]
    marker = config["nma_capabilities"]
    _, broker, scope = binding(
        marker, config, Path(os.environ["HERMES_HOME"]) / "state.db", store.owner
    )
    files = Files(store)
    if args["action"] == "import_file" and set(args) == {"action", "artifact_id"}:
        item = store.write(
            lambda conn: files.get(
                conn, args["artifact_id"], thread_id=config["thread_id"]
            )
        )
        data = files.bytes(item)
        path = "imports/" + item["artifact_id"] + "/" + item["filename"]
        for offset in range(0, max(1, len(data)), PART_BYTES):
            broker.invoke(
                scope,
                operation + ":" + str(offset),
                "_nma_file",
                {
                    "path": path,
                    "offset": offset,
                    "byte_count": len(data),
                    "sha256": item["sha256"],
                    "data_base64": base64.b64encode(
                        data[offset : offset + PART_BYTES]
                    ).decode(),
                },
                schema_hash="nma.workspace.v1",
                allowed_tools={"_nma_file"},
                authorize=lambda: store.write(check),
            )
        result = {
            **item,
            "workspace_path": "/work/" + path,
            "next_step": "Use native read_file on workspace_path to extract supported documents.",
        }
    elif args["action"] == "publish_file" and set(args) == {
        "action",
        "path",
        "filename",
    }:
        from ngertiin_engine.files import filename

        filename(args["filename"])
        broker.ensure(scope)
        data = broker.file_bytes(scope, args["path"])

        def publish(conn):
            check(conn)
            item = files.publish(
                conn,
                operation,
                config,
                run_id,
                args["filename"],
                mimetypes.guess_type(args["filename"])[0] or "application/octet-stream",
                data,
            )
            Reliability(store).append(conn, run_id, config, "artifact.ready", item)
            encoded = canonical(item)
            conn.execute(
                "INSERT INTO nma_workspace_operations VALUES (?,?,?,?)",
                (store.owner, operation, digest(args), encoded),
            )
            return encoded

        return store.write(publish)
    else:
        raise EngineError("INVALID_REQUEST")
    encoded = canonical(result)

    def finish(conn):
        check(conn)
        conn.execute(
            "INSERT INTO nma_workspace_operations VALUES (?,?,?,?)",
            (store.owner, operation, digest(args), encoded),
        )

    store.write(finish)
    return encoded
