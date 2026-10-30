"""Real-gateway history and portable configuration safety, durability and isolation."""

# ruff: noqa: F811
import base64
import copy
import hashlib
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from test_direct_messages import send
from test_runtime import OWNER, command, runtime, settle  # noqa: F401
from test_threads import create_agent


def invoke(call, kind, payload, revision=None):
    body = command(kind, payload)
    body["expected_revision"] = revision
    result = call(body)
    assert "result" in result, result
    return result["result"]


def export(call, agent, **selection):
    return invoke(
        call,
        "portable.export",
        {
            "agent_id": agent["agent_id"],
            "thread_id": agent["primary_dm_thread_id"],
            "message_ids": [],
            "memory_ids": [],
            "skill_ids": [],
            "artifact_ids": [],
            **selection,
        },
    )["bundle"]


def test_history_search_rename_branch_and_usage(runtime):
    _, provider, call, start, *_ = runtime
    a = create_agent(call, "history-source")
    tid = a["primary_dm_thread_id"]
    thread = invoke(call, "thread.read", {"thread_id": tid})
    admission = call(send(thread, "SEARCH_100%_literal"))["result"]
    settle(call, admission["run_id"])
    found = invoke(
        call,
        "history.search",
        {"thread_id": tid, "query": "SEARCH_100%_literal", "after": None},
    )
    assert len(found["items"]) == 2
    assert (
        call(
            command(
                "history.search",
                {"thread_id": str(uuid4()), "query": "SEARCH", "after": None},
            )
        )["error"]["code"]
        == "NOT_FOUND"
    )
    renamed = invoke(
        call,
        "history.rename",
        {"thread_id": tid, "title": "Renamed history"},
        thread["revision"],
    )["thread"]
    assert renamed["title"] == "Renamed history"
    listing = invoke(call, "conversation.list", {"after": None})
    assert (
        next(t for t in listing["items"] if t["thread_id"] == tid)["title"]
        == "Renamed history"
    )
    assert (
        call(
            {
                **command("history.rename", {"thread_id": tid, "title": "stale"}),
                "expected_revision": thread["revision"],
            }
        )["error"]["code"]
        == "REVISION_CONFLICT"
    )
    body = {
        **command(
            "history.branch",
            {"thread_id": tid, "title": "Selected branch", "through_sequence": "2"},
        ),
        "expected_revision": renamed["revision"],
    }
    before = len(provider.requests)
    branch = call(body)["result"]
    assert call(body)["result"] == branch
    btid = branch["thread"]["thread_id"]
    snap = invoke(call, "thread.snapshot", {"thread_id": btid})
    assert len(snap["messages"]) == 2 and snap["runs"] == [] and snap["goals"] == []
    assert branch["inheritance"]["resources"] == []
    assert all(m["run_id"] is None for m in snap["messages"])
    assert len(provider.requests) == before
    assert invoke(call, "agent.list", {"after": None, "limit": 100})["items"][
        0
    ]  # full listing remains usable
    assert (
        invoke(call, "thread.ensure_dm", {"agent_id": a["agent_id"]})["thread"][
            "thread_id"
        ]
        == tid
    )
    usage = invoke(call, "history.usage", {"thread_id": tid, "after": None})
    assert usage["items"][0]["usage"]["total_tokens"] == 15
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert call(body)["result"] == branch


def test_portable_atomic_roundtrip_dedup_customization_and_restart(runtime):
    root, provider, call, start, *_ = runtime
    a = create_agent(call, "portable-source")
    tid = a["primary_dm_thread_id"]
    thread = invoke(call, "thread.read", {"thread_id": tid})
    settle(call, call(send(thread, "SELECTED_PORTABLE_HISTORY"))["result"]["run_id"])
    snap = invoke(call, "thread.snapshot", {"thread_id": tid})
    selected = [m["message_id"] for m in snap["messages"] if m["run_id"]]
    bundle = export(call, a, message_ids=selected)
    assert len(bundle["messages"]) == 2
    payload = {"bundle": bundle, "handle": "portable-copy", "model": "test"}
    preview = invoke(call, "portable.preview", payload)
    assert preview["counts"]["messages"] == 2 and not preview["handle_conflict"]
    before = len(provider.requests)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(lambda _: call(command("portable.import", payload)), range(2))
        )
    assert all("result" in r for r in results), results
    results = [r["result"] for r in results]
    assert len({r["agent"]["agent_id"] for r in results}) == 1
    imported = results[0]
    assert imported["agent"]["config"]["soul"] == a["config"]["soul"]
    assert imported["agent"]["agent_id"] != a["agent_id"]
    snap = invoke(call, "thread.snapshot", {"thread_id": imported["thread_id"]})
    assert len(snap["messages"]) == 3 and not snap["runs"] and not snap["goals"]
    assert len(provider.requests) == before
    assert all(
        m["author_agent_id"] in {None, imported["agent"]["agent_id"]}
        for m in snap["messages"]
    )
    agent = imported["agent"]
    invoke(
        call,
        "agent.configure",
        {
            "agent_id": agent["agent_id"],
            "display_name": "Customized copy",
            "handle": agent["handle"],
            "config": {**agent["config"], "soul": "CUSTOMIZED_AFTER_IMPORT"},
        },
        agent["revision"],
    )
    assert invoke(call, "portable.import", payload)["deduplicated"]
    current = next(
        a
        for a in invoke(call, "agent.list", {"after": None, "limit": 100})["items"]
        if a["agent_id"] == agent["agent_id"]
    )
    assert current["config"]["soul"] == "CUSTOMIZED_AFTER_IMPORT"
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert (
        invoke(call, "portable.import", payload)["agent"]["agent_id"]
        == agent["agent_id"]
    )
    with sqlite3.connect(root / "state/state.db") as db:
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
        assert (
            db.execute(
                "SELECT count(*) FROM nma_agents WHERE owner_id=? AND handle='portable-copy'",
                (OWNER,),
            ).fetchone()[0]
            == 1
        )


def test_portable_selected_binary_memory_skills_and_conflict_rollback(runtime):
    root, provider, call, *_ = runtime
    a = create_agent(call, "portable-assets")
    bundle = export(call, a)
    raw = b"Portable binary\x00\xff"
    skill = b"---\nname: imported-helper\ndescription: Test import\n---\nHistorical skill; do not run on import."
    fid, mid, sid = (str(uuid4()) for _ in range(3))

    def blob(data):
        return {
            "data_base64": base64.b64encode(data).decode(),
            "sha256": hashlib.sha256(data).hexdigest(),
        }

    bundle["artifacts"] = [
        {
            "id": fid,
            "filename": "output.bin",
            "media_type": "application/octet-stream",
            "asset": blob(raw),
        }
    ]
    bundle["memories"] = [
        {"id": mid, "content": "Selected private memory", "revision": "3"}
    ]
    bundle["skills"] = [
        {
            "id": sid,
            "name": "imported-helper",
            "revision": "4",
            "files": {"SKILL.md": blob(skill)},
        }
    ]
    payload = {"bundle": bundle, "handle": "portable-assets-copy", "model": ""}
    before = len(provider.requests)
    result = invoke(call, "portable.import", payload)
    assert len(provider.requests) == before
    assert result["agent"]["config"]["model"] == ""
    assert result["agent"]["config"]["tool_grants"] == []
    with sqlite3.connect(root / "state/state.db") as db:
        assert (
            db.execute(
                "SELECT status FROM nma_skill_entries WHERE skill_id=?",
                (result["revision_mapping"]["skills"][sid],),
            ).fetchone()[0]
            == "archived"
        )
        assert db.execute(
            "SELECT agent_id,content FROM nma_memory_entries WHERE memory_id=?",
            (result["revision_mapping"]["memories"][mid],),
        ).fetchone() == (result["agent"]["agent_id"], "Selected private memory")
    assert (
        root
        / "state/files/objects"
        / hashlib.sha256(raw).hexdigest()[:2]
        / hashlib.sha256(raw).hexdigest()
    ).read_bytes() == raw
    duplicate = {**payload, "handle": a["handle"]}
    assert (
        call(command("portable.import", duplicate))["error"]["code"]
        == "HANDLE_CONFLICT"
    )
    assert not invoke(call, "portable.preview", duplicate)["already_imported"]
    # Unselected history, memory and files are absent from a default template.
    empty = export(call, a)
    assert all(empty[k] == [] for k in ("messages", "memories", "skills", "artifacts"))


@pytest.mark.parametrize(
    "mutation,code",
    [
        (lambda b: b.update(format="future.version"), "UNSUPPORTED_VERSION"),
        (lambda b: b["agent"].update(api_key="secret"), "INVALID_BUNDLE"),
        (lambda b: b["source"].update(owner_id=str(uuid4())), "INVALID_BUNDLE"),
        (
            lambda b: b["artifacts"].append(
                {
                    "id": str(uuid4()),
                    "filename": "../escape",
                    "media_type": "text/plain",
                    "asset": {
                        "data_base64": "",
                        "sha256": hashlib.sha256(b"").hexdigest(),
                    },
                }
            ),
            "INVALID_REQUEST",
        ),
        (
            lambda b: b["artifacts"].append(
                {
                    "id": str(uuid4()),
                    "filename": ".env",
                    "media_type": "text/plain",
                    "asset": {
                        "data_base64": "",
                        "sha256": hashlib.sha256(b"").hexdigest(),
                    },
                }
            ),
            "INVALID_BUNDLE_PATH",
        ),
    ],
)
def test_malformed_bundle_refused_without_identities(runtime, mutation, code):
    _, _, call, *_ = runtime
    agents = invoke(call, "agent.list", {"after": None, "limit": 100})["items"]
    a = next(a for a in agents if a["handle"] == "portable-source")
    bundle = copy.deepcopy(export(call, a))
    mutation(bundle)
    assert (
        call(
            command(
                "portable.import",
                {"bundle": bundle, "handle": "must-not-exist", "model": "test"},
            )
        )["error"]["code"]
        == code
    )
    assert len(
        invoke(call, "agent.list", {"after": None, "limit": 100})["items"]
    ) == len(agents)


def test_cross_owner_import_has_target_identities_and_no_source_access(runtime):
    import test_runtime

    _, _, call, *_ = runtime
    source = create_agent(call, "cross-owner-source")
    bundle = export(call, source)
    original = test_runtime.OWNER
    test_runtime.OWNER = str(uuid4())
    fixture = test_runtime.runtime.__wrapped__(None)
    other = next(fixture)
    try:
        target_call = other[2]
        target = invoke(
            target_call,
            "portable.import",
            {"bundle": bundle, "handle": "cross-owner-copy", "model": "test"},
        )
        assert target["agent"]["agent_id"] != source["agent_id"]
        assert (
            call(command("thread.read", {"thread_id": target["thread_id"]}))["error"][
                "code"
            ]
            == "NOT_FOUND"
        )
        assert (
            target_call(
                command("thread.read", {"thread_id": source["primary_dm_thread_id"]})
            )["error"]["code"]
            == "NOT_FOUND"
        )
        assert (
            target_call(
                command(
                    "portable.export",
                    {
                        "agent_id": source["agent_id"],
                        "thread_id": source["primary_dm_thread_id"],
                        "message_ids": [],
                        "memory_ids": [],
                        "skill_ids": [],
                        "artifact_ids": [],
                    },
                )
            )["error"]["code"]
            == "NOT_FOUND"
        )
        assert invoke(
            target_call,
            "portable.import",
            {"bundle": bundle, "handle": "cross-owner-copy", "model": "test"},
        )["deduplicated"]
    finally:
        test_runtime.OWNER = original
        try:
            next(fixture)
        except StopIteration:
            pass


def test_bundle_hash_conflict_partial_failure_and_default_secret_exclusion(runtime):
    _, _, call, *_ = runtime
    a = create_agent(call, "rollback-source")
    bundle = export(call, a)
    assert "runtime_model" not in str(bundle) and "api_key" not in str(bundle)
    blob = {"data_base64": "eA==", "sha256": "0" * 64}
    broken = copy.deepcopy(bundle)
    broken["artifacts"] = [
        {
            "id": str(uuid4()),
            "filename": "bad.txt",
            "media_type": "text/plain",
            "asset": blob,
        }
    ]
    assert (
        call(
            command(
                "portable.import",
                {"bundle": broken, "handle": "bad-copy", "model": "test"},
            )
        )["error"]["code"]
        == "FILE_HASH_MISMATCH"
    )
    # A late configuration refusal rolls the entire writer transaction back.
    broken = copy.deepcopy(bundle)
    broken["agent"]["session"]["max_turns"] = -1
    assert (
        call(
            command(
                "portable.import",
                {"bundle": broken, "handle": "bad-copy", "model": "test"},
            )
        )["error"]["code"]
        == "INVALID_CONFIGURATION"
    )
    assert not any(
        a["handle"] == "bad-copy"
        for a in invoke(call, "agent.list", {"after": None, "limit": 100})["items"]
    )
    result = invoke(
        call,
        "portable.import",
        {"bundle": bundle, "handle": "repaired-copy", "model": "test"},
    )
    body = command(
        "portable.import", {"bundle": bundle, "handle": "same-command", "model": "test"}
    )
    assert "result" in call(body)
    body["payload"]["handle"] = "changed-request"
    assert call(body)["error"]["code"] == "COMMAND_CONFLICT"
    assert result["readiness"] == "configuration_review_required"
    assert invoke(call, "agent.presets", {})["items"][1]["id"] == "concise"


def test_retry_only_before_effects_and_deduplicated_across_tabs(runtime):
    _, _, call, *_ = runtime
    a = create_agent(call, "retry-safe")
    thread = invoke(call, "thread.read", {"thread_id": a["primary_dm_thread_id"]})
    failed = call(send(thread, "FAIL_PROVIDER"))["result"]
    settle(call, failed["run_id"], "failed")
    with ThreadPoolExecutor(max_workers=2) as pool:
        values = list(
            pool.map(
                lambda _: call(command("history.retry", {"run_id": failed["run_id"]})),
                range(2),
            )
        )
    assert all("result" in v for v in values), values
    assert len({v["result"]["run_id"] for v in values}) == 1
    assert values[0]["result"]["run_id"] != failed["run_id"]
    settle(call, values[0]["result"]["run_id"], "failed")
    good = call(send(thread, "SUCCESS_NO_RETRY"))["result"]
    settle(call, good["run_id"])
    assert (
        call(command("history.retry", {"run_id": good["run_id"]}))["error"]["code"]
        == "RETRY_UNSAFE"
    )


def test_group_history_is_attributed_archive_without_private_memory_or_new_work(
    runtime,
):
    import json

    from ngertiin_engine.contracts import canonical

    root, provider, call, *_ = runtime
    a = create_agent(call, "portable-group-a")
    b = create_agent(call, "portable-group-b")
    group = invoke(
        call,
        "thread.create",
        {
            "kind": "group",
            "title": "Historical group",
            "agent_ids": [a["agent_id"], b["agent_id"]],
        },
    )["thread"]
    mid, mem, private = (str(uuid4()) for _ in range(3))
    with sqlite3.connect(root / "state/state.db") as db:
        db.execute(
            "INSERT INTO nma_messages(owner_id,message_id,thread_id,message_seq,author_kind,author_agent_id,parts,context_generation,created_at) VALUES (?,?,?,1,'agent',?,?,1,CURRENT_TIMESTAMP)",
            (
                OWNER,
                mid,
                group["thread_id"],
                b["agent_id"],
                canonical([{"type": "text", "text": "Historical group answer"}]),
            ),
        )
        db.execute(
            "UPDATE nma_threads SET next_message_seq=2 WHERE owner_id=? AND thread_id=?",
            (OWNER, group["thread_id"]),
        )
        db.execute(
            "INSERT INTO nma_memory_entries(owner_id,memory_id,scope_kind,thread_id,content,source_message_ids,created_at,updated_at) VALUES (?,?,'thread_shared',?,'Selected group memory','[]',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
            (OWNER, mem, group["thread_id"]),
        )
        db.execute(
            "INSERT INTO nma_memory_entries(owner_id,memory_id,scope_kind,agent_id,content,source_message_ids,created_at,updated_at) VALUES (?,?,'agent_private',?,'PRIVATE_DO_NOT_EXPORT','[]',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
            (OWNER, private, a["agent_id"]),
        )
    payload = {
        "agent_id": a["agent_id"],
        "thread_id": group["thread_id"],
        "message_ids": [mid],
        "memory_ids": [mem],
        "skill_ids": [],
        "artifact_ids": [],
    }
    bundle = invoke(call, "portable.export", payload)["bundle"]
    assert bundle["history"]["kind"] == "group"
    assert bundle["history"]["authors"][b["agent_id"]] == b["display_name"]
    assert "PRIVATE_DO_NOT_EXPORT" not in str(bundle)
    assert (
        call(command("portable.export", {**payload, "memory_ids": [private]}))["error"][
            "code"
        ]
        == "NOT_FOUND"
    )
    before = len(provider.requests)
    result = invoke(
        call,
        "portable.import",
        {"bundle": bundle, "handle": "portable-group-copy", "model": "test"},
    )
    assert len(provider.requests) == before
    snap = invoke(call, "thread.snapshot", {"thread_id": result["thread_id"]})
    assert len(snap["messages"]) == 1 and not snap["runs"] and not snap["goals"]
    fid = result["revision_mapping"]["history_archive"]
    f = next(f for f in snap["artifacts"] if f["artifact_id"] == fid)
    content = json.loads(
        (root / "state/files/objects" / f["sha256"][:2] / f["sha256"]).read_bytes()
    )
    assert (
        content["inactive"]
        and content["messages"][0]["author_agent_id"] == b["agent_id"]
    )
    assert content["memories"][0]["content"] == "Selected group memory"
    with sqlite3.connect(root / "state/state.db") as db:
        assert (
            db.execute(
                "SELECT count(*) FROM nma_memory_entries WHERE agent_id=?",
                (result["agent"]["agent_id"],),
            ).fetchone()[0]
            == 0
        )


def test_failed_run_with_confirmed_or_unknown_effect_cannot_retry(runtime):
    root, _, call, *_ = runtime
    a = create_agent(call, "retry-effects")
    thread = invoke(call, "thread.read", {"thread_id": a["primary_dm_thread_id"]})
    failed = call(send(thread, "FAIL_PROVIDER"))["result"]
    settle(call, failed["run_id"], "failed")
    op = str(uuid4())
    for state in ("dispatching", "confirmed"):
        with sqlite3.connect(root / "state/state.db") as db:
            db.execute(
                "INSERT OR REPLACE INTO nma_effects VALUES (?,?,?,?,?,NULL)",
                (OWNER, failed["run_id"], op, "test-intent", state),
            )
        assert (
            call(command("history.retry", {"run_id": failed["run_id"]}))["error"][
                "code"
            ]
            == "RETRY_UNSAFE"
        )


def test_failed_run_with_legacy_tool_progress_cannot_retry(runtime):
    import json

    root, _, call, *_ = runtime
    a = create_agent(call, "retry-legacy-progress")
    thread = invoke(call, "thread.read", {"thread_id": a["primary_dm_thread_id"]})
    failed = call(send(thread, "FAIL_PROVIDER"))["result"]
    settle(call, failed["run_id"], "failed")
    with sqlite3.connect(root / "state/state.db") as db:
        assert (
            db.execute(
                "SELECT count(*) FROM nma_effects WHERE run_id=?", (failed["run_id"],)
            ).fetchone()[0]
            == 0
        )
        sequence = db.execute("SELECT MAX(sequence)+1 FROM nma_events").fetchone()[0]
        db.execute(
            "INSERT INTO nma_events VALUES (?,?,?,?)",
            (
                OWNER,
                sequence,
                str(uuid4()),
                json.dumps(
                    {
                        "type": "tool.started",
                        "run_id": failed["run_id"],
                        "payload": {"tool_name": "workspace"},
                    }
                ),
            ),
        )
        db.execute(
            "INSERT INTO nma_run_events VALUES (?,?,?)",
            (OWNER, sequence, failed["run_id"]),
        )
    assert (
        call(command("history.retry", {"run_id": failed["run_id"]}))["error"]["code"]
        == "RETRY_UNSAFE"
    )
