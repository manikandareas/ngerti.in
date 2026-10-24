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


if point == "before_continuation_commit":
    from ngertiin_engine.goal_continuation import Continuation

    original = Continuation.prepare

    def prepare(self, *args):
        result = original(self, *args)
        crash()
        return result

    Continuation.prepare = prepare
elif point == "after_continuation_commit":
    from ngertiin_engine.goal_continuation import Continuation

    original = Continuation.deliver_unit

    async def deliver(self, row):
        crash()
        return await original(self, row)

    Continuation.deliver_unit = deliver
elif point == "after_goal_card":
    from ngertiin_engine.goal_continuation import Continuation

    original = Continuation.card

    def card(self, *args):
        result = original(self, *args)
        crash()
        return result

    Continuation.card = card
elif point == "after_goal_pause":
    from ngertiin_engine.goal_commands import GoalCommands

    original = GoalCommands.mutate

    def control(self, body):
        result = original(self, body)
        if body["type"] == "goal.pause":
            crash()
        return result

    GoalCommands.mutate = control
elif point == "after_goal_admission":
    from gateway.session_authority import SessionAuthority

    original = SessionAuthority.submit

    async def submit(self, actor, submission, *args, **kwargs):
        result = await original(self, actor, submission, *args, **kwargs)
        linked = self.db._execute_write(
            lambda conn: conn.execute(
                "SELECT 1 FROM nma_goal_units u JOIN nma_adapter_runs r ON r.owner_id=u.owner_id AND r.run_id=u.run_id JOIN session_admissions a ON a.request_id='nma:'||r.operation_id WHERE a.admission_id=? AND u.parent_run_id IS NOT NULL",
                (result.admission_id,),
            ).fetchone()
        )
        if linked:
            crash()
        return result

    SessionAuthority.submit = submit
elif point == "after_goal_commit":
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
