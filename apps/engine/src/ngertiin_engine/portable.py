"""Scoped portable agent export and atomic, deduplicated import."""

import hashlib
import json
import re
from pathlib import Path

from ngertiin_engine.context import now
from ngertiin_engine.contracts import EngineError, canonical, digest, uuid
from ngertiin_engine.history import append_history, identity
from ngertiin_engine.portable_manifest import (
    SELECTIONS,
    VERSION,
    asset,
    decode,
    safe_path,
    validate,
)
from ngertiin_engine.redaction import result as redact


class Portable:
    def __init__(self, adapter):
        self.adapter, self.store = adapter, adapter.store

    def export(self, p):
        if set(p) != {"agent_id", "thread_id", *SELECTIONS}:
            raise EngineError("INVALID_REQUEST")
        for key in SELECTIONS:
            if (
                not isinstance(p[key], list)
                or len(p[key]) > 1000
                or len(set(map(str, p[key]))) != len(p[key])
            ):
                raise EngineError("INVALID_REQUEST")
            for value in p[key]:
                uuid(value)

        def read(conn):
            a = self.adapter.agents.get(conn, p["agent_id"])
            t = self.adapter.context.scope(conn, a["agent_id"], p["thread_id"])
            config = a["config"]
            bundle = {
                "format": VERSION,
                "source": {
                    "agent_id": a["agent_id"],
                    "config_revision": a["config_revision"],
                    "hermes_revision": json.loads(
                        Path(__file__).with_name("runtime-pin.json").read_text()
                    )["revision"],
                },
                "history": {"kind": t["kind"], "title": t["title"], "authors": {}},
                "agent": {
                    "display_name": a["display_name"],
                    "handle": a["handle"],
                    "soul": config["soul"],
                    "instructions": config["instructions"],
                    "model_reference": config["model"],
                    "session": config.get("session", {}),
                    "inference_reference": config.get("inference", {}),
                    "requirements": {
                        k: config.get(k, [])
                        for k in ("tool_grants", "mcp_grants", "skill_refs")
                    },
                },
                "messages": [],
                "memories": [],
                "skills": [],
                "artifacts": [],
            }
            rows = conn.execute(
                "SELECT message_id,author_kind,parts,created_at,author_agent_id FROM nma_messages WHERE owner_id=? AND thread_id=? ORDER BY message_seq",
                (self.store.owner, p["thread_id"]),
            ).fetchall()
            selected = set(p["message_ids"])
            for r in rows:
                if r[0] in selected:
                    bundle["messages"].append(
                        {
                            "id": r[0],
                            "author_kind": r[1],
                            "author_agent_id": r[4],
                            "text": json.loads(r[2])[0]["text"],
                            "created_at": r[3],
                        }
                    )
            for author_id in {
                m["author_agent_id"] for m in bundle["messages"] if m["author_agent_id"]
            }:
                bundle["history"]["authors"][author_id] = self.adapter.agents.get(
                    conn, author_id
                )["display_name"]
            if len(bundle["messages"]) != len(selected):
                raise EngineError("NOT_FOUND")
            for mid in p["memory_ids"]:
                m = self.adapter.context.memory(conn, mid)
                if m["status"] != "active" or not (
                    m["scope_kind"] == "agent_private"
                    and t["kind"] == "dm"
                    and m["agent_id"] == a["agent_id"]
                    or m["scope_kind"] == "thread_shared"
                    and m["thread_id"] == t["thread_id"]
                    and t["kind"] == "group"
                ):
                    raise EngineError("NOT_FOUND")
                bundle["memories"].append(
                    {"id": mid, "content": m["content"], "revision": m["revision"]}
                )
            from ngertiin_engine.skill_packages import Skills
            from ngertiin_engine.skill_packages import decode as skill_decode

            skills = {
                s["skill_id"]: s
                for s in Skills(self.store, self.adapter.context).listing(
                    conn, {"agent_id": a["agent_id"], "thread_id": p["thread_id"]}
                )
            }
            for sid in p["skill_ids"]:
                if sid not in skills:
                    raise EngineError("NOT_FOUND")
                s = skills[sid]
                bundle["skills"].append(
                    {
                        "id": sid,
                        "name": s["name"],
                        "revision": s["revision"],
                        "files": {
                            safe_path(path): {
                                **asset(skill_decode(item)),
                                "executable": bool(item.get("executable", False)),
                            }
                            for path, item in s["files"].items()
                        },
                    }
                )
            from ngertiin_engine.artifacts import Artifacts
            from ngertiin_engine.files import Files

            for fid in p["artifact_ids"]:
                f = Artifacts(self.store).get(conn, fid, thread_id=p["thread_id"])
                old = conn.execute(
                    "SELECT content FROM nma_artifacts WHERE owner_id=? AND artifact_id=?",
                    (self.store.owner, fid),
                ).fetchone()
                data = (
                    bytes(old[0])
                    if old
                    else Files(self.store).object_path(f["sha256"]).read_bytes()
                )
                if hashlib.sha256(data).hexdigest() != f["sha256"]:
                    raise EngineError("FILE_HASH_MISMATCH")
                bundle["artifacts"].append(
                    {
                        "id": fid,
                        "filename": f["filename"],
                        "media_type": f["media_type"],
                        "asset": asset(data),
                    }
                )
            # Strip credentials known to the runtime even when present in authored text.
            bundle = redact(bundle)
            return {
                "bundle": validate(bundle),
                "fingerprint": digest(bundle),
                "selection_counts": {
                    k: len(bundle[k])
                    for k in ("messages", "memories", "skills", "artifacts")
                },
            }

        return self.store.write(read)

    def preview(self, p):
        if set(p) != {"bundle", "handle", "model"}:
            raise EngineError("INVALID_REQUEST")
        bundle = validate(p["bundle"])
        handle = p["handle"]
        if not isinstance(handle, str) or not re.fullmatch(
            "[a-z][a-z0-9_-]{0,39}", handle
        ):
            raise EngineError("INVALID_REQUEST")
        models = self.adapter.connections.catalog()
        if not isinstance(p["model"], str) or p["model"] and p["model"] not in models:
            raise EngineError("MODEL_UNAVAILABLE")
        key = digest([bundle, handle])

        def read(conn):
            prior = conn.execute(
                "SELECT result FROM nma_commands WHERE owner_id=? AND json_extract(body,'$.type')='portable.import' AND json_extract(result,'$.import_key')=? LIMIT 1",
                (self.store.owner, key),
            ).fetchone()
            conflict = conn.execute(
                "SELECT agent_id FROM nma_agents WHERE owner_id=? AND handle=?",
                (self.store.owner, handle),
            ).fetchone()
            return {
                "import_key": key,
                "fingerprint": digest(bundle),
                "already_imported": bool(prior),
                "handle_conflict": bool(conflict and not prior),
                "requirements": bundle["agent"]["requirements"],
                "configuration_reference": bundle["agent"],
                "model_reference": bundle["agent"]["model_reference"],
                "selected_model": p["model"],
                "readiness": "configuration_review_required",
                "diagnostics": [
                    "Reconnect credential references and review tool grants before use.",
                    "Imported skills are archived until explicitly restored.",
                    "Historical goals, schedules and tool calls are not imported.",
                ],
                "counts": {
                    k: len(bundle[k])
                    for k in ("messages", "memories", "skills", "artifacts")
                },
                "source": bundle["source"],
            }

        return self.store.write(read)

    def import_bundle(self, body):
        if body["expected_revision"] is not None:
            raise EngineError("INVALID_REQUEST")
        p = body["payload"]
        preview = self.preview(p)
        bundle = p["bundle"]
        from ngertiin_engine.files import Files

        files = Files(self.store)
        # Validated content-addressed objects may precede the atomic DB commit.
        # A failed import cannot publish partial identities or ready-file rows.
        for f in bundle["artifacts"]:
            files.atomic(files.object_path(f["asset"]["sha256"]), decode(f["asset"]))

        def write(conn):
            prior = conn.execute(
                "SELECT payload_digest,result FROM nma_commands WHERE owner_id=? AND command_id=?",
                (self.store.owner, body["command_id"]),
            ).fetchone()
            if prior:
                if prior[0] != digest(body):
                    raise EngineError("COMMAND_CONFLICT")
                return json.loads(prior[1])
            prior = conn.execute(
                "SELECT result FROM nma_commands WHERE owner_id=? AND json_extract(body,'$.type')='portable.import' AND json_extract(result,'$.import_key')=? LIMIT 1",
                (self.store.owner, preview["import_key"]),
            ).fetchone()
            if prior:
                result = {**json.loads(prior[0]), "deduplicated": True}
            else:
                if conn.execute(
                    "SELECT 1 FROM nma_agents WHERE owner_id=? AND handle=?",
                    (self.store.owner, p["handle"]),
                ).fetchone():
                    raise EngineError("HANDLE_CONFLICT")
                a = bundle["agent"]
                config = {
                    "soul": a["soul"],
                    "instructions": a["instructions"],
                    "model": p["model"],
                    "session": a["session"],
                    "tool_grants": [],
                    "mcp_grants": [],
                    "skill_refs": [],
                }
                agent_id = identity(self.store.owner, "portable", preview["import_key"])
                agent = self.adapter.agents.apply(
                    conn,
                    {
                        "type": "agent.create",
                        "payload": {
                            "display_name": a["display_name"],
                            "handle": p["handle"],
                            "config": config,
                        },
                        "expected_revision": None,
                    },
                    identity=agent_id,
                )
                tid = agent["primary_dm_thread_id"]
                append_history(
                    conn,
                    self.store.owner,
                    tid,
                    [
                        {
                            "message_id": m["id"],
                            "author_kind": m["author_kind"],
                            "author_agent_id": agent_id
                            if m["author_kind"] == "agent"
                            else None,
                            "text": m["text"],
                            "created_at": m["created_at"],
                        }
                        for m in bundle["messages"]
                        if bundle["history"]["kind"] == "dm"
                    ],
                    preview["import_key"],
                )
                mapping = {
                    "agent": {bundle["source"]["agent_id"]: agent_id},
                    "messages": {},
                    "memories": {},
                    "skills": {},
                    "artifacts": {},
                }
                for m in (
                    bundle["messages"] if bundle["history"]["kind"] == "dm" else []
                ):
                    mapping["messages"][m["id"]] = identity(
                        self.store.owner, preview["import_key"], m["id"]
                    )
                for m in (
                    bundle["memories"] if bundle["history"]["kind"] == "dm" else []
                ):
                    mid = identity(self.store.owner, preview["import_key"], m["id"])
                    conn.execute(
                        "INSERT INTO nma_memory_entries(owner_id,memory_id,scope_kind,agent_id,content,source_message_ids,created_at,updated_at) VALUES (?,?,'agent_private',?,?, '[]',?,?)",
                        (self.store.owner, mid, agent_id, m["content"], now(), now()),
                    )
                    mapping["memories"][m["id"]] = mid
                from ngertiin_engine.skill_packages import Skills

                for s in bundle["skills"]:
                    saved = Skills(self.store, self.adapter.context).save(
                        conn,
                        {"agent_id": agent_id, "thread_id": tid},
                        s["name"],
                        {
                            path: {
                                "data": f["data_base64"],
                                "sha256": f["sha256"],
                                "executable": f.get("executable", False),
                            }
                            for path, f in s["files"].items()
                        },
                        {
                            "source": "portable_bundle",
                            "fingerprint": preview["fingerprint"],
                            "source_revision": s["revision"],
                        },
                        status="archived",
                    )
                    mapping["skills"][s["id"]] = saved["skill_id"]
                for f in bundle["artifacts"]:
                    fid = identity(self.store.owner, preview["import_key"], f["id"])
                    data = decode(f["asset"])
                    conn.execute(
                        "INSERT INTO nma_files VALUES (?,?,?,NULL,?,?,?,?,?,?,'ready')",
                        (
                            self.store.owner,
                            fid,
                            tid,
                            agent_id,
                            identity(fid, "revision"),
                            f["filename"],
                            f["media_type"],
                            f["asset"]["sha256"],
                            len(data),
                        ),
                    )
                    mapping["artifacts"][f["id"]] = fid
                if bundle["history"]["kind"] == "group" and (
                    bundle["messages"] or bundle["memories"]
                ):
                    archive = canonical(
                        {
                            "history": bundle["history"],
                            "messages": bundle["messages"],
                            "memories": bundle["memories"],
                            "inactive": True,
                        }
                    ).encode()
                    fid = identity(
                        self.store.owner, preview["import_key"], "group-history"
                    )
                    sha = hashlib.sha256(archive).hexdigest()
                    files.atomic(files.object_path(sha), archive)
                    conn.execute(
                        "INSERT INTO nma_files VALUES (?,?,?,NULL,?,?,?,?,?,?,'ready')",
                        (
                            self.store.owner,
                            fid,
                            tid,
                            agent_id,
                            identity(fid, "revision"),
                            "group-history.json",
                            "application/json",
                            sha,
                            len(archive),
                        ),
                    )
                    mapping["history_archive"] = fid
                result = {
                    **preview,
                    "agent": agent,
                    "thread_id": tid,
                    "revision_mapping": mapping,
                    "deduplicated": False,
                }
            conn.execute(
                "INSERT INTO nma_commands VALUES (?,?,?,?,?)",
                (
                    self.store.owner,
                    body["command_id"],
                    digest(body),
                    canonical(body),
                    canonical(result),
                ),
            )
            return result

        return self.store.write(write)
