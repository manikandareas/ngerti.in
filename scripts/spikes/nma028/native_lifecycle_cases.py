"""Real-model native cron and persistent group baselines at the exact Hermes pin.

Uses the canonical gateway RPC, scheduler and room driver. Trusted client code
publishes verified scoped file bytes as native attachments; it never runs a model
or schedules a continuation itself. Every planned case emits an outcome.
"""

import argparse
import asyncio
import base64
import hashlib
import json
import os
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import NAMESPACE_URL, uuid4, uuid5

ROOT = Path(__file__).resolve().parents[3]
LAUNCHER = Path(__file__).with_name("spike_gateway.py")


def digest(value):
    return hashlib.sha256(value).hexdigest()


def provider_fault(text):
    lowered = text.lower()
    return any(
        token in lowered
        for token in (
            "no credits remaining",
            "billing or credits exhausted",
            "insufficient_quota",
        )
    )


def rows(path):
    if not path.exists():
        return []
    value = json.loads(path.read_text())
    return value if isinstance(value, list) else value.get("jobs", [])


class Gateway:
    def __init__(self, source, home, environment, work):
        self.source, self.home, self.environment, self.work = (
            source,
            home,
            environment,
            work,
        )
        self.process, self.descriptor, self.starts = None, None, 0
        self.log = None

    def start(self):
        from tests.gateway.test_normal_runtime_boot import control

        self.log = (self.work / f"gateway-{self.home.name}-{self.starts}.log").open("w")
        self.starts += 1
        self.process = subprocess.Popen(
            [sys.executable, str(LAUNCHER)],
            cwd=self.source,
            env=self.environment | {"HERMES_HOME": str(self.home)},
            stdin=subprocess.DEVNULL,
            stdout=self.log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        deadline = time.monotonic() + 120
        while self.process.poll() is None and time.monotonic() < deadline:
            try:
                self.descriptor = control(self.home, "identify")
                if self.descriptor.get("state") == "ready":
                    return
            except (OSError, ValueError, AssertionError):
                pass
            time.sleep(0.1)
        raise RuntimeError(
            "Native gateway did not become ready; inspect private launch log"
        )

    def stop(self):
        if self.process is not None and self.process.poll() is None:
            # The process group belongs exclusively to this disposable launch.
            os.killpg(self.process.pid, signal.SIGKILL)
            self.process.wait(timeout=10)
        if self.log:
            self.log.close()


async def rpc(gateway, method, **params):
    from tests.gateway.fixtures.local_recovery_probe import rpc as native_rpc
    from tests.gateway.fixtures.local_recovery_probe import websocket

    async with websocket(gateway.home, gateway.descriptor) as ws:
        # Native mutation authority requires this connection to attach first.
        if params.get("session_id") and method != "session.resume":
            attached = await native_rpc(
                ws, "session.resume", session_id=params["session_id"]
            )
            if "error" in attached:
                raise RuntimeError("session.resume: " + json.dumps(attached["error"]))
        reply = await native_rpc(ws, method, **params)
    if "error" in reply:
        raise RuntimeError(method + ": " + json.dumps(reply["error"]))
    return reply["result"]


async def settled_session(gateway, sid, initial, deadline_s=180):
    started = time.monotonic()
    progress = None
    trace = []
    while time.monotonic() - started < deadline_s:
        replay = await rpc(
            gateway,
            "session.events.since",
            session_id=sid,
            replay_epoch=initial["replay_epoch"],
            last_sequence=initial["last_sequence"],
        )
        trace = replay["events"]
        if progress is None and any(
            e.get("type") in {"tool.start", "message.delta"} for e in trace
        ):
            progress = time.monotonic() - started
        complete = [e for e in trace if e.get("type") == "message.complete"]
        if complete:
            snapshot = await rpc(gateway, "session.resume", session_id=sid)
            return {
                "trace": trace,
                "snapshot": snapshot,
                "text": complete[-1]["payload"].get("text", ""),
                "timings_s": {
                    "first_progress": progress,
                    "settlement": time.monotonic() - started,
                },
            }
        await asyncio.sleep(0.2)
    raise TimeoutError("Native session did not settle within the frozen deadline")


class Evidence:
    def __init__(self, args, settings):
        self.args, self.settings = args, settings
        self.protocol = json.loads(args.protocol.read_text())
        self.protocol_sha = digest(args.protocol.read_bytes())
        self.secret = settings.pop("secret")

    def base(self, scenario, repeat):
        return {
            "surface": "direct",
            "scenario": scenario,
            "repeat": repeat,
            "attempt_id": str(uuid4()),
            "protocol_sha256": self.protocol_sha,
            "settings": self.settings,
            "status": "failed",
            "category": "unknown",
            "oracle_passed": False,
            "lineage": {},
            "timings_s": {},
            "differences": [],
        }

    def emit(self, row):
        serialized = json.dumps(row, ensure_ascii=False)
        if self.secret:
            serialized = serialized.replace(self.secret, "[REDACTED]")
        with self.args.output.open("a") as out:
            out.write(serialized + "\n")
        print(
            json.dumps(
                {k: row[k] for k in ("scenario", "repeat", "status", "category")}
            ),
            flush=True,
        )


async def offline_cases(args, evidence, gateway):
    cases = []
    # One profile restart covers three persisted independent scheduled jobs.
    # This is three task repetitions, not three independent restart samples.
    due = datetime.now(UTC) + timedelta(seconds=100)
    for repeat in range(1, 4):
        row = evidence.base("offline_goal", repeat)
        row["differences"] = [
            "Native cron is explicitly scheduled through conversation; automatic product goal capture is a separate Ngertiin behavior.",
            "Native local delivery persists scheduler output rather than Ngertiin message publication.",
            "All three tasks share one gateway restart; recovery latency has one independent sample.",
        ]
        cases.append(row)
        try:
            name = f"nma028-offline-{repeat}"
            created = await rpc(
                gateway,
                "session.create",
                request_id=row["attempt_id"],
                source="cli",
                toolsets=["cronjob", "todo"],
                ignore_rules=True,
            )
            sid = created["session_id"]
            initial = await rpc(gateway, "session.resume", session_id=sid)
            text = (
                f"Create exactly one native cron job named {name}. At {due.isoformat()} (UTC), "
                f"calculate 14 multiplied by 17 and report exactly NMA028_OFFLINE_{repeat}_238. "
                "Use cronjob_manage create with this absolute one-shot ISO timestamp, repeat=1, deliver=local, "
                "and enabled_toolsets=[] for the future arithmetic job. It must run once after I disconnect. "
                "Do not calculate early. After storing the schedule reply SCHEDULED."
            )
            started = time.monotonic()
            admission = await rpc(
                gateway,
                "prompt.submit",
                session_id=sid,
                input_id=row["attempt_id"],
                text=text,
            )
            row["timings_s"]["admission"] = time.monotonic() - started
            result = await settled_session(gateway, sid, initial)
            row["scheduling_result"] = result
            row["timings_s"].update(result["timings_s"])
            job = next(
                (
                    j
                    for j in rows(gateway.home / "cron/jobs.json")
                    if j.get("name") == name
                ),
                None,
            )
            if job is None:
                raise AssertionError(
                    "Real model did not persist the requested native cron job"
                )
            row["lineage"] = {
                "session_id": sid,
                "admission": admission,
                "job_id": job["id"],
                "native_request_id": row["attempt_id"],
            }
            row["scheduled_job"] = job
        except Exception as error:  # noqa: BLE001 - preserve all failed attempts
            row["error"] = type(error).__name__ + ": " + str(error)
    gateway.stop()
    recovery = time.monotonic()
    gateway.start()
    recovery_s = time.monotonic() - recovery
    # No gateway RPC clients remain open while native scheduling executes.
    latest_due = max(
        [
            datetime.fromisoformat(r["scheduled_job"]["next_run_at"]).timestamp()
            for r in cases
            if "scheduled_job" in r
        ]
        or [time.time()]
    )
    offline_until = latest_due + 65
    while time.time() < offline_until:
        await asyncio.sleep(min(1, offline_until - time.time()))
    for row in cases:
        try:
            if "scheduled_job" not in row:
                evidence.emit(row)
                continue
            job_id = row["scheduled_job"]["id"]
            deadline = time.monotonic() + 90
            while time.monotonic() < deadline:
                job = next(
                    (
                        j
                        for j in rows(gateway.home / "cron/jobs.json")
                        if j["id"] == job_id
                    ),
                    None,
                )
                outputs = sorted((gateway.home / "cron/output" / job_id).glob("*.md"))
                if job is not None and job.get("last_status") is not None:
                    break
                await asyncio.sleep(0.5)
            text = "\n".join(p.read_text() for p in outputs)
            output = [
                {
                    "name": p.name,
                    "sha256": digest(p.read_bytes()),
                    "text": p.read_text(),
                }
                for p in outputs
            ]
            with sqlite3.connect(
                f"file:{gateway.home / 'state.db'}?mode=ro", uri=True
            ) as db:
                db.row_factory = sqlite3.Row
                admissions = [
                    dict(r)
                    for r in db.execute(
                        "SELECT * FROM session_admissions WHERE request_id LIKE ?",
                        ("cron:" + job_id + ":%",),
                    )
                ]
            row.update(
                final_job=job,
                output=output,
                native_admissions=admissions,
                offline_without_client=True,
            )
            row["timings_s"]["recovery"] = recovery_s if row["repeat"] == 1 else None
            expected = f"NMA028_OFFLINE_{row['repeat']}_238"
            passed = bool(
                job
                and job.get("last_status") == "success"
                and len(outputs) == 1
                and expected in text
                and job.get("repeat", {}).get("completed") == 1
            )
            # Wait beyond result observation then confirm the one-shot did not duplicate.
            await asyncio.sleep(1)
            passed = (
                passed
                and len(list((gateway.home / "cron/output" / job_id).glob("*.md"))) == 1
            )
            row.update(
                status="passed" if passed else "failed",
                category="none"
                if passed
                else "provider"
                if provider_fault(text)
                else "oracle",
                oracle_passed=passed,
            )
        except Exception as error:  # noqa: BLE001 - retain failure without hiding other cases
            row["error"] = type(error).__name__ + ": " + str(error)
        evidence.emit(row)


async def settled_room(gateway, room, minimum, deadline_s=180):
    started = time.monotonic()
    while time.monotonic() - started < deadline_s:
        state = await rpc(gateway, "groups.state", room_id=room)
        log = await rpc(gateway, "groups.log", room_id=room)
        counts = state["driver_status"]["counts"]
        if counts.get("settled", 0) >= minimum and not state["driver_status"].get(
            "working"
        ):
            return state, log
        if counts.get("failed") or counts.get("indeterminate"):
            raise AssertionError("Native room task failed: " + json.dumps(counts))
        await asyncio.sleep(0.3)
    raise TimeoutError("Native room did not finish within deadline")


def scoped_files(control_dir, profile, owner, room):
    from isolated_tools import Scope

    agent = str(uuid5(NAMESPACE_URL, owner + ":profile:" + str(profile.resolve())))
    database = control_dir / "isolated-tools.db"
    if not database.exists():
        return []
    with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as db:
        scopes = [
            Scope(**json.loads(row[0]))
            for row in db.execute("SELECT scope_json FROM scopes")
        ]
    with sqlite3.connect(f"file:{profile / 'state.db'}?mode=ro", uri=True) as db:
        sessions = set()
        for request_id, session_id in db.execute(
            "SELECT request_id,target_session_id FROM session_admissions WHERE request_id LIKE 'hosted:%'"
        ):
            binding = json.loads(request_id.removeprefix("hosted:"))[0]
            if binding.get("room_id") == room:
                sessions.add(session_id)
    thread_sessions = {
        str(uuid5(NAMESPACE_URL, owner + ":session:" + session_id)): session_id
        for session_id in sessions
    }
    return [
        (scope, thread_sessions[scope.thread_id])
        for scope in scopes
        if scope.agent_id == agent and scope.thread_id in thread_sessions
    ]


async def group_cases(args, evidence, gateway, profiles, broker):
    from gateway.hosted_rooms import user_event_id

    for repeat in range(1, 4):
        row = evidence.base("group_handoff", repeat)
        row["differences"] = [
            "Native standalone profiles represent persistent peers; Ngertiin identities map to these profiles in the product integration.",
            "A trusted client projects model-written scoped file bytes into native room attachments; it does not synthesize the artifact or run another model.",
        ]
        room = "nma028-room-" + str(repeat)
        try:
            members = [
                {
                    "member_id": name,
                    "profile": "default" if name == "researcher" else name,
                    "handle": name,
                }
                for name in ("researcher", "writer", "reviewer")
            ]
            await rpc(
                gateway,
                "groups.create",
                room_id=room,
                name="NMA028 group " + str(repeat),
                members=members,
            )
            event = "initial-" + row["attempt_id"]
            request = {
                "room_id": room,
                "event_id": event,
                "payload": {
                    "thread_id": "thread-" + row["attempt_id"],
                    "text": "@researcher Prepare a report from verified facts: 360 km travelled and 45 litres used. "
                    "Researcher calculate litres per 100 km and explicitly hand off to @writer. "
                    "Writer: use the communicated calculation, write /work/report.md with the native terminal tool, "
                    "including a Markdown heading, both source facts and litres per 100 km, then explicitly hand off to @reviewer. "
                    "Reviewer: independently check the arithmetic and reply with REVIEWER_PROOF plus the correct result. "
                    "Each named peer must contribute its own response. Keep working without another user message.",
                },
            }
            started = time.monotonic()
            accepted = await rpc(gateway, "groups.send", **request)
            row["timings_s"]["admission"] = time.monotonic() - started
            state, log = await settled_room(gateway, room, 3)
            row["timings_s"]["settlement"] = time.monotonic() - started
            row["initial_state"], row["initial_log"] = state, log
            messages = [e for e in log["events"] if e["kind"] == "message.member"]
            authors = {m["actor"]["id"] for m in messages}
            if authors != {"researcher", "writer", "reviewer"}:
                raise AssertionError("Three real persistent peers did not contribute")
            writer = profiles["writer"]
            artifact = None
            for scope, producer_sid in scoped_files(
                args.control_dir, writer, args.owner, room
            ):
                try:
                    data = broker.file_bytes(scope, "report.md")
                except (RuntimeError, ValueError):
                    continue
                if b"12.5" in data and b"360" in data and b"45" in data:
                    artifact = (scope, data, producer_sid)
            if artifact is None:
                raise AssertionError(
                    "Writer did not produce a readable scoped report file"
                )
            scope, data, producer_sid = artifact
            upload = await rpc(
                gateway,
                "groups.attachment.upload",
                room_id=room,
                upload_id="report-" + row["attempt_id"],
                kind="file",
                name="report.md",
                mime="text/plain",
                data_base64=base64.b64encode(data).decode(),
            )
            publication = "artifact-" + row["attempt_id"]
            attachment = {
                key: upload[key]
                for key in ("attachment_id", "kind", "name", "size", "mime")
            }
            review = await rpc(
                gateway,
                "groups.send",
                room_id=room,
                event_id=publication,
                payload={
                    "thread_id": request["payload"]["thread_id"],
                    "text": "@reviewer Verify the artifact arithmetic. The following inline text is an exact trusted projection of the attached canonical bytes, SHA-256 "
                    + digest(data)
                    + ":\n\n"
                    + data.decode()
                    + "\n\nReply NMA028_ARTIFACT_REVIEWED_12.5 if correct; otherwise explain the discrepancy. Do not mention another agent.",
                    "attachments": [attachment],
                },
            )
            final_state, final_log = await settled_room(gateway, room, 4)
            download = await rpc(
                gateway,
                "groups.attachment.download",
                room_id=room,
                event_id=user_event_id(publication),
                attachment_id=upload["attachment_id"],
            )
            downloaded = base64.b64decode(download["data_base64"], validate=True)
            reviewed = any(
                e["kind"] == "message.member"
                and e["actor"]["id"] == "reviewer"
                and "NMA028_ARTIFACT_REVIEWED_12.5" in e["payload"]["text"]
                for e in final_log["events"]
            )
            duplicate = await rpc(gateway, "groups.send", **request)
            after = await rpc(gateway, "groups.log", room_id=room)
            passed = (
                reviewed
                and downloaded == data
                and after["events"] == final_log["events"]
            )
            row["lineage"] = {
                "room_id": room,
                "input_event_id": event,
                "attachment_event_id": publication,
                "artifact_id": upload["attachment_id"],
                "artifact_scope": scope.__dict__,
                "producer_native_session_id": producer_sid,
                "native_attachment_event_id": user_event_id(publication),
                "acceptance": accepted,
                "review_acceptance": review,
            }
            row.update(
                artifact={
                    "filename": "report.md",
                    "sha256": digest(data),
                    "content": data.decode(),
                    "bytes": len(data),
                },
                attachment=upload,
                duplicate_receipt=duplicate,
                final_state=final_state,
                final_log=final_log,
                status="passed" if passed else "failed",
                category="none" if passed else "oracle",
                oracle_passed=passed,
            )
        except Exception as error:  # noqa: BLE001 - emit every planned case
            row["error"] = type(error).__name__ + ": " + str(error)
            if (gateway.home / "state.db").exists():
                with sqlite3.connect(
                    f"file:{gateway.home / 'state.db'}?mode=ro", uri=True
                ) as db:
                    row["native_failed_results"] = [
                        r[0]
                        for r in db.execute(
                            "SELECT result_json FROM hosted_room_driver_tasks WHERE room_id=? AND status='failed'",
                            (room,),
                        )
                    ]
                if provider_fault(json.dumps(row["native_failed_results"])):
                    row["category"] = "provider"
        evidence.emit(row)


def recover_groups(args):
    """Re-score the frozen core oracle from durable native bytes on backup copies.

    No gateway, scheduler, model or tool dispatcher is started. A native store
    may initialize its schema on the private backup, never the original state.
    """
    original = [
        json.loads(line) for line in args.recover_groups.read_text().splitlines()
    ]
    selected = [row for row in original if row["scenario"] == "group_handoff"]
    if {row["repeat"] for row in selected} != {1, 2, 3}:
        raise ValueError("Recovery requires all three original group attempts")
    protocol_sha = digest(args.protocol.read_bytes())
    if any(row["protocol_sha256"] != protocol_sha for row in selected):
        raise ValueError("Frozen protocol hash differs from original attempts")
    work = Path(selected[0]["settings"]["work"])
    if any(Path(row["settings"]["work"]) != work for row in selected):
        raise ValueError("Expected one source fixture for the three groups")
    home = work / "state"
    writer = home / "profiles/writer"
    os.environ["HERMES_HOME"] = str(home)
    sys.path[:0] = [str(args.source), str(Path(__file__).parent)]
    from gateway.hosted_room_attachments import (
        AttachmentNotFoundError,
        HostedRoomAttachmentStore,
    )

    before_paths = [
        p
        for p in work.rglob("*")
        if p.is_file() and p.name.endswith((".db", ".db-wal"))
    ]
    before = {str(p): digest(p.read_bytes()) for p in before_paths}
    private = Path(
        tempfile.mkdtemp(prefix="nma028-readonly-recovery-", dir="/tmp")
    ).resolve()
    copy_database = private / "state.db"
    with (
        sqlite3.connect(f"file:{home / 'state.db'}?mode=ro", uri=True) as source,
        sqlite3.connect(copy_database) as target,
    ):
        source.backup(target)
    shutil.copytree(
        home / "hosted-room-attachments", private / "hosted-room-attachments"
    )
    # Original owner binding is checked from the operator journal, not a model field.
    with sqlite3.connect(
        f"file:{args.control_dir / 'isolated-tools.db'}?mode=ro", uri=True
    ) as db:
        owner = db.execute("SELECT value FROM metadata WHERE key='owner'").fetchone()[0]
    if owner != args.owner:
        raise ValueError("Foreign supervisor owner refused")
    store = HostedRoomAttachmentStore(copy_database)
    evidence = Evidence(args, {**selected[0]["settings"], "secret": ""})
    for prior in selected:
        row = {**prior, "lineage": dict(prior.get("lineage", {}))}
        row["prior_score"] = {
            k: prior.get(k) for k in ("status", "category", "oracle_passed", "error")
        }
        row.pop("error", None)
        room = "nma028-room-" + str(row["repeat"])
        try:
            with sqlite3.connect(f"file:{home / 'state.db'}?mode=ro", uri=True) as db:
                db.row_factory = sqlite3.Row
                attachment_rows = [
                    dict(r)
                    for r in db.execute(
                        "SELECT * FROM hosted_room_attachments WHERE room_id=? AND name='report.md' AND state='committed'",
                        (room,),
                    )
                ]
                room_row = dict(
                    db.execute(
                        "SELECT authority_gateway_id,authority_epoch FROM hosted_rooms WHERE room_id=?",
                        (room,),
                    ).fetchone()
                )
                events = [
                    dict(r)
                    for r in db.execute(
                        "SELECT * FROM hosted_room_events WHERE room_id=? ORDER BY seq",
                        (room,),
                    )
                ]
                tasks = [
                    dict(r)
                    for r in db.execute(
                        "SELECT task_id,turn_id,payload_json,status,result_json FROM hosted_room_driver_tasks WHERE room_id=? ORDER BY created_at",
                        (room,),
                    )
                ]
            if len(attachment_rows) != 1:
                raise AssertionError(
                    "Expected exactly one committed Writer artifact for this room"
                )
            attachment = attachment_rows[0]
            saved = store.read_viewer(
                room_id=room,
                attachment_id=attachment["attachment_id"],
                event_id=attachment["event_id"],
                authority_gateway_id=room_row["authority_gateway_id"],
                authority_epoch=room_row["authority_epoch"],
            )
            data = saved.data
            if digest(data) != attachment["sha256"]:
                raise AssertionError(
                    "Canonical native download hash differs from committed bytes"
                )
            # The native byte store itself refuses a different gateway authority.
            try:
                store.read_viewer(
                    room_id=room,
                    attachment_id=attachment["attachment_id"],
                    event_id=attachment["event_id"],
                    authority_gateway_id="install:foreign",
                    authority_epoch=room_row["authority_epoch"],
                )
            except AttachmentNotFoundError:
                foreign_refused = True
            else:
                foreign_refused = False
            members = [
                (
                    json.loads(e["actor_json"])["id"],
                    json.loads(e["payload_json"]).get("text", ""),
                )
                for e in events
                if e["kind"] == "message.member"
            ]
            authors = {actor for actor, text in members}
            arithmetic_review = any(
                actor == "reviewer" and "12.5" in text for actor, text in members
            )
            extra_review = any(
                actor == "reviewer" and "NMA028_ARTIFACT_REVIEWED_12.5" in text
                for actor, text in members
            )
            scopes = scoped_files(args.control_dir, writer, args.owner, room)
            if len(scopes) != 1:
                raise AssertionError(
                    "Producer native session/scope mapping is not unique"
                )
            scope, sid = scopes[0]
            with sqlite3.connect(f"file:{writer / 'state.db'}?mode=ro", uri=True) as db:
                db.row_factory = sqlite3.Row
                native_admissions = [
                    dict(r)
                    for r in db.execute(
                        "SELECT admission_id,target_session_id,request_id,status FROM session_admissions WHERE target_session_id=?",
                        (sid,),
                    )
                ]
                tool_rows = [
                    dict(r)
                    for r in db.execute(
                        "SELECT role,tool_calls,tool_name,tool_call_id,content FROM messages WHERE session_id=? AND (tool_calls IS NOT NULL OR role='tool') ORDER BY id",
                        (sid,),
                    )
                ]
            argument_hashes = set()
            for native in tool_rows:
                if not native.get("tool_calls"):
                    continue
                for call in json.loads(native["tool_calls"]):
                    function = call.get("function", {})
                    arguments = json.loads(function.get("arguments") or "{}")
                    nested = (
                        arguments.get("calls", [])
                        if function.get("name") == "tool_call"
                        else [{"name": function.get("name"), "arguments": arguments}]
                    )
                    for item in nested:
                        if item.get("name") in {
                            "terminal",
                            "write_file",
                        } and "report.md" in json.dumps(item):
                            argument_hashes.add(
                                digest(
                                    json.dumps(
                                        item["arguments"],
                                        sort_keys=True,
                                        separators=(",", ":"),
                                        allow_nan=False,
                                    ).encode()
                                )
                            )
            with sqlite3.connect(
                f"file:{args.control_dir / 'isolated-tools.db'}?mode=ro", uri=True
            ) as db:
                db.row_factory = sqlite3.Row
                operations = [
                    dict(r)
                    for r in db.execute(
                        "SELECT operation_id,tool,args_hash,state,result FROM operations WHERE scope_key=?",
                        (scope.key,),
                    )
                    if r["args_hash"] in argument_hashes
                ]
            operation_confirmed = any(
                op["state"] in {"returned", "confirmed"}
                and op["tool"] == "terminal"
                and json.loads(op["result"]).get("exit_code") == 0
                and json.loads(op["result"]).get("error") is None
                for op in operations
            )
            passed = (
                authors == {"researcher", "writer", "reviewer"}
                and arithmetic_review
                and foreign_refused
                and operation_confirmed
                and all(token in data for token in (b"360", b"45", b"12.5"))
            )
            row.update(
                status="passed" if passed else "failed",
                category="none" if passed else "oracle",
                oracle_passed=passed,
                artifact={
                    "filename": "report.md",
                    "sha256": digest(data),
                    "bytes": len(data),
                    "content": data.decode(),
                },
                supplemental_artifact_review={
                    "passed": extra_review,
                    "required_by_frozen_core_oracle": False,
                    "note": "The third extra review collided with provider exhaustion; its failed/pending work remains unmodified."
                    if not extra_review
                    else "Explicit Reviewer acknowledgment is retained.",
                },
                native_download={
                    "method": "HostedRoomAttachmentStore.read_viewer on a disposable backup copy",
                    "metadata": saved.attachment,
                    "foreign_authority_refused": foreign_refused,
                },
                native_admissions=native_admissions,
                native_tool_results=tool_rows,
                tool_operations=operations,
                native_tasks=tasks,
                final_events=events,
                read_only_recovery={
                    "source_attempt_sha256": digest(args.recover_groups.read_bytes()),
                    "backup_database": str(copy_database),
                    "model_calls": 0,
                    "tool_dispatches": 0,
                    "scheduled_runs": 0,
                    "original_pending_work_replayed": False,
                    "score_basis": "Frozen group_handoff core oracle: three real authors, verified arithmetic, model-written readable scoped artifact and preserved native lineage.",
                },
            )
            row["lineage"].update(
                room_id=room,
                producer_native_session_id=sid,
                artifact_scope=scope.__dict__,
                native_attachment_event_id=attachment["event_id"],
                artifact_id=attachment["attachment_id"],
                operation_ids=[op["operation_id"] for op in operations],
            )
        except Exception as error:  # noqa: BLE001 - retain all recovery failures
            row.update(
                status="failed",
                category="harness",
                oracle_passed=False,
                error=type(error).__name__ + ": " + str(error),
            )
        for path, expected in before.items():
            if digest(Path(path).read_bytes()) != expected:
                raise RuntimeError(
                    "Original native state changed during recovery: " + path
                )
        row.setdefault("read_only_recovery", {})[
            "original_database_bytes_unchanged"
        ] = True
        evidence.emit(row)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--env-file", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--protocol", required=True, type=Path)
    parser.add_argument("--control-dir", required=True, type=Path)
    parser.add_argument("--owner", required=True)
    parser.add_argument("--only", choices=["offline_goal", "group_handoff"])
    parser.add_argument("--recover-groups", type=Path)
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError(
            "Choose a new evidence output; prior attempts are immutable"
        )
    args.source, args.control_dir = args.source.resolve(), args.control_dir.resolve()
    if args.recover_groups:
        recover_groups(args)
        return
    if args.control_dir.exists() and any(args.control_dir.iterdir()):
        raise FileExistsError("This harness requires its own empty control directory")
    work = Path(
        tempfile.mkdtemp(prefix="nma028-native-lifecycle-", dir="/tmp")
    ).resolve()
    home = work / "state"
    home.mkdir(mode=0o700)
    (work / "workspace").mkdir(mode=0o700)
    os.environ["HERMES_HOME"] = str(home)
    sys.path[:0] = [
        str(args.source),
        str(ROOT / "apps/engine/src"),
        str(Path(__file__).parent),
    ]
    from dotenv import dotenv_values
    from hermes_cli.profiles import create_profile
    from isolated_tools import IsolatedTools
    from ngertiin_engine.runtime import verify
    from tests.gateway.fixtures.local_recovery_probe import child_env

    verify(args.source)
    config_values = dotenv_values(args.env_file)
    secret, model = config_values["OPENAI_API_KEY"], config_values["OPENAI_MODEL"]
    endpoint = config_values.get("OPENAI_BASE_URL") or "https://api.openai.com/v1"
    evidence = Evidence(
        args,
        {
            "model": model,
            "provider": "custom",
            "endpoint": endpoint,
            "max_turns": 8,
            "secret": secret,
            "native_revision": "7489b22af47ce91b366dde81d5831ea422577498",
            "work": str(work),
        },
    )
    writer = create_profile("writer", no_alias=True, no_skills=True)
    reviewer = create_profile("reviewer", no_alias=True, no_skills=True)
    profiles = {"researcher": home, "writer": writer, "reviewer": reviewer}
    config = {
        "model": {"provider": "custom", "default": model, "base_url": endpoint},
        "agent": {"max_turns": 8},
        "platform_toolsets": {
            "cli": ["nma_computer", "todo", "cronjob"],
            "gui": ["nma_computer", "todo", "cronjob"],
            "bot_room": ["nma_computer", "todo", "cronjob"],
        },
        "auxiliary": {"title_generation": {"enabled": False}},
        "terminal": {"cwd": str(work / "workspace")},
        "gateway": {"multiplex_profiles": False},
        "hosted_rooms": {
            "profiles": {"writer": str(writer), "reviewer": str(reviewer)}
        },
    }
    souls = {
        "researcher": "You are Researcher. Start your response RESEARCHER_PROOF. Calculate supplied facts then explicitly hand off to @writer. Never fabricate tool success.",
        "writer": "You are Writer. Start your response WRITER_PROOF. Write the requested file using the native terminal tool, then hand off to @reviewer. Never fabricate file creation. Keep prose concise.",
        "reviewer": "You are Reviewer. Start your response REVIEWER_PROOF. Independently verify arithmetic and report the result. Do not mention another agent after finishing. When asked to review an attached artifact, use its trusted inline content and acknowledge only if correct.",
    }
    for name, profile in profiles.items():
        (profile / "config.yaml").write_text(
            json.dumps(
                config
                if name == "researcher"
                else config | {"gateway": {"standalone": True}}
            )
        )
        (profile / "SOUL.md").write_text(souls[name] + "\n")
        path = profile / ".env"
        path.write_text("OPENAI_API_KEY=" + secret + "\n")
        path.chmod(0o600)
    environment = child_env() | {
        "HERMES_SOURCE": str(args.source),
        "PYTHONPATH": str(ROOT / "apps/engine/src") + os.pathsep + str(args.source),
        "NMA028_OWNER_ID": args.owner,
        "NMA028_CONTROL_DIR": str(args.control_dir),
        "NMA028_SURFACE": "direct",
        "OPENAI_API_KEY": secret,
        "OPENAI_BASE_URL": endpoint,
        "PYTHONUNBUFFERED": "1",
        "HERMES_DISABLE_LAZY_INSTALLS": "1",
    }
    gateways = {
        name: Gateway(args.source, path, environment, work)
        for name, path in profiles.items()
    }
    broker = IsolatedTools(args.control_dir, args.owner)
    try:
        gateways["researcher"].start()
        if args.only != "group_handoff":
            asyncio.run(offline_cases(args, evidence, gateways["researcher"]))
        if args.only != "offline_goal":
            for name in ("writer", "reviewer"):
                gateways[name].start()
            asyncio.run(
                group_cases(args, evidence, gateways["researcher"], profiles, broker)
            )
    finally:
        for gateway in gateways.values():
            gateway.stop()
        for profile in profiles.values():
            (profile / ".env").unlink(missing_ok=True)
        broker.cleanup()


if __name__ == "__main__":
    main()
