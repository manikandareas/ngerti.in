"""Disposable real-model capture experiment backed by pinned Hermes Kanban APIs.

The capture prompt and adapter are Ngertiin-authored, not upstream Hermes behavior.
Each turn runs in a fresh process. No dispatcher or external work is started.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def save(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def snapshot(kb, conn):
    return [
        {
            key: getattr(task, key)
            for key in ("id", "title", "body", "status", "session_id")
        }
        for task in kb.list_tasks(conn, include_archived=True)
    ]


def turn(args):
    sys.path.insert(0, str(args.source.resolve()))
    os.environ["HERMES_HOME"] = str(args.output.resolve() / "home")
    os.environ["HERMES_KANBAN_DB"] = str(args.output.resolve() / "board.db")
    from dotenv import dotenv_values
    from hermes_cli import kanban_db as kb
    from openai import OpenAI

    kb.init_db()
    conn = sqlite3.connect(os.environ["HERMES_KANBAN_DB"], isolation_level=None)
    conn.row_factory = sqlite3.Row
    data = json.loads((args.output / "input.json").read_text())
    before = snapshot(kb, conn)
    credentials = dotenv_values(args.env_file)
    client = OpenAI(
        api_key=credentials["OPENAI_API_KEY"],
        base_url=credentials.get("OPENAI_BASE_URL") or "https://api.openai.com/v1",
        timeout=90,
        max_retries=0,
    )
    model = credentials["OPENAI_MODEL"]
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": (HERE / "prompt.md").read_text()},
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "stored_responsibilities": before,
                        "conversation": data["history"],
                        "message": data["case"]["text"],
                    },
                    ensure_ascii=False,
                ),
            },
        ],
        response_format={"type": "json_object"},
    )
    raw = response.choices[0].message.content
    decision = json.loads(raw)
    applied = []
    existing = {task["id"] for task in before}
    for index, action in enumerate(decision["actions"]):
        op = action["op"]
        if op == "create":
            task_id = kb.create_task(
                conn,
                title=action["title"],
                body=action["body"],
                assignee="researcher",
                created_by="capture-spike",
                goal_mode=True,
                session_id=data["case"]["session"],
                idempotency_key=f"{data['case']['id']}:{index}",
            )
        elif op in {"update", "stop"}:
            task_id = action["id"]
            if task_id not in existing:
                raise ValueError("Unknown task identity")
            if op == "update":
                if not kb.edit_task(
                    conn, task_id, title=action["title"], body=action["body"]
                ):
                    raise RuntimeError("Task edit failed")
            elif not kb.archive_task(conn, task_id):
                raise RuntimeError("Task archive failed")
        else:
            raise ValueError("Unknown operation")
        applied.append({"op": op, "id": task_id})
    result = {
        "case": data["case"]["id"],
        "session": data["case"]["session"],
        "pid": os.getpid(),
        "model": model,
        "response_id": response.id,
        "usage": response.usage.model_dump(),
        "before": before,
        "decision": decision,
        "applied": applied,
        "after": snapshot(kb, conn),
        "integrity": conn.execute("PRAGMA quick_check").fetchone()[0],
    }
    save(args.output / "turn.json", result)
    conn.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--turn", action="store_true")
    args = parser.parse_args()
    if args.turn:
        turn(args)
        return
    args.output.mkdir(parents=True, exist_ok=False)
    cases = json.loads((HERE / "dataset.json").read_text())
    history, results, labels = [], [], {}
    previous_session = None
    for case in cases:
        if case["session"] != previous_session:
            history = []  # No transcript carried into a fresh session.
        save(args.output / "input.json", {"case": case, "history": history})
        subprocess.run(
            [
                sys.executable,
                __file__,
                "--source",
                str(args.source),
                "--output",
                str(args.output),
                "--env-file",
                str(args.env_file),
                "--turn",
            ],
            check=True,
        )
        result = json.loads((args.output / "turn.json").read_text())
        checks = {
            "operations": sorted(a["op"] for a in result["applied"])
            == sorted(case["ops"]),
            "count": len(result["after"]) == case["count"],
            "integrity": result["integrity"] == "ok",
        }
        if case.get("label") and result["applied"]:
            labels[case["label"]] = result["applied"][0]["id"]
        if case.get("target"):
            checks["identity"] = [a["id"] for a in result["applied"]] == [
                labels.get(case["target"])
            ]
        if case.get("contains"):
            task = next(
                (t for t in result["after"] if t["id"] == labels.get(case["target"])),
                {},
            )
            text = (task.get("title", "") + " " + (task.get("body") or "")).lower()
            checks["requirements"] = all(word in text for word in case["contains"])
        if results:
            checks["restart_readback"] = result["before"] == results[-1]["after"]
        result["checks"] = checks
        result["passed"] = all(checks.values())
        results.append(result)
        save(args.output / "results.json", results)
        print(case["id"], "PASS" if result["passed"] else "FAIL", flush=True)
        history += [
            {"role": "user", "content": case["text"]},
            {"role": "assistant", "content": result["decision"]["reply"]},
        ]
        previous_session = case["session"]
    save(
        args.output / "summary.json",
        {
            "passed": sum(r["passed"] for r in results),
            "total": len(results),
            "prompt_sha256": hashlib.sha256(
                (HERE / "prompt.md").read_bytes()
            ).hexdigest(),
            "dataset_sha256": hashlib.sha256(
                (HERE / "dataset.json").read_bytes()
            ).hexdigest(),
        },
    )
    if not all(r["passed"] for r in results):
        sys.exit(1)


if __name__ == "__main__":
    main()
