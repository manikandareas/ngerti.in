"""Offline fault checks for NG-031 admission and RFB authorization. No cloud calls."""

import json
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from ngertiin.daytona_trial import store
from ngertiin.daytona_trial.rfb import ClientMessages


def denied(action):
    try:
        action()
    except store.TrialError:
        return
    raise AssertionError("A forbidden operation was admitted")


def main():
    original = store.PATH
    checks = []
    with tempfile.TemporaryDirectory() as directory:
        store.PATH = Path(directory) / "trial.sqlite3"
        try:
            # Initialize schema before concurrent admission; race on real SQLite.
            store.sessions()

            def reserve(owner):
                try:
                    return store.reserve(owner, 30)
                except store.TrialError:
                    return None

            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(reserve, ["owner-a", "owner-b"]))
            admitted = [row for row in results if row]
            assert len(admitted) == 1
            row = admitted[0]
            checks.append("concurrent account admission allows one resource")
            denied(lambda: store.owned(row["id"], "foreign-owner"))
            store.provisioned(row["id"], "provider-id")
            grant, secret = store.mint_grant(row["id"], row["owner_id"])
            denied(lambda: store.check_grant(grant, "wrong-cookie"))
            token = store.begin_action(row["id"], row["owner_id"], 1)
            transition = store.request_control(row["id"], row["owner_id"], "human")
            denied(lambda: store.check_grant(grant, secret))
            denied(lambda: store.begin_action(row["id"], row["owner_id"], 1))
            denied(
                lambda: store.complete_control(row["id"], row["owner_id"], 2, "human")
            )
            store.finish_action(row["id"], token, unknown=True)
            denied(
                lambda: store.complete_control(row["id"], row["owner_id"], 2, "human")
            )
            assert transition["mode"] == "handoff"
            checks.append(
                "foreign owner, wrong cookie, stale lease and unknown effect fail closed"
            )
            store.deleted(row["id"])
            denied(lambda: store.reserve("owner-a", 30))
            checks.append("cleanup and restart do not refund reserved account budget")

            next_row = store.reserve("owner-a", 1)
            store.provisioned(next_row["id"], "next-provider")
            channel = store.open_channel(next_row)
            denied(lambda: store.open_channel(next_row))
            store.request_control(next_row["id"], "owner-a", "human")
            denied(
                lambda: store.complete_control(next_row["id"], "owner-a", 2, "human")
            )
            store.close_channel(channel)
            store.complete_control(next_row["id"], "owner-a", 2, "human")
            checks.append(
                "control waits for upstream close and permits one viewer channel"
            )

            handshake = b"RFB 003.008\n\x01\x01"
            key = b"\x04\x01\x00\x00\x00\x00\x00h"
            pointer = b"\x05\x01\x00\x10\x00\x10"
            qemu = b"\xff\x00\x00\x01\x00\x00\x00h\x00\x00\x00\x23"
            for human in [False, True]:
                parser = ClientMessages()
                wire = handshake + key + pointer + qemu
                actual = b"".join(parser.feed(bytes([value]), human) for value in wire)
                assert actual == (wire if human else handshake)
                assert parser.blocked_inputs == (0 if human else 3)
            checks.append(
                "fragmented key, pointer and QEMU input blocked outside human lease"
            )
            parser = ClientMessages()
            parser.feed(handshake, False)
            denied(lambda: parser.feed(b"\xfd", False))
            denied(lambda: ClientMessages().feed(b"x" * 65537, False))
            checks.append("unknown protocol and oversized packets fail closed")
        finally:
            store.PATH = original
    print(json.dumps({"passed": len(checks), "checks": checks}, indent=2))


if __name__ == "__main__":
    main()
