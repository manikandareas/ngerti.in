"""Pair explicit persistent product roles with the native role-configured group.

This is a separate cohort. Original generic-agent outcomes remain unchanged.
"""

import hashlib
import json
import sqlite3

import complete_baseline
from plan_baseline import main
from plan_group_supplement import ValidMentionProduct

OriginalRunCase = complete_baseline.run_case


class RoleBoundProduct(ValidMentionProduct):
    def create(self, group=False):
        conversation = super().create(group=group)
        if not group:
            raise ValueError("The role-bound cohort contains only group tasks")
        handles = [a["handle"] for a in conversation["agents"]]
        instructions = [
            f"You are Researcher. Calculate the supplied facts and hand off to @{handles[1]} in your final reply. Writer alone publishes the report; do not publish it yourself. Keep prose concise.",
            f"You are Writer. Use the communicated facts and calculation. Verify the computation and publish report.md with the workspace tool, including both source facts and the calculated litres per 100 km. Include the actual artifact ID in your final reply and hand off to @{handles[2]}. Do not replace the research or review roles.",
            "You are Reviewer. Read the published report using workspace read with its actual artifact ID. Independently verify the arithmetic. State the verified numerical result in your own final reply; do not answer pass when an artifact is requested for review. Do not mention another agent after finishing.",
        ]
        for index, agent in enumerate(conversation["agents"]):
            config = {**agent["config"], "instructions": instructions[index]}
            body = self.command(
                "agent.configure",
                {
                    "agent_id": agent["agent_id"],
                    "display_name": agent["display_name"],
                    "handle": agent["handle"],
                    "config": config,
                },
            )
            body["expected_revision"] = agent["revision"]
            conversation["agents"][index] = self.invoke(body)["agent"]
        return conversation


def role_case(driver, case, repeat):
    from baseline import native_tools

    row = OriginalRunCase(driver, case, repeat)
    if "final" not in row or "artifact" not in row:
        return row
    agents = row["final"]["thread"]["agents"]
    writer = next(a for a in agents if a["handle"].startswith("writer-"))
    reviewer = next(a for a in agents if a["handle"].startswith("reviewer-"))
    artifact = row["artifact"]
    database = driver.root / "state/state.db"
    with sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True) as db:
        sessions = [
            r[0]
            for r in db.execute(
                "SELECT native_session_id FROM nma_adapter_bindings WHERE json_extract(config,'$.thread_id')=? AND json_extract(config,'$.agent_id')=?",
                (row["scope"]["thread_id"], reviewer["agent_id"]),
            )
        ]
    reads = []
    for session in sessions:
        for event in native_tools(database, session):
            if event.get("role") != "tool" or event.get("tool_name") != "workspace":
                continue
            result = json.loads(event["content"])
            if (
                result.get("artifact_id") == artifact["artifact_id"]
                and "content" in result
            ):
                content = result["content"]
                reads.append(
                    {
                        "native_session_id": session,
                        "native_tool_call_id": event["tool_call_id"],
                        "result": result,
                        "content_sha256": hashlib.sha256(content.encode()).hexdigest(),
                    }
                )
    proof = {
        "writer_id": writer["agent_id"],
        "reviewer_id": reviewer["agent_id"],
        "writer_produced_artifact": artifact["producing_agent_id"]
        == writer["agent_id"],
        "reviewer_reads": reads,
        "canonical_read_bytes_match": any(
            r["content_sha256"] == artifact["sha256"] for r in reads
        ),
    }
    row["role_proof"] = proof
    if row["oracle_passed"] and not (
        proof["writer_produced_artifact"] and proof["canonical_read_bytes_match"]
    ):
        row["prior_score"] = {
            k: row[k] for k in ("status", "category", "oracle_passed")
        }
        row.update(status="failed", category="oracle", oracle_passed=False)
    return row


if __name__ == "__main__":
    complete_baseline.Product = RoleBoundProduct
    complete_baseline.run_case = role_case
    main()
