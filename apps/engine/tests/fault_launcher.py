"""Test-only kill injection; never imported or packaged by the service."""

import os
import signal
import threading
from pathlib import Path

from ngertiin_engine.reliability import Reliability
from ngertiin_engine.store import Store

point = os.environ["NMA_TEST_FAULT"]
marker = Path(os.environ["NMA_TEST_MARKER"])


def crash():
    if not marker.exists():
        marker.write_text(point)
        os.kill(os.getpid(), signal.SIGKILL)
        # Never return to the transaction if host signal delivery is deferred.
        threading.Event().wait()


if point == "after_goal_commit":
    from ngertiin_engine.goals import Goals

    original = Goals.tool

    def goal_tool(self, stamp, args, ids):
        value = original(self, stamp, args, ids)
        crash()
        return value

    Goals.tool = goal_tool
elif point == "before_goal_commit":
    original = Reliability.append

    def append(self, conn, run_id, config, kind, payload):
        value = original(self, conn, run_id, config, kind, payload)
        if kind == "goal.changed":
            crash()
        return value

    Reliability.append = append
elif point == "after_dm_prepare":
    from ngertiin_engine.direct_messages import DirectMessages

    original = DirectMessages.prepare

    def prepare(self, body):
        value = original(self, body)
        crash()
        return value

    DirectMessages.prepare = prepare
elif point in {"before_admit", "after_admit"}:
    original = Store.admit

    def admit(self, body):
        if body["type"] == "runtime.submit" and point == "before_admit":
            crash()
        value = original(self, body)
        if body["type"] == "runtime.submit" and point == "after_admit":
            crash()
        return value

    Store.admit = admit
elif point == "after_stop":
    original = Reliability.stop

    def stop(self, body, run_id):
        value = original(self, body, run_id)
        crash()
        return value

    Reliability.stop = stop
elif point in {"after_claim", "before_publish", "after_publish"}:
    original = Reliability.append

    def append(self, conn, run_id, config, kind, payload):
        if point == "before_publish" and kind == "message.completed":
            crash()
        return original(self, conn, run_id, config, kind, payload)

    Reliability.append = append
    original_publish = Reliability.publish

    def publish(self, stamp, kind, payload):
        value = original_publish(self, stamp, kind, payload)
        if (point == "after_claim" and kind == "message.start") or (
            point == "after_publish" and kind == "message.complete"
        ):
            crash()
        return value

    Reliability.publish = publish
elif point in {"before_effect", "after_effect"}:
    original = Reliability.tool

    def tool(self, stamp, name, args, ids, invoke):
        def effect():
            if point == "before_effect":
                crash()
            result = invoke()
            crash()
            return result

        return original(self, stamp, name, args, ids, effect)

    Reliability.tool = tool
elif point == "after_native":
    from gateway.session_authority import SessionAuthority

    original = SessionAuthority.submit

    async def submit(self, *args, **kwargs):
        result = await original(self, *args, **kwargs)
        crash()
        return result

    SessionAuthority.submit = submit

from ngertiin_engine.service import main

main()
