"""Project verified peer receipts into native Kanban, without a dispatcher."""

from ngertiin_engine.contracts import digest


def project(adapter):
    store = adapter.store
    from hermes_cli import kanban_db as native
    from hermes_cli.kanban_db_connect import connect_closing

    rows = store.write(
        lambda db: db.execute(
            "SELECT DISTINCT thread_id FROM nma_collaboration_tasks WHERE owner_id=?",
            (store.owner,),
        ).fetchall()
    )
    for (thread_id,) in rows:
        tasks = store.write(
            lambda db, thread_id=thread_id: adapter.collaboration.listing(
                db, thread_id, limit=None
            )
        )
        board = "nma-peers-" + digest([store.owner, thread_id])[:24]
        if not native.board_dir(board).exists():
            native.create_board(board, name="Ngertiin group task receipts")
        with connect_closing(board=board) as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS nma_peer_projection (task_id TEXT PRIMARY KEY, history_count INTEGER NOT NULL)"
            )
            db.commit()
            mapping = {}
            # New dependencies can name only older tasks, so insertion order is
            # topological. Canonical card identities include archived receipts.
            for task in reversed(tasks):
                key = digest([store.owner, task["task_id"]])
                existing = db.execute(
                    "SELECT id FROM tasks WHERE idempotency_key=? ORDER BY created_at LIMIT 1",
                    (key,),
                ).fetchone()
                mapping[task["task_id"]] = (
                    existing[0]
                    if existing
                    else native.create_task(
                        db,
                        title="Ngertiin peer task " + task["task_id"],
                        body="Expected result is stored in the scoped product task receipt.",
                        assignee=task["implementer_agent_id"],
                        created_by="ngertiin-gateway",
                        tenant=store.owner,
                        idempotency_key=key,
                        initial_status="blocked",
                        parents=[mapping[p] for p in task["dependencies"]],
                        workspace_kind="scratch",
                        project_id="",
                        board=board,
                    )
                )
            for task in reversed(tasks):
                identity = mapping[task["task_id"]]
                saved = db.execute(
                    "SELECT history_count FROM nma_peer_projection WHERE task_id=?",
                    (task["task_id"],),
                ).fetchone()
                count = saved[0] if saved else 0
                for index, receipt in enumerate(task["history"][count:], count):
                    current = native.get_task(db, identity)
                    status = receipt["status"]
                    summary = "Verified product run " + receipt["run_id"]
                    if status in {"review", "completed"}:
                        if current.status == "blocked":
                            native.unblock_task(db, identity)
                            current = native.get_task(db, identity)
                        if status == "review" and current.status == "ready":
                            native.request_review(
                                db,
                                identity,
                                summary=summary,
                                reviewer=receipt.get(
                                    "reviewer_agent_id", task["reviewer_agent_id"]
                                ),
                            )
                        elif status == "completed" and current.status != "done":
                            native.complete_task(db, identity, result=summary)
                    elif status == "changes_requested":
                        if current.status == "review":
                            claimed = native.claim_review_task(
                                db, identity, claimer="ngertiin-review-receipt"
                            )
                            current = claimed or native.get_task(db, identity)
                        if current.status == "running":
                            native.request_changes(
                                db,
                                identity,
                                reason=summary,
                                expected_run_id=current.current_run_id,
                            )
                    elif status == "blocked" and current.status in {"ready", "running"}:
                        native.block_task(
                            db, identity, reason=summary, kind="needs_input"
                        )
                    elif status == "unblocked" and current.status == "blocked":
                        native.unblock_task(db, identity)
                    elif status == "cancelled" and current.status != "archived":
                        native.archive_task(db, identity)
                    native.add_comment(
                        db,
                        identity,
                        "ngertiin-gateway",
                        "Product task transition "
                        + str(index)
                        + ": "
                        + status
                        + "; "
                        + summary,
                    )
                    db.execute(
                        "INSERT INTO nma_peer_projection VALUES (?,?) ON CONFLICT(task_id) DO UPDATE SET history_count=excluded.history_count",
                        (task["task_id"], index + 1),
                    )
                    db.commit()
