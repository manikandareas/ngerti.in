"""Prevent provider failures, missing cells and duplicate batches becoming passes."""

import json
import subprocess

import pytest
from closure_results import aggregate
from receipt_review import provider_message
from test_baseline import corpus


def test_readonly_partial_corpus_keeps_denominator_and_prior_failure(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(
        subprocess, "Popen", lambda *a, **k: pytest.fail("Replay dispatched work")
    )
    protocol, rows = corpus()
    protocol_path = tmp_path / "protocol.json"
    protocol_path.write_text(json.dumps(protocol))
    import hashlib

    row = {
        **rows[0],
        "attempt_id": "failed-provider-attempt",
        "protocol_sha256": hashlib.sha256(protocol_path.read_bytes()).hexdigest(),
        "status": "failed",
        "category": "unknown",
    }
    batch = tmp_path / "attempts.jsonl"
    batch.write_text(json.dumps(row) + "\n")
    review = tmp_path / "review.json"
    review.write_text(
        json.dumps(
            {
                "records": [
                    {"attempt_id": row["attempt_id"], "provider_credit_failure": True}
                ]
            }
        )
    )
    derived, summary = aggregate([batch], protocol_path, [review])
    assert len(derived) == 99
    assert derived[0]["prior_score"]["category"] == "unknown"
    assert derived[0]["category"] == "provider"
    assert summary["surfaces"]["direct"]["executed"] == 1
    assert summary["surfaces"]["direct"]["passed"] == 0
    assert sum(r["status"] == "blocked" for r in derived) == 98
    with pytest.raises(ValueError, match="Duplicate attempt"):
        aggregate([batch, batch], protocol_path)
    batch.write_text(
        json.dumps(
            {**row, "status": "passed", "category": "none", "oracle_passed": True}
        )
        + "\n"
    )
    corrected, _ = aggregate([batch], protocol_path, [review])
    assert corrected[0]["status"] == "failed"
    assert corrected[0]["prior_score"]["status"] == "passed"


def test_provider_attribution_requires_explicit_provider_marker():
    assert provider_message(
        "Billing or credits exhausted: You have no credits remaining"
    )
    assert not provider_message("RUNTIME_FAILED")
    assert not provider_message("Tool timed out")
