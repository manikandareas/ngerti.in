"""Presentation of settled background work, independent of execution admission."""


def background(conn, owner, run_id):
    return (
        conn.execute(
            "SELECT 1 FROM nma_goal_units WHERE owner_id=? AND run_id=? AND parent_run_id IS NOT NULL UNION ALL SELECT 1 FROM nma_discussion_turns WHERE owner_id=? AND run_id=? UNION ALL SELECT 1 FROM nma_webhook_batches WHERE owner_id=? AND run_id=? UNION ALL SELECT 1 FROM nma_delegation_batches WHERE owner_id=? AND resume_run_id=? UNION ALL SELECT 1 FROM nma_collaboration_units WHERE owner_id=? AND run_id=?",
            (owner, run_id) * 5,
        ).fetchone()
        is not None
    )


def quiet(conn, owner, run_id, content):
    # Reuse the pinned gateway's exact-token rule. Quoted mentions of SILENT
    # remain ordinary content. Silence never cancels work or changes goal state.
    from gateway.response_filters import is_intentional_silence_response

    return background(conn, owner, run_id) and is_intentional_silence_response(content)


PROMPT = """Background delivery: perform the work and record goal progress normally.
When this internal turn has nothing useful to report, you may finish with exactly
[SILENT]. This suppresses the conversation notification only; it does not pause,
stop, complete or prevent execution. Use responsibility to record wait/next steps.
Report actual results and impediments normally. Never combine [SILENT] with prose.
"""
