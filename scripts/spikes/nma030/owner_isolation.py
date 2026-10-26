"""Two actual Clerk sessions cannot borrow another owner's native routes or history."""

import argparse
import json
import os
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "apps/engine/tests"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--auth", type=Path, required=True)
    parser.add_argument("--primary", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    import test_runtime

    auth = json.loads(args.auth.read_text())
    primary = json.loads(args.primary.read_text())
    os.environ.pop("NMA_TEST_LIVE_ENV", None)
    test_runtime.OWNER = auth["identities"][1]["owner_id"]
    fixture = test_runtime.runtime.__wrapped__(None)
    state = next(fixture)
    root, _, call, start, *_ = state
    registry_path = Path(auth["registry"])
    registry = json.loads(registry_path.read_text())
    registry[test_runtime.OWNER] = {
        "key_file": str(root / "key"),
        "socket": str(root / "state/nma.sock"),
    }
    registry_path.write_text(json.dumps(registry))
    command = test_runtime.command
    own = call(
        command(
            "agent.create",
            {
                "display_name": "Owner two",
                "handle": "owner-two",
                "config": {
                    "soul": "",
                    "instructions": "",
                    "model": "test",
                    "inference": {"version": 1},
                },
            },
        )
    )["result"]["agent"]
    proof = {
        "authentication": "Two actual ClerkJS sessions, production current_account",
        "cases": [],
    }

    def request(index, path, body=None, expected=200):
        current = json.loads(args.auth.read_text())
        with httpx.Client(timeout=30, trust_env=False) as client:
            response = client.request(
                "POST" if body is not None else "GET",
                current["base"] + "/api/agent-engine/v1" + path,
                json=body,
                headers={
                    "Authorization": "Bearer " + current["identities"][index]["jwt"]
                },
            )
        proof["cases"].append(
            {
                "owner": index,
                "path": path,
                "command": body.get("type") if body else None,
                "expected": expected,
                "observed": response.status_code,
            }
        )
        assert response.status_code == expected
        return response.json()

    try:
        first_connections = request(0, "/connections")["items"]
        other_connections = request(1, "/connections")["items"]
        first_ids = {c["connection_id"] for c in first_connections}
        other_ids = {c["connection_id"] for c in other_connections}
        assert not first_ids.intersection(other_ids)
        request(
            1, "/threads/" + primary["agents"][0]["primary_dm_thread_id"], expected=404
        )
        request(0, "/threads/" + own["primary_dm_thread_id"], expected=404)
        request(
            1,
            "/connections/" + primary["models"][0].split(":")[0] + "/models",
            {},
            expected=404,
        )
        request(
            1,
            "/commands",
            command(
                "agent.create",
                {
                    "display_name": "Forbidden route",
                    "handle": "forbidden-route",
                    "config": {
                        "soul": "",
                        "instructions": "",
                        "model": "test",
                        "inference": {"fallback_models": [primary["models"][0]]},
                    },
                },
            ),
            expected=422,
        )
        request(
            1,
            "/commands",
            command(
                "agent.create",
                {
                    "display_name": "Forbidden auxiliary",
                    "handle": "forbidden-auxiliary",
                    "config": {
                        "soul": "",
                        "instructions": "",
                        "model": "test",
                        "inference": {
                            "auxiliary": {"review": {"model": primary["models"][1]}}
                        },
                    },
                },
            ),
            expected=422,
        )
        before = call(command("agent.list", {"after": None, "limit": 100}))["result"]
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        after = call(command("agent.list", {"after": None, "limit": 100}))["result"]
        assert before == after
        request(
            1, "/threads/" + primary["agents"][0]["primary_dm_thread_id"], expected=404
        )
        proof.update(
            status="passed",
            catalog_persisted_after_restart=True,
            disjoint_connection_ids=True,
        )
    finally:
        args.evidence.write_text(json.dumps(proof, indent=2) + "\n")
        next(fixture, None)


if __name__ == "__main__":
    main()
