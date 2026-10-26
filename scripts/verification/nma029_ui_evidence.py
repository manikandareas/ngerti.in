"""Read authenticated API/native receipts after UI actions; never mutate context."""

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--phase", required=True)
    args = parser.parse_args()
    meta = json.loads(args.metadata.read_text())
    auth = json.loads(args.state.read_text())
    headers = {"Authorization": "Bearer " + auth["identities"][0]["jwt"]}

    def get(path):
        with urlopen(
            Request(auth["base"] + "/api/agent-engine/v1" + path, headers=headers),
            timeout=30,
        ) as response:
            return json.load(response)

    data = json.loads(args.output.read_text()) if args.output.exists() else {}
    if args.phase in data:
        raise FileExistsError("Preserve the original phase; choose a new phase label")
    report = {}
    with sqlite3.connect(
        (Path(meta["root"]) / "state/state.db").resolve().as_uri() + "?mode=ro",
        uri=True,
    ) as db:
        for kind, thread in (
            ("dm", meta["thread_id"]),
            ("group", meta["group_thread_id"]),
        ):
            snap = get(f"/threads/{thread}/snapshot")
            sessions = []
            for agent in snap["thread"]["agents"]:
                session = get(f"/threads/{thread}/session?agent_id={agent['agent_id']}")
                native = db.execute(
                    "SELECT count(*),sum(_compressed_summary=1) FROM messages WHERE session_id=?",
                    (session["native_tip"],),
                ).fetchone()
                sessions.append(
                    {
                        "agent_id": agent["agent_id"],
                        **session,
                        "native_message_count": native[0],
                        "native_summary_count": native[1] or 0,
                    }
                )
            report[kind] = {
                "thread_id": thread,
                "message_count": len(snap["messages"]),
                "messages_sha256": hashlib.sha256(
                    json.dumps(snap["messages"], sort_keys=True).encode()
                ).hexdigest(),
                "goal_count": len(snap["goals"]),
                "sessions": sessions,
            }
        receipts = []
        for body, result in db.execute(
            "SELECT body,result FROM nma_commands WHERE json_extract(body,'$.type') IN ('session.compress','session.reset') ORDER BY rowid"
        ):
            command = json.loads(body)
            result = json.loads(result) if result else {}
            native = result.get("native_mutation", {})
            receipts.append(
                {
                    "command_id": command["command_id"],
                    "type": command["type"],
                    "agent_id": command["payload"]["agent_id"],
                    "thread_id": command["payload"]["thread_id"],
                    "native_mutation": native,
                    "error_code": result.get("error_code"),
                    "committed": bool(result),
                }
            )
        report["context_receipts"] = receipts
    data[args.phase] = report
    args.output.write_text(json.dumps(data, indent=2) + "\n")
    print(
        json.dumps(
            {
                "phase": args.phase,
                "dm_messages": report["dm"]["message_count"],
                "receipts": len(receipts),
            }
        )
    )


if __name__ == "__main__":
    main()
