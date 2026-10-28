"""Structured peer handoffs and review inside the existing native discussion."""

import json
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import EngineError, canonical, digest, uuid
from ngertiin_engine.redaction import result as redact

DDL = (
    "CREATE TABLE nma_collaboration_tasks (owner_id TEXT NOT NULL, task_id TEXT NOT NULL, thread_id TEXT NOT NULL, discussion_id TEXT NOT NULL, revision INTEGER NOT NULL, task TEXT NOT NULL, PRIMARY KEY(owner_id,task_id), FOREIGN KEY(owner_id,thread_id) REFERENCES nma_threads(owner_id,thread_id), FOREIGN KEY(owner_id,discussion_id) REFERENCES nma_discussions(owner_id,discussion_id))",
    "CREATE TABLE nma_collaboration_operations (owner_id TEXT NOT NULL, operation_id TEXT NOT NULL, intent_digest TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(owner_id,operation_id), FOREIGN KEY(owner_id) REFERENCES nma_partition(owner_id))",
    "CREATE TABLE nma_collaboration_units (owner_id TEXT NOT NULL, task_id TEXT NOT NULL, task_revision INTEGER NOT NULL, run_id TEXT NOT NULL, source_message_id TEXT NOT NULL, settled INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(owner_id,task_id,task_revision), UNIQUE(owner_id,run_id), FOREIGN KEY(owner_id,task_id) REFERENCES nma_collaboration_tasks(owner_id,task_id), FOREIGN KEY(owner_id,run_id) REFERENCES nma_adapter_runs(owner_id,run_id), FOREIGN KEY(owner_id,source_message_id) REFERENCES nma_messages(owner_id,message_id))",
)

SCHEMA = {
    "name": "collaboration",
    "description": "Manage durable tasks with persistent members of this group: list; handoff with assignee handle, expected_result and optional dependencies/artifact_ids/goal_id; submit a task result with summary, artifact_ids and optional reviewer; review with decision approve/request_changes and summary; block/unblock. Mutations of existing tasks require task_id and its latest expected_revision. A handoff is pending until its peer runs; a submission/review is verified after this turn settles. Temporary delegate_task children cannot use this tool.",
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["list", "handoff", "submit", "review", "block", "unblock"],
            },
            "task_id": {"type": "string"},
            "expected_revision": {"type": "string"},
            "assignee": {"type": "string"},
            "creation_key": {"type": "string", "maxLength": 200},
            "expected_result": {"type": "string"},
            "summary": {"type": "string"},
            "reviewer": {"type": "string"},
            "decision": {"type": "string", "enum": ["approve", "request_changes"]},
            "goal_id": {"type": "string"},
            "dependencies": {
                "type": "array",
                "items": {"type": "string"},
                "maxItems": 32,
            },
            "artifact_ids": {
                "type": "array",
                "items": {"type": "string"},
                "maxItems": 32,
            },
        },
        "required": ["action"],
        "additionalProperties": False,
    },
}

PROMPT = """Use collaboration for concrete peer tasks, expected deliverables, shared artifact
references, dependencies and review. A textual mention alone is not evidence of
completed handoff work. Inspect tasks before creating another. When assigned work,
produce its result and submit it; select a reviewer when review is needed. A reviewer
must inspect the shared result/artifacts before approving or requesting changes.
Requested changes return to the original implementer. A task result is verified only
after its admitted turn succeeds. Goals keep their original lifecycle owner.
"""


def cancel_tasks(store, conn, discussion, reason):
    from ngertiin_engine.reliability import Reliability

    rows = conn.execute(
        "SELECT t.task_id,t.revision,t.task,b.config FROM nma_collaboration_tasks t JOIN nma_adapter_runs r ON r.owner_id=t.owner_id AND r.run_id=json_extract(t.task,'$.source_run_id') JOIN nma_adapter_bindings b USING(owner_id,binding_id) WHERE t.owner_id=? AND t.discussion_id=? AND json_extract(t.task,'$.status') NOT IN ('completed','cancelled')",
        (store.owner, discussion),
    ).fetchall()
    for task_id, revision, raw, config in rows:
        task = json.loads(raw)
        task.update(status="cancelled", block_reason=reason)
        task["history"].append(
            {"run_id": task["source_run_id"], "status": "cancelled", "summary": reason}
        )
        conn.execute(
            "UPDATE nma_collaboration_tasks SET revision=revision+1,task=? WHERE owner_id=? AND task_id=?",
            (canonical(task), store.owner, task_id),
        )
        Reliability(store).append(
            conn,
            task["source_run_id"],
            json.loads(config),
            "collaboration.changed",
            {"task": {**task, "task_id": task_id, "revision": str(revision + 1)}},
        )


class Collaboration:
    def __init__(self, adapter):
        self.adapter, self.store = adapter, adapter.store

    def listing(self, conn, thread_id, *, limit=100):
        return [
            {**json.loads(raw), "task_id": task_id, "revision": str(revision)}
            for task_id, revision, raw in conn.execute(
                "SELECT task_id,revision,task FROM nma_collaboration_tasks WHERE owner_id=? AND thread_id=? ORDER BY rowid DESC LIMIT ?",
                (self.store.owner, thread_id, limit if limit is not None else -1),
            ).fetchall()
        ]

    def get(self, conn, thread_id, task_id):
        uuid(task_id)
        row = conn.execute(
            "SELECT revision,task FROM nma_collaboration_tasks WHERE owner_id=? AND thread_id=? AND task_id=?",
            (self.store.owner, thread_id, task_id),
        ).fetchone()
        if row is None:
            raise EngineError("NOT_FOUND")
        return {**json.loads(row[1]), "task_id": task_id, "revision": str(row[0])}

    def save(self, conn, task, run, config):
        revision = int(task["revision"]) + 1
        value = {k: v for k, v in task.items() if k not in {"task_id", "revision"}}
        conn.execute(
            "UPDATE nma_collaboration_tasks SET revision=?,task=? WHERE owner_id=? AND task_id=? AND revision=?",
            (
                revision,
                canonical(redact(value)),
                self.store.owner,
                task["task_id"],
                int(task["revision"]),
            ),
        )
        task = {**task, "revision": str(revision)}
        self.adapter.reliability.append(
            conn, run, config, "collaboration.changed", {"task": task}
        )
        return task

    def tool(self, stamp, arguments, ids):
        import jsonschema

        def write(conn):
            row = self.adapter.reliability.check(conn, stamp)
            if not row or stamp.get("child_session_id"):
                raise EngineError("ACCESS_REVOKED")
            config = json.loads(row[1])
            thread = self.adapter.threads.get(conn, config["thread_id"])
            if thread["kind"] != "group":
                raise EngineError("GROUP_UNAVAILABLE")
            turn = conn.execute(
                "SELECT d.discussion_id,d.status FROM nma_discussion_turns t JOIN nma_discussions d USING(owner_id,discussion_id) WHERE t.owner_id=? AND t.run_id=?",
                (self.store.owner, row[0]),
            ).fetchone()
            if not turn:
                turn = conn.execute(
                    "SELECT t.discussion_id,d.status FROM nma_collaboration_units u JOIN nma_collaboration_tasks t USING(owner_id,task_id) JOIN nma_discussions d USING(owner_id,discussion_id) WHERE u.owner_id=? AND u.run_id=?",
                    (self.store.owner, row[0]),
                ).fetchone()
            if not turn or turn[1] == "cancelled":
                raise EngineError("ACCESS_REVOKED")
            jsonschema.validate(arguments, SCHEMA["parameters"])
            operation = digest([ids.turn_id, ids.tool_call_id, "collaboration"])
            previous = conn.execute(
                "SELECT intent_digest,result FROM nma_collaboration_operations WHERE owner_id=? AND operation_id=?",
                (self.store.owner, operation),
            ).fetchone()
            if previous:
                if previous[0] != digest(arguments):
                    raise EngineError("EFFECT_CONFLICT")
                return previous[1]
            result = self.apply(
                conn, arguments, row[0], config, thread, turn[0], operation
            )
            encoded = canonical(redact(result))
            conn.execute(
                "INSERT INTO nma_collaboration_operations VALUES (?,?,?,?)",
                (self.store.owner, operation, digest(arguments), encoded),
            )
            return encoded

        try:
            return self.store.write(write)
        except EngineError as error:
            return canonical({"error": error.code, "outcome": "rejected"})
        except (ValueError, KeyError, TypeError, jsonschema.ValidationError):
            return canonical({"error": "INVALID_REQUEST", "outcome": "rejected"})

    def apply(self, conn, p, run, config, thread, discussion, operation):
        action = p["action"]
        if action == "list":
            return {"tasks": self.listing(conn, thread["thread_id"])}

        def member(handle):
            selected = next(
                (
                    a
                    for a in thread["agents"]
                    if a["handle"].casefold() == handle.removeprefix("@").casefold()
                ),
                None,
            )
            if selected is None:
                raise EngineError("INVALID_MENTION")
            return selected["agent_id"]

        artifact_ids = p.get("artifact_ids", [])
        from ngertiin_engine.artifacts import Artifacts

        for artifact_id in artifact_ids:
            Artifacts(self.store).get(conn, artifact_id, thread_id=thread["thread_id"])
        if action == "handoff":
            if not 1 <= len(p["expected_result"].strip()) <= 8000:
                raise EngineError("INVALID_REQUEST")
            dependencies = list(dict.fromkeys(p.get("dependencies", [])))
            for dependency in dependencies:
                self.get(conn, thread["thread_id"], dependency)
            goal_id = p.get("goal_id")
            if goal_id and not any(
                g["goal_id"] == goal_id
                and g["status"] not in {"stopped", "paused", "completed"}
                for g in self.adapter.goals.listing(conn, thread["thread_id"], None)
            ):
                raise EngineError("NOT_FOUND")
            assignee = member(p["assignee"])
            creation_key = p.get("creation_key") or digest(
                [assignee, p["expected_result"], dependencies, goal_id]
            )
            identity = str(
                uuid5(
                    NAMESPACE_URL,
                    canonical([self.store.owner, discussion, creation_key]),
                )
            )
            existing = conn.execute(
                "SELECT 1 FROM nma_collaboration_tasks WHERE owner_id=? AND task_id=?",
                (self.store.owner, identity),
            ).fetchone()
            if existing:
                prior = self.get(conn, thread["thread_id"], identity)
                if (
                    prior["expected_result"] != p["expected_result"]
                    or prior["implementer_agent_id"] != assignee
                    or prior["dependencies"] != dependencies
                    or prior["goal_id"] != goal_id
                    or prior["source_artifact_ids"] != artifact_ids
                ):
                    raise EngineError("TASK_CONFLICT")
                return {"task": prior}
            task = {
                "thread_id": thread["thread_id"],
                "discussion_id": discussion,
                "creator_agent_id": config["agent_id"],
                "membership_revision": thread["membership_revision"],
                "assignee_agent_id": assignee,
                "implementer_agent_id": assignee,
                "reviewer_agent_id": None,
                "expected_result": p["expected_result"],
                "artifact_ids": artifact_ids,
                "source_artifact_ids": artifact_ids,
                "dependencies": dependencies,
                "goal_id": goal_id,
                "status": "pending",
                "summary": "",
                "result_run_id": None,
                "source_run_id": run,
                "decision": None,
                "history": [],
            }
            conn.execute(
                "INSERT INTO nma_collaboration_tasks VALUES (?,?,?,?,1,?)",
                (
                    self.store.owner,
                    identity,
                    thread["thread_id"],
                    discussion,
                    canonical(task),
                ),
            )
            task = {**task, "task_id": identity, "revision": "1"}
        else:
            task = self.get(conn, thread["thread_id"], p["task_id"])
            if task["revision"] != p.get("expected_revision"):
                raise EngineError("REVISION_CONFLICT")
            if task["assignee_agent_id"] != config["agent_id"]:
                raise EngineError("TASK_OWNERSHIP_REQUIRED")
            if action == "submit":
                if task["status"] not in {
                    "pending",
                    "changes_requested",
                } or not self.dependencies_ready(conn, task):
                    raise EngineError("TASK_NOT_READY")
                if not 1 <= len(p["summary"].strip()) <= 8000:
                    raise EngineError("INVALID_REQUEST")
                reviewer = member(p["reviewer"]) if p.get("reviewer") else None
                if reviewer == config["agent_id"]:
                    raise EngineError("INDEPENDENT_REVIEW_REQUIRED")
                task.update(
                    submitted_from_status=task["status"],
                    status="submitting",
                    summary=p["summary"],
                    artifact_ids=artifact_ids,
                    result_run_id=run,
                    reviewer_agent_id=reviewer,
                )
            elif action == "review":
                if (
                    task["status"] != "review"
                    or task["reviewer_agent_id"] != config["agent_id"]
                ):
                    raise EngineError("TASK_NOT_READY")
                if not 1 <= len(p["summary"].strip()) <= 8000:
                    raise EngineError("INVALID_REQUEST")
                task.update(
                    status="reviewing",
                    decision=p["decision"],
                    review_summary=p["summary"],
                    review_run_id=run,
                )
            elif action == "block":
                if task["status"] not in {"pending", "changes_requested", "review"}:
                    raise EngineError("TASK_NOT_READY")
                if not 1 <= len(p["summary"].strip()) <= 8000:
                    raise EngineError("INVALID_REQUEST")
                task.update(
                    resume_status=task["status"],
                    status="blocked",
                    block_reason=p["summary"],
                )
                task["history"].append(
                    {"run_id": run, "status": "blocked", "summary": p["summary"]}
                )
            elif action == "unblock":
                if task["status"] != "blocked":
                    raise EngineError("TASK_NOT_READY")
                task["status"] = task.pop("resume_status")
                task["history"].append(
                    {"run_id": run, "status": "unblocked", "summary": "Task unblocked"}
                )
            else:
                raise EngineError("INVALID_REQUEST")
            return {"task": self.save(conn, task, run, config)}
        self.adapter.reliability.append(
            conn, run, config, "collaboration.changed", {"task": task}
        )
        return {"task": task}

    def dependencies_ready(self, conn, task):
        return all(
            self.get(conn, task["thread_id"], dep)["status"] == "completed"
            for dep in task["dependencies"]
        )

    def prompt(self, conn, thread_id, agent_id):
        tasks = [
            t
            for t in self.listing(conn, thread_id, limit=None)
            if t["assignee_agent_id"] == agent_id
            and t["status"] in {"pending", "changes_requested", "review"}
            and self.dependencies_ready(conn, t)
        ]
        return "\n\n" + PROMPT + "\nAssigned tasks (data):\n" + canonical(tasks)

    def settle(self, conn, run, config, status):
        for task in self.listing(conn, config["thread_id"], limit=None):
            relevant = (
                task["status"] == "submitting" and task["result_run_id"] == run
            ) or (task["status"] == "reviewing" and task.get("review_run_id") == run)
            if not relevant:
                continue
            if status != "succeeded":
                task.update(
                    resume_status="review"
                    if task["status"] == "reviewing"
                    else task.get("submitted_from_status", "pending"),
                    status="cancelled" if status == "cancelled" else "blocked",
                    block_reason="Task execution " + status,
                )
            elif task["status"] == "submitting":
                task["status"] = "review" if task["reviewer_agent_id"] else "completed"
                task["assignee_agent_id"] = (
                    task["reviewer_agent_id"] or task["implementer_agent_id"]
                )
            else:
                task["status"] = (
                    "completed"
                    if task["decision"] == "approve"
                    else "changes_requested"
                )
                task["assignee_agent_id"] = task["implementer_agent_id"]
            task["history"].append(
                {
                    "run_id": run,
                    "actor_agent_id": config["agent_id"],
                    "reviewer_agent_id": task["reviewer_agent_id"],
                    "artifact_ids": task["artifact_ids"],
                    "status": task["status"],
                    "summary": task.get("review_summary")
                    if task.get("review_run_id") == run
                    else task["summary"],
                }
            )
            self.save(conn, task, run, config)

    def routing(self, conn, thread, discussion):
        active = {a["agent_id"]: a["handle"] for a in thread["agents"]}
        tasks = [
            t
            for t in self.listing(conn, thread["thread_id"], limit=None)
            if t["discussion_id"] == discussion
            and t["status"] in {"pending", "changes_requested", "review"}
            and t["assignee_agent_id"] in active
            and self.dependencies_ready(conn, t)
        ]
        return (
            "\n" + " ".join("@" + active[t["assignee_agent_id"]] for t in tasks)
            if tasks
            else ""
        )


def install():
    import model_tools
    from gateway.session_policy import active_policy
    from tools.registry import registry

    registry.register(
        name="collaboration",
        toolset="nma_collaboration",
        schema=SCHEMA,
        handler=lambda args, **kw: canonical({"error": "NOT_FOUND"}),
    )
    original = model_tools.get_tool_definitions

    def definitions(*args, **kwargs):
        values = original(*args, **kwargs)
        policy = active_policy()
        config = policy.config(secrets=False) if policy else {}
        if config.get("nma_context") and not config.get("nma_child_session_id"):
            return [*values, {"type": "function", "function": SCHEMA}]
        return values

    model_tools.get_tool_definitions = definitions
