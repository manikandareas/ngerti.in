"""Real Clerk/API scope and revocation checks without recording bearer tokens."""

import argparse
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--auth", type=Path, required=True)
    parser.add_argument("--live", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    live = json.loads(args.live.read_text())
    checks = []

    def request(action, index=0, grant=None, thread=None, authentication="real"):
        auth = json.loads(args.auth.read_text())
        payload = {
            "thread_id": thread or live["thread"],
            "agent_id": live["agent"],
            "action": action,
        }
        if grant is not None:
            payload["grant"] = grant
        headers = {"Content-Type": "application/json"}
        if authentication != "missing":
            headers["Authorization"] = "Bearer " + (
                auth["identities"][index]["jwt"]
                if authentication == "real"
                else "invalid"
            )
        body = {
            "schema_version": "nma.v1",
            "command_id": str(uuid4()),
            "type": "screen.action",
            "expected_revision": None,
            "payload": payload,
        }
        try:
            with urlopen(
                Request(
                    auth["base"] + "/api/agent-engine/v1/commands",
                    data=json.dumps(body).encode(),
                    headers=headers,
                ),
                timeout=45,
            ) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def check(name, observed, expected):
        checks.append(
            {
                "name": name,
                "status": observed,
                "expected": expected,
                "passed": observed == expected,
            }
        )
        assert observed == expected, checks[-1]

    status, connection = request("connect")
    check("owner_connect", status, 200)
    grant = connection["grant"]
    try:
        status, frame = request("frame", grant=grant)
        check("owner_frame", status, 200)
        assert frame["image"].startswith("data:image/png;base64,")
        check(
            "missing_bearer",
            request("frame", grant=grant, authentication="missing")[0],
            401,
        )
        check(
            "invalid_bearer",
            request("frame", grant=grant, authentication="invalid")[0],
            401,
        )
        check("foreign_clerk_owner", request("frame", index=1, grant=grant)[0], 404)
        check(
            "wrong_thread", request("frame", thread=str(uuid4()), grant=grant)[0], 404
        )
        check("wrong_grant", request("frame", grant="f" * 64)[0], 409)
        check("explicit_revoke", request("revoke", grant=grant)[0], 200)
        check("revoked_frame", request("frame", grant=grant)[0], 409)
    finally:
        args.output.write_text(
            json.dumps(
                {
                    "checks": checks,
                    "all_passed": all(c["passed"] for c in checks),
                    "bearer_or_grant_recorded": False,
                },
                indent=2,
            )
            + "\n"
        )
    print(f"Authenticated scope checks passed: {len(checks)}")


if __name__ == "__main__":
    main()
