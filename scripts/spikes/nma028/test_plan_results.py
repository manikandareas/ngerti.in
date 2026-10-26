"""Read-only score corrections must retain the sequential tool-work requirement."""

import json

from plan_results import review_labels, review_native_offline


def case(initial_completed=False, same_call=False):
    def event(identity, completed):
        return {
            "role": "tool",
            "tool_name": "todo_list",
            "tool_call_id": identity,
            "content": json.dumps(
                {
                    "todos": [
                        {
                            "content": name,
                            "status": "completed" if completed else "pending",
                        }
                        for name in ("Inspect ledger", "Verify total")
                    ],
                    "summary": {"completed": 2 if completed else 0},
                }
            ),
        }

    return {
        "scenario": "multi_step_tools",
        "category": "oracle",
        "status": "failed",
        "oracle_passed": False,
        "result": {"text": "NMA028_TOOLS_DONE"},
        "native_tools": [
            event("call-1", initial_completed),
            event("call-1" if same_call else "call-2", True),
        ],
    }


def test_title_case_labels_follow_the_written_oracle_without_mutating_evidence():
    raw = case()
    before = json.dumps(raw)
    corrected = review_labels(raw)
    assert corrected["oracle_passed"]
    assert corrected["score_review"]["raw_score"]["status"] == "failed"
    assert json.dumps(raw) == before


def test_upfront_completion_or_repeated_call_identity_cannot_become_a_pass():
    for raw in (case(initial_completed=True), case(same_call=True)):
        assert review_labels(raw) is raw
        assert not raw["oracle_passed"]


def test_native_offline_uses_response_and_canonical_completion_not_prompt_echo():
    raw = {
        "surface": "direct",
        "scenario": "offline_goal",
        "repeat": 1,
        "status": "failed",
        "category": "oracle",
        "oracle_passed": False,
        "final_job": {
            "last_status": "ok",
            "last_error": None,
            "repeat": {"completed": 1},
            "canonical_completions": ["admission-1"],
        },
        "native_admissions": [{"status": "terminal"}],
        "output": [{"text": "## Prompt\nNMA028_OFFLINE_1_238\n## Response\n\n238"}],
    }
    assert review_native_offline(raw) is raw
    raw["output"][0]["text"] += " NMA028_OFFLINE_1_238"
    assert review_native_offline(raw)["oracle_passed"]
    raw["final_job"]["last_status"] = "error"
    assert review_native_offline(raw) is raw
    raw["final_job"]["last_status"] = "ok"
    raw["native_admissions"].append({"status": "terminal"})
    assert review_native_offline(raw) is raw
