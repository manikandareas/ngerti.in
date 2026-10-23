"""Reproduce native session-goal and Kanban gaps with real disposable SQLite."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--phase", choices=["write", "read"])
    args = parser.parse_args()
    if not args.phase:
        args.output.mkdir(parents=True, exist_ok=False)
        for phase in ("write", "read"):
            subprocess.run(
                [
                    sys.executable,
                    __file__,
                    "--source",
                    str(args.source),
                    "--output",
                    str(args.output),
                    "--phase",
                    phase,
                ],
                check=True,
            )
        return
    sys.path.insert(0, str(args.source.resolve()))
    os.environ["HERMES_HOME"] = str(args.output.resolve() / "home")
    os.environ["HERMES_KANBAN_DB"] = str(args.output.resolve() / "board.db")
    from hermes_cli import kanban_db as kb
    from hermes_cli.goals import GoalManager, load_goal, migrate_goal_to_session

    kb.init_db()
    conn = sqlite3.connect(os.environ["HERMES_KANBAN_DB"], isolation_level=None)
    conn.row_factory = sqlite3.Row
    evidence = {"phase": args.phase, "pid": os.getpid(), "checks": {}}
    checks = evidence["checks"]
    if args.phase == "write":
        manager = GoalManager("session-a")
        manager.set("Prepare the fuel report")
        manager.set("Prepare the onboarding guide")
        checks["second_goal_replaces_first"] = (
            load_goal("session-a").goal == "Prepare the onboarding guide"
        )
        checks["new_session_does_not_inherit"] = load_goal("session-b") is None
        checks["explicit_migration"] = migrate_goal_to_session("session-a", "session-b")
        checks["old_session_cleared"] = load_goal("session-a").status == "cleared"
        GoalManager("session-b").pause("user-stop")
        parent = kb.create_task(
            conn,
            title="Stopped responsibility",
            assignee="researcher",
            idempotency_key="message-1",
        )
        checks["delivery_dedup_before_archive"] = (
            kb.create_task(
                conn,
                title="Repeated delivery",
                assignee="researcher",
                idempotency_key="message-1",
            )
            == parent
        )
        child = kb.create_task(
            conn, title="Dependent work", assignee="researcher", parents=[parent]
        )
        checks["child_initially_waits"] = kb.get_task(conn, child).status == "todo"
        kb.archive_task(conn, parent)
        checks["archive_releases_child"] = kb.get_task(conn, child).status == "ready"
        replay = kb.create_task(
            conn,
            title="Repeated delivery",
            assignee="researcher",
            idempotency_key="message-1",
        )
        checks["delivery_replay_after_archive_creates_new_task"] = replay != parent
        evidence["task_ids"] = {"parent": parent, "child": child, "replay": replay}
    else:
        checks["paused_survives_process_restart"] = (
            load_goal("session-b").status == "paused"
        )
        checks["paused_has_no_continuation"] = (
            GoalManager("session-b").next_continuation_prompt() is None
        )
        checks["fresh_session_still_empty"] = load_goal("session-c") is None
        previous = json.loads((args.output / "write.json").read_text())
        checks["archived_survives_restart"] = (
            kb.get_task(conn, previous["task_ids"]["parent"]).status == "archived"
        )
        checks["released_child_still_ready"] = (
            kb.get_task(conn, previous["task_ids"]["child"]).status == "ready"
        )
    checks["sqlite_integrity"] = (
        conn.execute("PRAGMA quick_check").fetchone()[0] == "ok"
    )
    (args.output / f"{args.phase}.json").write_text(
        json.dumps(evidence, indent=2) + "\n"
    )
    print(json.dumps(evidence))
    conn.close()
    assert all(checks.values()), evidence


if __name__ == "__main__":
    main()
