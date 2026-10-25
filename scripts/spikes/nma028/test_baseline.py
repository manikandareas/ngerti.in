"""Guard the evidence boundary: missing/blocked data and claims cannot become passes."""

import copy
import hashlib
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
from baseline import finish_runtime, redact
from results import oracle, rescore, summarize, validate


def corpus():
    protocol = json.loads(Path(__file__).with_name("protocol.json").read_text())
    digest = hashlib.sha256(
        Path(__file__).with_name("protocol.json").read_bytes()
    ).hexdigest()
    rows = [
        {
            "surface": s,
            "scenario": c["id"],
            "repeat": r,
            "protocol_sha256": digest,
            "status": "blocked",
            "category": "prerequisite",
            "oracle_passed": False,
            "timings_s": {},
        }
        for s in protocol["surfaces"]
        for c in protocol["scenarios"]
        for r in range(1, 4)
    ]
    return protocol, rows


def test_manual_yield_fixture_teardown_is_exhausted():
    stopped = []

    def fixture():
        yield "running"
        stopped.append(True)

    value = fixture()
    assert next(value) == "running"
    finish_runtime(value)
    assert stopped == [True]


def test_blocked_cells_remain_denominator_and_latencies_are_unavailable():
    protocol, rows = corpus()
    summary = summarize(rows, protocol)
    for surface in summary["surfaces"].values():
        assert (
            surface["planned"] == 33
            and surface["passed"] == 0
            and surface["executed"] == 0
        )
        assert surface["success_per_executed"] is None
        assert surface["timings_s"]["first_progress"] == {
            "n": 0,
            "p50": None,
            "p95": None,
        }


def test_missing_duplicate_and_mixed_protocols_are_rejected():
    protocol, rows = corpus()
    for changed in (rows[:-1], rows + [rows[0]]):
        with pytest.raises(ValueError):
            summarize(changed, protocol)
    mixed = copy.deepcopy(rows)
    mixed[0]["protocol_sha256"] = "other"
    with pytest.raises(ValueError):
        summarize(mixed, protocol)
    with pytest.raises(ValueError):
        summarize(rows, protocol, protocol_sha256="different-file")


def test_no_unverified_or_invalid_timing_pass():
    with pytest.raises(ValueError):
        validate({"status": "passed", "category": "none", "oracle_passed": False})
    for value in (-1, float("inf"), float("nan")):
        with pytest.raises(ValueError):
            validate(
                {
                    "status": "failed",
                    "category": "unknown",
                    "timings_s": {"settlement": value},
                }
            )


def test_tool_final_text_cannot_substitute_for_tool_results():
    assert not oracle("multi_step_tools", "NMA028_TOOLS_DONE", [])
    todos = [
        {"content": "inspect ledger", "status": "pending"},
        {"content": "verify total", "status": "pending"},
    ]
    trace = [
        {
            "role": "tool",
            "tool_name": "todo_list",
            "tool_call_id": "first",
            "content": json.dumps({"todos": todos, "summary": {"completed": 0}}),
        },
        {
            "role": "tool",
            "tool_name": "todo_list",
            "tool_call_id": "second",
            "content": json.dumps(
                {
                    "todos": [{**t, "status": "completed"} for t in todos],
                    "summary": {"completed": 2},
                }
            ),
        },
    ]
    assert oracle("multi_step_tools", "NMA028_TOOLS_DONE", trace)
    row = {
        "scenario": "multi_step_tools",
        "native_tools": trace,
        "final": "NMA028_TOOLS_DONE",
        "status": "failed",
        "category": "oracle",
        "oracle_passed": False,
    }
    assert rescore(row)["status"] == "passed" and row["status"] == "failed"


def test_trace_redaction_and_read_only_replay(tmp_path, monkeypatch):
    assert redact(
        {"nested": ["Bearer synthetic-secret-value"]}, ["synthetic-secret-value"]
    ) == {"nested": ["Bearer [REDACTED]"]}
    import subprocess

    monkeypatch.setattr(
        subprocess, "Popen", lambda *a, **k: pytest.fail("Replay tried to execute work")
    )
    protocol, rows = corpus()
    assert summarize(rows, protocol)["surfaces"]["direct"]["planned"] == 33


def test_complete_operation_and_skill_registry():
    path = (
        Path(__file__).resolve().parents[3]
        / "docs/research/evidence/nma-028/capability-manifest.json"
    )
    manifest = json.loads(path.read_text())
    assert len(manifest["families"]) == 106
    assert len({row["id"] for row in manifest["families"]}) == 106
    assert all(
        row["operations"] and row["source_urls"] and row["owner_url"]
        for row in manifest["families"]
    )
    proposed = [
        row
        for row in manifest["families"]
        if row["disposition"] == "Proposed exclusion"
    ]
    assert len(proposed) == 8 and all(row["decision_owner"] for row in proposed)
    assert len([s for s in manifest["skills"] if s["family"] == "S07"]) == 58
    assert len([s for s in manifest["skills"] if s["family"] == "S08"]) == 152
