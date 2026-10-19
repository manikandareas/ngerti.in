"""Behavioral browser contracts against real PostgreSQL/checkpoints/MinIO, controlled remote I/O."""

import asyncio
import json
import struct
import sys
from http.cookies import SimpleCookie
from uuid import UUID, uuid4

import httpx
import inspect_files as harness
from fastapi import Response
from ngertiin.async_db import transaction
from ngertiin.chat.store import one
from ngertiin.computer import control, lifecycle, model, policy, viewer
from ngertiin.computer.contracts import Action, NeedsHuman, Screen
from ngertiin.computer.egress import public_connection
from ngertiin.computer.rfb import ClientMessages
from ngertiin.models import Account
from ngertiin.sandbox import store as sandbox_store
from ngertiin.sandbox.contracts import RuntimeFailure, StagedFile
from ngertiin.sandbox.outputs import content
from ngertiin.tasks import actions, commands, creation, runtime
from ngertiin.tasks import store as tasks

check, reject = harness.check, harness.reject


class ControlledComputer:
    name = "controlled"

    def __init__(self):
        self.profiles = {}
        self.running = set()
        self.dispatched = []
        self.observations = 0
        self.unknown = False
        self.can_stop = True
        self.private = False

    async def start(self, workspace, seconds):
        self.profiles.setdefault(workspace["id"], {"logged_in": False})
        self.running.add(workspace["id"])
        return str(workspace["id"])

    async def observe(self, workspace):
        self.observations += 1
        return Screen(json.dumps(self.profiles[workspace["id"]]).encode())

    async def target(self, workspace, action):
        if self.private:
            raise NeedsHuman("Kolom privat memerlukan takeover.")
        return Screen(json.dumps(self.profiles[workspace["id"]]).encode()).fingerprint

    async def act(self, workspace, action):
        self.dispatched.append(action.kind)
        if self.unknown:
            raise RuntimeFailure("Lost acknowledgement", unknown=True)

    async def collect(self, workspace, filenames):
        return [StagedFile(name, b"name,total\nalpha,42\n") for name in filenames]

    async def stop(self, workspace):
        if not self.can_stop:
            raise RuntimeFailure("Stop unconfirmed", unknown=True)
        self.running.discard(workspace["id"])
        return {"profile_bytes": 100, "egress_bytes": 200}

    async def delete(self, workspace):
        self.running.discard(workspace["id"])
        self.profiles.pop(workspace["id"], None)
        return True


COMPUTER = ControlledComputer()
DECISIONS = []
STARTED = asyncio.Event()
RELEASE = asyncio.Event()
WAIT_MODEL = False


async def propose(execution, screen, history):
    if WAIT_MODEL:
        STARTED.set()
        await RELEASE.wait()
    return (
        DECISIONS.pop(0)
        if DECISIONS
        else Action(
            kind="finish",
            description="Hasil siap.",
            files=[
                {"filename": s["filename"], "content": "# Laporan\nTotal: 42."}
                for s in execution["output_spec"]
            ],
        )
    )


async def create(owner, thread, review=False):
    return await creation.create(
        owner,
        thread,
        uuid4(),
        "Baca laporan dan susun ringkasannya.",
        review,
        runtime_kind="browser",
    )


async def run(owner, task):
    await runtime.run_task(str(task["id"]))
    return await tasks.detail(owner, task["id"])


async def normal_and_login():
    owner, thread = await harness.owner()
    DECISIONS.append(Action(kind="ask_user", description="Login melalui takeover."))
    a = await run(owner, await create(owner, thread))
    check(
        "login_wait_releases_execution",
        a["status"] == "waiting_user" and a["stage"] == "computer_human",
    )
    w = a["computer"]["workspace"]
    await control.change(owner, a["id"], w["control_version"], "human")
    a = await tasks.detail(owner, a["id"])
    w = a["computer"]["workspace"]
    COMPUTER.profiles[w["id"]]["logged_in"] = True
    b = await run(owner, await create(owner, thread))
    check(
        "second_task_queues_without_second_browser",
        b["stage"] == "computer_queue" and len(COMPUTER.running) == 1,
    )
    observed = COMPUTER.observations
    await control.change(owner, a["id"], w["control_version"], "agent")
    check("return_observes_before_agent_enabled", COMPUTER.observations == observed + 1)
    a = await run(owner, a)
    check(
        "first_task_publishes_and_stops_compute",
        a["status"] == "succeeded" and not COMPUTER.running,
    )
    check("profile_survives_task_end", COMPUTER.profiles[w["id"]]["logged_in"])
    b = await tasks.detail(owner, b["id"])
    check("waiter_wakes_after_confirmed_stop", b["status"] == "queued")
    DECISIONS.append(Action(kind="ask_user", description="Periksa halaman."))
    b = await run(owner, b)
    check(
        "next_task_reuses_workspace_and_login",
        b["computer"]["workspace"]["id"] == w["id"]
        and COMPUTER.profiles[w["id"]]["logged_in"],
    )
    await control.change(
        owner, b["id"], b["computer"]["workspace"]["control_version"], "agent"
    )
    b = await run(owner, b)
    candidate = UUID(json.loads(b["draft"])["files"][0]["staged_output_id"])
    _, data = await content(owner, b["id"], candidate)
    check("candidate_survives_compute_stop", b"42" in data)
    await lifecycle.reset(owner, w["id"])
    _, still = await content(owner, b["id"], candidate)
    check(
        "profile_reset_preserves_results",
        still == data and w["id"] not in COMPUTER.profiles,
    )


async def approvals_and_viewer():
    owner, thread = await harness.owner()
    foreign, _ = await harness.owner()
    DECISIONS.append(
        Action(kind="click", description="Kirim formulir contoh.", x=300, y=200)
    )
    before = len(COMPUTER.dispatched)
    task = await run(owner, await create(owner, thread, True))
    w, proposal = task["computer"]["workspace"], task["computer"]["action"]
    check(
        "effect_not_dispatched_before_exact_approval",
        task["stage"] == "computer_approval" and len(COMPUTER.dispatched) == before,
    )
    await reject(
        "foreign_owner_cannot_takeover",
        control.change(foreign, task["id"], w["control_version"], "human"),
        404,
    )
    await reject(
        "stale_control_rejected",
        control.change(owner, task["id"], w["control_version"] + 1, "human"),
        409,
    )
    response = Response()
    grant = await viewer.mint(owner, task["id"], response)
    cookie = SimpleCookie()
    cookie.load(response.headers["set-cookie"])
    secret = cookie["ngertiin-computer"].value
    ident = UUID(grant["path"].split("/")[-1])
    await viewer.checked(ident, secret, connect_channel=True)
    await reject(
        "two_tabs_do_not_steal_live_viewer",
        viewer.mint(owner, task["id"], Response()),
        409,
    )
    async with transaction() as conn:
        await conn.execute(
            "UPDATE computer_viewers SET expires_at=now()-interval '1 second' WHERE id=%s",
            (ident,),
        )
    try:
        await viewer.checked(ident, secret)
    except ValueError:
        check("expired_active_grant_rejected", True)
    else:
        raise AssertionError("expired viewer accepted")
    async with transaction() as conn:
        await conn.execute(
            "UPDATE computer_viewers SET connected=false,closed=true WHERE id=%s",
            (ident,),
        )
    await control.decide(owner, task["id"], proposal["id"], w["control_version"], True)
    await control.decide(owner, task["id"], proposal["id"], w["control_version"], True)
    task = await run(owner, task)
    check("duplicate_decision_dispatches_once", len(COMPUTER.dispatched) == before + 1)
    check(
        "final_review_separate_from_browser_action",
        task["stage"] == "review" and not COMPUTER.running,
    )
    await actions.decide(owner, task["action"]["id"], task["revision"], True, uuid4())
    task = await run(owner, task)
    check(
        "final_review_publishes_without_browser_reexecution",
        task["status"] == "succeeded" and len(COMPUTER.dispatched) == before + 1,
    )


async def takeover_during_model():
    global WAIT_MODEL
    owner, thread = await harness.owner()
    task = await create(owner, thread)
    WAIT_MODEL = True
    STARTED.clear()
    RELEASE.clear()
    DECISIONS.append(
        Action(kind="navigate", description="Buka halaman.", url="https://example.com")
    )
    old = asyncio.create_task(runtime.run_task(str(task["id"])))
    await asyncio.wait_for(STARTED.wait(), 10)
    task = await tasks.detail(owner, task["id"])
    version = task["computer"]["workspace"]["control_version"]
    before = len(COMPUTER.dispatched)
    await control.change(owner, task["id"], version, "human")
    RELEASE.set()
    await old
    WAIT_MODEL = False
    DECISIONS.clear()
    task = await tasks.detail(owner, task["id"])
    check("late_model_cannot_act_after_takeover", len(COMPUTER.dispatched) == before)
    check(
        "private_handoff_keeps_compute_but_no_worker",
        task["status"] == "waiting_user"
        and task["computer"]["workspace"]["control"] == "human"
        and bool(COMPUTER.running),
    )
    await commands.cancel(owner, task["id"])
    await lifecycle.stop_task(owner, task["id"])
    check(
        "stop_revokes_control_retains_profile",
        not COMPUTER.running
        and task["computer"]["workspace"]["id"] in COMPUTER.profiles,
    )


async def unknown_and_stale():
    owner, thread = await harness.owner()
    DECISIONS.append(Action(kind="click", description="Kirim aksi."))
    task = await run(owner, await create(owner, thread))
    w, proposal = task["computer"]["workspace"], task["computer"]["action"]
    await control.decide(owner, task["id"], proposal["id"], w["control_version"], True)
    COMPUTER.unknown = True
    task = await run(owner, task)
    COMPUTER.unknown = False
    check(
        "lost_ack_enters_unknown_without_replay",
        task["stage"] == "computer_unknown"
        and task["computer"]["workspace"]["unknown_effect"],
    )
    await reject(
        "unknown_task_cannot_retry", commands.retry(owner, task["id"], uuid4()), 409
    )
    before = len(COMPUTER.dispatched)
    await lifecycle.acknowledge(owner, task["id"])
    check(
        "human_ack_never_replays_uncertain_effect", len(COMPUTER.dispatched) == before
    )
    await reject(
        "acknowledged_task_stays_nonreplayable",
        commands.retry(owner, task["id"], uuid4()),
        409,
    )
    DECISIONS.append(Action(kind="click", description="Klik halaman awal."))
    other = await run(owner, await create(owner, thread))
    w, proposal = other["computer"]["workspace"], other["computer"]["action"]
    await control.decide(owner, other["id"], proposal["id"], w["control_version"], True)
    COMPUTER.profiles[w["id"]]["changed"] = True
    other = await run(owner, other)
    check(
        "changed_screen_invalidates_approved_action",
        len(COMPUTER.dispatched) == before and other["stage"] == "computer_human",
    )
    await commands.cancel(owner, other["id"])
    await lifecycle.stop_task(owner, other["id"])


async def cleanup_caps_and_private_input():
    owner, thread = await harness.owner()
    DECISIONS.append(Action(kind="ask_user", description="Login privat."))
    browser = await run(owner, await create(owner, thread))
    w = browser["computer"]["workspace"]
    code = await creation.create(
        owner, thread, uuid4(), "Hitung total.", False, runtime_kind="code"
    )
    execution = await tasks.claim(code["id"])
    try:
        await sandbox_store.reserve(execution)
    except ValueError:
        check("browser_and_python_share_account_concurrency", True)
    else:
        raise AssertionError("Python admitted beside active browser")
    await commands.cancel(owner, code["id"])
    await commands.cancel(owner, browser["id"])
    COMPUTER.can_stop = False
    check(
        "unconfirmed_stop_retains_reservation",
        not await lifecycle.stop_task(owner, browser["id"]),
    )
    blocked = await run(owner, await create(owner, thread))
    check("cleanup_failure_blocks_next_task", blocked["stage"] == "computer_queue")
    COMPUTER.can_stop = True
    await lifecycle.reconcile(owner, browser["id"])
    DECISIONS.append(
        Action(kind="type", description="Input terproteksi.", text="fixture")
    )
    COMPUTER.private = True
    blocked = await run(owner, blocked)
    COMPUTER.private = False
    check(
        "private_input_requires_human_without_proposal",
        blocked["stage"] == "computer_human" and blocked["computer"]["action"] is None,
    )
    await commands.cancel(owner, blocked["id"])
    await lifecycle.stop_task(owner, blocked["id"])
    async with transaction() as conn:
        await conn.execute(
            "UPDATE browser_workspaces SET retain_until=now()-interval '1 second' "
            "WHERE id=%s",
            (w["id"],),
        )
    await lifecycle.sweep()
    check("retention_removes_stopped_profile", w["id"] not in COMPUTER.profiles)


def viewer_input_contracts():
    key = struct.pack(">BBHI", 4, 1, 0, 65)
    pointer = struct.pack(">BBHH", 5, 1, 10, 20)
    clipboard = b"\x06\x00\x00\x00" + struct.pack(">I", 4) + b"test"
    read = b"\x03\x00" + struct.pack(">HHHH", 0, 0, 1280, 720)
    parser = ClientMessages()
    parser.feed(b"RFB 003.008\n\x01\x01", False)
    check(
        "agent_viewer_blocks_key_pointer_clipboard",
        parser.feed(key + pointer + clipboard + read, False) == read
        and parser.blocked_inputs == 3,
    )
    check(
        "human_viewer_allows_private_input",
        parser.feed(key + pointer + clipboard, True) == key + pointer + clipboard,
    )
    try:
        parser.feed(b"\xfe", True)
    except ValueError:
        check("unknown_rfb_extension_rejected", True)
    else:
        raise AssertionError("Unknown RFB extension")


async def http_contracts():
    from ngertiin.accounts.auth import current_account
    from ngertiin.api.app import app

    owner, thread = await harness.owner()
    foreign, _ = await harness.owner()
    DECISIONS.append(Action(kind="ask_user", description="Login privat."))
    task = await run(owner, await create(owner, thread))
    await reject(
        "active_browser_cannot_be_revised_into_publication",
        commands.revise(
            owner,
            task["id"],
            task["revision"],
            json.dumps(
                {
                    "summary": "fixture",
                    "files": [{"filename": "hasil.md", "content": "fixture"}],
                }
            ),
            uuid4(),
        ),
        409,
    )
    wid = task["computer"]["workspace"]["id"]
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://probe"
    ) as client:
        check(
            "computer_api_requires_auth",
            (await client.get("/computer/workspace")).status_code == 401,
        )
        app.dependency_overrides[current_account] = lambda: Account(
            id=foreign, clerk_user_id="probe"
        )
        try:
            check(
                "foreign_task_state_hidden",
                (await client.get(f"/computer/tasks/{task['id']}")).status_code == 404,
            )
            check(
                "foreign_profile_reset_denied",
                (
                    await client.post(
                        f"/computer/workspaces/{wid}/reset", json={"confirmed": True}
                    )
                ).status_code
                == 404,
            )
            app.dependency_overrides[current_account] = lambda: Account(
                id=owner, clerk_user_id="probe"
            )
            check(
                "profile_reset_requires_explicit_confirmation",
                (
                    await client.post(
                        f"/computer/workspaces/{wid}/reset", json={"confirmed": False}
                    )
                ).status_code
                == 422,
            )
            check(
                "owned_profile_state_available",
                (await client.get("/computer/workspace")).json()["workspace"]["id"]
                == str(wid),
            )
        finally:
            app.dependency_overrides.clear()
    await commands.cancel(owner, task["id"])
    await lifecycle.stop_task(owner, task["id"])


async def interrupted_finalization():
    owner, thread = await harness.owner()
    COMPUTER.can_stop = False
    task = await run(owner, await create(owner, thread))
    check(
        "cleanup_failure_keeps_candidate_unpublished",
        bool(task["draft"]) and task["stage"] == "computer_unknown",
    )
    # Reproduce a worker interruption after persisting candidates but before
    # confirming cleanup. A checkpoint/review resume must still stop compute.
    async with tasks.locked(owner, task["id"]) as (conn, row):
        await tasks.change(
            conn, row, status="queued", stage="draft_ready", lease_token=None
        )
    task = await run(owner, task)
    check(
        "prepared_resume_still_requires_confirmed_stop",
        task["stage"] == "computer_unknown"
        and task["computer"]["sessions"][0]["state"] == "unknown",
    )
    COMPUTER.can_stop = True
    await lifecycle.reconcile(owner, task["id"])
    task = await commands.retry(owner, task["id"], uuid4())
    task = await run(owner, task)
    check(
        "reconciled_candidate_publishes_without_new_browser",
        task["status"] == "succeeded" and len(task["computer"]["sessions"]) == 1,
    )


async def scenarios():
    original_runtime, original_model = policy.get_runtime, model.propose
    policy.get_runtime, model.propose = lambda *args: COMPUTER, propose
    try:
        for url in (
            "file:///tmp/secrets",
            "https://user:pass@example.com",
            "http://example.com",
        ):
            try:
                Action(kind="navigate", description="Visit", url=url)
            except ValueError:
                check("reject_unsafe_navigation_" + url.split(":")[0], True)
            else:
                raise AssertionError(url)
        try:
            public_connection("127.0.0.1", 443)
        except ValueError:
            check("egress_proxy_blocks_private_ip", True)
        else:
            raise AssertionError("private egress")
        await normal_and_login()
        await approvals_and_viewer()
        await takeover_during_model()
        await unknown_and_stale()
        await cleanup_caps_and_private_input()
        viewer_input_contracts()
        await http_contracts()
        await interrupted_finalization()
        async with transaction() as conn:
            count = await one(
                conn,
                "SELECT count(*) AS n FROM computer_sessions WHERE state<>'stopped'",
            )
            check("all_controlled_compute_stopped", count["n"] == 0)
    finally:
        policy.get_runtime, model.propose = original_runtime, original_model
        await harness.close_pool()


if __name__ == "__main__":
    harness.scenarios = scenarios
    if len(sys.argv) == 1:
        sys.argv.extend(["--output", ".dev/computer-contracts.json"])
    harness.main()
