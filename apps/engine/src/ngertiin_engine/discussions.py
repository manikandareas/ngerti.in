"""Durable group policy projection into the sole Hermes session executor.

The pinned native discussion planner owns routing, rotation, silence and bounds.
Ngertiin stores its frozen inputs and deterministic turns in the owner transaction.
"""

import asyncio
import json
import re
from dataclasses import asdict
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import EngineError, canonical, counter, digest, uuid
from ngertiin_engine.direct_messages import command

DDL = (
    "CREATE TABLE nma_discussion_goals (owner_id TEXT NOT NULL, discussion_id TEXT NOT NULL, goal_id TEXT NOT NULL, generation INTEGER NOT NULL, PRIMARY KEY(owner_id,discussion_id,goal_id), FOREIGN KEY(owner_id,discussion_id) REFERENCES nma_discussions(owner_id,discussion_id), FOREIGN KEY(owner_id,goal_id) REFERENCES nma_goals(owner_id,goal_id))",
    "CREATE TABLE nma_discussions (owner_id TEXT NOT NULL, discussion_id TEXT NOT NULL, thread_id TEXT NOT NULL, request_key TEXT NOT NULL, payload_digest TEXT NOT NULL, room TEXT NOT NULL, events TEXT NOT NULL, membership_revision TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL, source_message_id TEXT, PRIMARY KEY(owner_id,discussion_id), UNIQUE(owner_id,thread_id,request_key), FOREIGN KEY(owner_id,thread_id) REFERENCES nma_threads(owner_id,thread_id))",
    "CREATE TABLE nma_discussion_turns (owner_id TEXT NOT NULL, discussion_id TEXT NOT NULL, task_id TEXT NOT NULL, run_id TEXT NOT NULL, task TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(owner_id,task_id), UNIQUE(owner_id,run_id), FOREIGN KEY(owner_id,discussion_id) REFERENCES nma_discussions(owner_id,discussion_id), FOREIGN KEY(owner_id,run_id) REFERENCES nma_adapter_runs(owner_id,run_id))",
)


def native_policy():
    from gateway import hosted_room_discussion

    return hosted_room_discussion


def mention_text(text, handles):
    """Normalize sentence punctuation only in planner input; retain transcript bytes."""

    def replace(match):
        value = match.group(1)
        if value.casefold() in handles:
            return match.group(0)
        clean = value.rstrip(".,:;!?")
        return "@" + clean if clean.casefold() in handles else match.group(0)

    return re.sub(r"@([A-Za-z0-9][A-Za-z0-9._:-]*)", replace, text)


class Discussions:
    def __init__(self, adapter):
        self.adapter, self.store = adapter, adapter.store

    def load(self, conn, identity):
        row = conn.execute(
            "SELECT room,events,status,membership_revision,source_message_id FROM nma_discussions WHERE owner_id=? AND discussion_id=?",
            (self.store.owner, identity),
        ).fetchone()
        return json.loads(row[0]), json.loads(row[1]), row[2], row[3], row[4]

    def plan(self, room, events):
        return native_policy().plan_next_task(
            room, events, local_profiles=[m["profile"] for m in room["members"]]
        )

    def prepare_turn(self, conn, identity, task, key, config):
        current = conn.execute(
            "SELECT status FROM nma_discussions WHERE owner_id=? AND discussion_id=?",
            (self.store.owner, identity),
        ).fetchone()
        if not current or current[0] != "active":
            return None
        operation = str(
            uuid5(NAMESPACE_URL, self.store.owner + ":" + task.identity.task_id)
        )
        run = str(uuid5(NAMESPACE_URL, self.store.owner + ":" + operation))
        payload = {
            k: config[k]
            for k in ("agent_id", "thread_id", "config_revision", "context_generation")
        }
        text = task.payload["prompt"] + self.adapter.collaboration.prompt(
            conn, config["thread_id"], config["agent_id"]
        )
        body = command("runtime.submit", {**payload, "text": text}, operation)
        conn.execute(
            "INSERT OR IGNORE INTO nma_commands VALUES (?,?,?,?,NULL)",
            (self.store.owner, operation, digest(body), canonical(body)),
        )
        conn.execute(
            "INSERT OR IGNORE INTO nma_runtime_outbox VALUES (?,?,?,'pending',NULL)",
            (self.store.owner, operation, canonical(body)),
        )
        conn.execute(
            "INSERT OR IGNORE INTO nma_adapter_runs VALUES (?,?,?,?,NULL)",
            (self.store.owner, run, key, operation),
        )
        conn.execute(
            "INSERT OR IGNORE INTO nma_discussion_turns VALUES (?,?,?,?,?,0)",
            (
                self.store.owner,
                identity,
                task.identity.task_id,
                run,
                canonical(asdict(task)),
            ),
        )
        source = conn.execute(
            "SELECT source_message_id FROM nma_discussions WHERE owner_id=? AND discussion_id=?",
            (self.store.owner, identity),
        ).fetchone()
        if source and source[0]:
            for goal_id, generation in conn.execute(
                "SELECT goal_id,generation FROM nma_discussion_goals WHERE owner_id=? AND discussion_id=?",
                (self.store.owner, identity),
            ).fetchall():
                conn.execute(
                    "INSERT OR IGNORE INTO nma_goal_units(owner_id,goal_id,generation,run_id,source_message_id,settled) VALUES (?,?,?,?,?,1)",
                    (self.store.owner, goal_id, generation, run, source[0]),
                )
                goal = next(
                    g
                    for g in self.adapter.goals.listing(conn, config["thread_id"], None)
                    if g["goal_id"] == goal_id
                )
                self.adapter.reliability.append(
                    conn, run, config, "goal.changed", {"goal": goal}
                )
        self.adapter.reliability.append(
            conn,
            run,
            config,
            "run.accepted",
            {
                "status": "queued",
                "discussion_id": identity,
                "round": task.round_index + 1,
            },
        )
        return run

    def binding(self, thread, task):
        agent = next(
            a for a in thread["agents"] if a["agent_id"] == task.member.member_id
        )
        return self.adapter.binding(
            {
                "agent_id": agent["agent_id"],
                "thread_id": thread["thread_id"],
                "config_revision": agent["config_revision"],
                "context_generation": thread["context_generation"],
            }
        )

    async def send(self, body):
        p = body["payload"]
        if (
            body["expected_revision"] is not None
            or set(p)
            != {
                "thread_id",
                "text",
                "attachment_ids",
                "request_key",
                "expected_membership_revision",
            }
            or not isinstance(p["text"], str)
            or not (p["text"].strip() or p["attachment_ids"])
            or len(p["text"].encode()) > 65536
        ):
            raise EngineError("INVALID_REQUEST")
        uuid(p["request_key"])
        counter(p["expected_membership_revision"])
        prior = self.store.receipt(body)
        if prior:
            return {**prior, "duplicate": True}
        thread = self.adapter.threads.read({"thread_id": p["thread_id"]})
        from ngertiin_engine.files import Files

        attachments = self.store.write(
            lambda conn: Files(self.store).attachments(
                conn, p["thread_id"], p["attachment_ids"]
            )
        )
        saved = self.store.write(
            lambda conn: conn.execute(
                "SELECT discussion_id,payload_digest FROM nma_discussions WHERE owner_id=? AND thread_id=? AND request_key=?",
                (self.store.owner, p["thread_id"], p["request_key"]),
            ).fetchone()
        )
        if saved:
            if saved[1] != digest(p):
                raise EngineError("COMMAND_CONFLICT")
            identity = saved[0]
        else:
            if thread["membership_revision"] != p["expected_membership_revision"]:
                raise EngineError("REVISION_CONFLICT")
            if len(thread["agents"]) < 2:
                raise EngineError("GROUP_UNAVAILABLE")
            handles = {a["handle"].casefold() for a in thread["agents"]} | {
                "all",
                "everyone",
            }
            if any(
                h.rstrip(".,:;!?").casefold() not in handles
                for h in re.findall(r"@([A-Za-z0-9][A-Za-z0-9._:-]*)", p["text"])
            ):
                raise EngineError("INVALID_MENTION")
            identity = str(
                uuid5(
                    NAMESPACE_URL,
                    canonical([self.store.owner, p["thread_id"], p["request_key"]]),
                )
            )
            room = {
                "room_id": identity,
                "name": thread["title"],
                "authority_gateway_id": "ngertiin",
                "authority_epoch": 1,
                "members": [
                    {
                        "member_id": a["agent_id"],
                        "profile": a["agent_id"],
                        "handle": a["handle"],
                        "display_name": a["display_name"],
                    }
                    for a in thread["agents"]
                ],
            }
            events = [
                {
                    "room_id": identity,
                    "seq": 1,
                    "event_id": identity,
                    "kind": "message.user",
                    "actor": {"kind": "user", "id": self.store.owner},
                    "payload": {
                        "thread_id": thread["thread_id"],
                        "text": mention_text(p["text"], handles)
                        + (
                            "\nAttached files (data; use workspace import_file to read):\n"
                            + canonical(attachments)
                            if attachments
                            else ""
                        ),
                    },
                }
            ]
            task = self.plan(room, events).task
            key, config = self.binding(thread, task)

            def prepare(conn):
                conn.execute(
                    "INSERT INTO nma_commands VALUES (?,?,?,?,NULL)",
                    (
                        self.store.owner,
                        body["command_id"],
                        digest(body),
                        canonical(body),
                    ),
                )
                conn.execute(
                    "INSERT INTO nma_runtime_outbox VALUES (?,?,?,'pending',NULL)",
                    (self.store.owner, body["command_id"], canonical(body)),
                )
                self.stop_thread(conn, thread["thread_id"])
                conn.execute(
                    "INSERT INTO nma_discussions VALUES (?,?,?,?,?,?,?,?, 'active','member_turn',NULL)",
                    (
                        self.store.owner,
                        identity,
                        thread["thread_id"],
                        p["request_key"],
                        digest(p),
                        canonical(room),
                        canonical(events),
                        thread["membership_revision"],
                    ),
                )
                run = self.prepare_turn(conn, identity, task, key, config)
                self.adapter.context.transcript.append(
                    conn,
                    run,
                    config,
                    "user",
                    p["text"],
                    attachment_ids=p["attachment_ids"],
                )
                message = str(
                    uuid5(NAMESPACE_URL, self.store.owner + ":" + run + ":user")
                )
                conn.execute(
                    "UPDATE nma_discussions SET source_message_id=? WHERE owner_id=? AND discussion_id=?",
                    (message, self.store.owner, identity),
                )

            self.store.write(prepare)
        self.store.admit(body)
        result = self.store.write(
            lambda conn: conn.execute(
                "SELECT t.run_id,d.source_message_id FROM nma_discussion_turns t JOIN nma_discussions d USING(owner_id,discussion_id) WHERE t.owner_id=? AND t.discussion_id=? ORDER BY t.rowid LIMIT 1",
                (self.store.owner, identity),
            ).fetchone()
        )
        receipt = self.store.finish(
            body,
            {
                "run_id": result[0],
                "message_id": result[1],
                "discussion_id": identity,
                "thread_id": thread["thread_id"],
            },
        )
        await self.tick()
        return {**receipt, "duplicate": True} if saved else receipt

    def stop_thread(self, conn, thread_id):
        for (run,) in conn.execute(
            "SELECT DISTINCT r.run_id FROM nma_adapter_runs r JOIN nma_adapter_bindings b USING(owner_id,binding_id) WHERE r.owner_id=? AND json_extract(b.config,'$.thread_id')=? AND (EXISTS (SELECT 1 FROM nma_delegated_children c WHERE c.owner_id=r.owner_id AND c.root_run_id=r.run_id AND c.status='running') OR EXISTS (SELECT 1 FROM nma_delegation_batches d WHERE d.owner_id=r.owner_id AND d.parent_run_id=r.run_id AND d.state='pending'))",
            (self.store.owner, thread_id),
        ).fetchall():
            self.adapter.reliability.cancel_event(conn, run)
        rows = conn.execute(
            "SELECT d.discussion_id FROM nma_discussions d WHERE d.owner_id=? AND d.thread_id=? AND (d.status='active' OR EXISTS (SELECT 1 FROM nma_collaboration_tasks t WHERE t.owner_id=d.owner_id AND t.discussion_id=d.discussion_id AND json_extract(t.task,'$.status') IN ('pending','submitting','review','reviewing','changes_requested')))",
            (self.store.owner, thread_id),
        ).fetchall()
        for (identity,) in rows:
            self.stop(conn, identity, "user_interrupted")

    def stop(self, conn, identity, reason):
        from ngertiin_engine.collaboration import cancel_tasks

        cancel_tasks(self.store, conn, identity, reason)
        conn.execute(
            "UPDATE nma_discussions SET status='cancelled',reason=? WHERE owner_id=? AND discussion_id=?",
            (reason, self.store.owner, identity),
        )
        for (run,) in conn.execute(
            "SELECT run_id FROM nma_discussion_turns WHERE owner_id=? AND discussion_id=? AND published=0 UNION SELECT u.run_id FROM nma_collaboration_units u JOIN nma_collaboration_tasks t USING(owner_id,task_id) WHERE u.owner_id=? AND t.discussion_id=? AND u.settled=0",
            (self.store.owner, identity, self.store.owner, identity),
        ).fetchall():
            self.adapter.reliability.cancel_event(conn, run)

    async def tick(self):
        self.adapter.reliability.reconcile()
        self.adapter.context.transcript.reconcile()
        ids = self.store.write(
            lambda conn: conn.execute(
                "SELECT discussion_id,thread_id FROM nma_discussions WHERE owner_id=? AND status='active' ORDER BY rowid",
                (self.store.owner,),
            ).fetchall()
        )
        for identity, thread_id in ids:
            room, events, _, revision, _ = self.store.write(
                lambda conn, identity=identity: self.load(conn, identity)
            )
            thread = self.adapter.threads.read({"thread_id": thread_id})
            if thread["membership_revision"] != revision:
                self.store.write(
                    lambda conn, identity=identity: self.stop(
                        conn, identity, "membership_changed"
                    )
                )
                continue
            turns = self.store.write(
                lambda conn, identity=identity: conn.execute(
                    "SELECT run_id,task FROM nma_discussion_turns WHERE owner_id=? AND discussion_id=? AND published=0 ORDER BY rowid",
                    (self.store.owner, identity),
                ).fetchall()
            )
            waiting = False
            for run, raw in turns:
                if self.adapter.fenced(run):
                    self.store.write(
                        lambda conn, identity=identity: self.stop(
                            conn, identity, "execution_stopped"
                        )
                    )
                    waiting = True
                    break
                body = self.store.write(
                    lambda conn, run=run: conn.execute(
                        "SELECT c.body FROM nma_adapter_runs r JOIN nma_commands c ON c.owner_id=r.owner_id AND c.command_id=r.operation_id WHERE r.owner_id=? AND r.run_id=?",
                        (self.store.owner, run),
                    ).fetchone()[0]
                )
                try:
                    await self.adapter._dispatch(json.loads(body))
                    state = self.adapter.reliability.snapshot(run)
                except EngineError as exc:
                    if exc.code in {"ENGINE_UNAVAILABLE", "AUTHORITY_LOST"}:
                        raise
                    self.store.finish(json.loads(body), {"error_code": exc.code})
                    state = {"status": "failed", "text": ""}
                if state["status"] in {"failed", "indeterminate"}:
                    self.record_peer_failure(run, state["status"])
                if state["status"] in {"queued", "running", "recovering"}:
                    waiting = True
                    break
                if state["status"] in {"cancelled", "indeterminate"}:
                    self.store.write(
                        lambda conn, identity=identity, status=state["status"]: (
                            self.stop(conn, identity, status)
                        )
                    )
                    waiting = True
                    break
                data = json.loads(raw)
                task = self.plan(room, events).task
                if task is None or asdict(task) != data:
                    raise EngineError("DISCUSSION_RECONSTRUCTION_FAILED")
                config = self.adapter.bindings[self.adapter.row(run)[0]]
                self.store.write(
                    lambda conn, run=run, config=config, state=state: (
                        self.adapter.collaboration.settle(
                            conn, run, config, state["status"]
                        )
                    )
                )
                routing = self.store.write(
                    lambda conn, thread=thread, identity=identity: (
                        self.adapter.collaboration.routing(conn, thread, identity)
                    )
                )
                publication = native_policy().plan_publication(
                    room,
                    events,
                    task,
                    status="settled" if state["status"] == "succeeded" else "failed",
                    result={
                        "text": mention_text(
                            state.get("text", ""),
                            {a["handle"].casefold() for a in thread["agents"]}
                            | {"all", "everyone"},
                        )
                        + routing,
                        "error": "RUNTIME_FAILED",
                    },
                    local_profiles=[m["profile"] for m in room["members"]],
                )
                for event in publication.events:
                    events.append(
                        {"room_id": identity, "seq": len(events) + 1, **asdict(event)}
                    )

                def publish(conn, identity=identity, events=events, run=run):
                    current = conn.execute(
                        "SELECT status FROM nma_discussions WHERE owner_id=? AND discussion_id=?",
                        (self.store.owner, identity),
                    ).fetchone()
                    if current[0] != "active" or self.adapter.reliability.stopped(
                        conn, run
                    ):
                        return
                    conn.execute(
                        "UPDATE nma_discussions SET events=? WHERE owner_id=? AND discussion_id=?",
                        (canonical(events), self.store.owner, identity),
                    )
                    conn.execute(
                        "UPDATE nma_discussion_turns SET published=1 WHERE owner_id=? AND run_id=?",
                        (self.store.owner, run),
                    )

                self.store.write(publish)
            if waiting:
                continue
            decision = self.plan(room, events)
            if decision.task:
                try:
                    key, config = self.binding(thread, decision.task)
                except EngineError:
                    self.store.write(
                        lambda conn, identity=identity: self.stop(
                            conn, identity, "member_unavailable"
                        )
                    )
                    continue
                self.store.write(
                    lambda conn, identity=identity, task=decision.task, key=key, config=config: (
                        self.prepare_turn(conn, identity, task, key, config)
                    )
                )
            else:
                self.store.write(
                    lambda conn, decision=decision, identity=identity: conn.execute(
                        "UPDATE nma_discussions SET status=?,reason=? WHERE owner_id=? AND discussion_id=? AND status='active'",
                        (decision.status, decision.reason, self.store.owner, identity),
                    )
                )
        self.publish_states()
        from ngertiin_engine.collaboration_delivery import reconcile

        await reconcile(self.adapter)
        from ngertiin_engine.collaboration_native import project

        await asyncio.to_thread(project, self.adapter)
        await self.adapter.recover_run_stops(locked=True)

    def publish_states(self):
        def publish(conn):
            rows = conn.execute(
                "SELECT d.discussion_id,d.status,d.reason,t.run_id,b.config FROM nma_discussions d JOIN nma_discussion_turns t USING(owner_id,discussion_id) JOIN nma_adapter_runs r ON r.owner_id=t.owner_id AND r.run_id=t.run_id JOIN nma_adapter_bindings b ON b.owner_id=r.owner_id AND b.binding_id=r.binding_id WHERE d.owner_id=? AND d.rowid IN (SELECT MAX(rowid) FROM nma_discussions GROUP BY owner_id,thread_id) GROUP BY d.discussion_id",
                (self.store.owner,),
            ).fetchall()
            for identity, status, reason, run, raw in rows:
                state = {"discussion_id": identity, "status": status, "reason": reason}
                prior = conn.execute(
                    "SELECT payload FROM nma_events WHERE owner_id=? AND json_extract(payload,'$.type')='discussion.changed' AND json_extract(payload,'$.payload.discussion.discussion_id')=? ORDER BY sequence DESC LIMIT 1",
                    (self.store.owner, identity),
                ).fetchone()
                if prior and json.loads(prior[0])["payload"]["discussion"] == state:
                    continue
                self.adapter.reliability.append(
                    conn,
                    run,
                    json.loads(raw),
                    "discussion.changed",
                    {"discussion": state},
                )

        self.store.write(publish)

    def record_peer_failure(self, run, status):
        def record(conn):
            row = conn.execute(
                "SELECT b.config FROM nma_adapter_runs r JOIN nma_adapter_bindings b USING(owner_id,binding_id) WHERE r.owner_id=? AND r.run_id=?",
                (self.store.owner, run),
            ).fetchone()
            config = json.loads(row[0])
            for goal in self.adapter.goals.listing(conn, config["thread_id"], None):
                if goal["status"] not in {"active", "waiting"} or not any(
                    u["run_id"] == run for u in goal["units"]
                ):
                    continue
                self.adapter.goals.lifecycle.changed(conn, goal["goal_id"])
                self.adapter.goals.lifecycle.state(
                    conn, goal["goal_id"], "blocked", "Peer execution " + status
                )
                updated = next(
                    g
                    for g in self.adapter.goals.listing(conn, config["thread_id"], None)
                    if g["goal_id"] == goal["goal_id"]
                )
                self.adapter.reliability.append(
                    conn, run, config, "goal.changed", {"goal": updated}
                )

        self.store.write(record)
