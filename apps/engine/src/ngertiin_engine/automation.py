"""Durable script chains run by the existing Hermes gateway wake authority."""

import asyncio
import json
import os
import shlex
from pathlib import Path

from ngertiin_engine.contracts import EngineError, canonical, digest

DDL = (
    "CREATE TABLE nma_automation_jobs (owner_id TEXT NOT NULL, trigger_id TEXT NOT NULL, run_id TEXT NOT NULL, configuration TEXT NOT NULL, outputs TEXT NOT NULL, state TEXT NOT NULL, PRIMARY KEY(owner_id,trigger_id), FOREIGN KEY(owner_id,trigger_id) REFERENCES nma_triggers(owner_id,trigger_id), FOREIGN KEY(owner_id,run_id) REFERENCES nma_adapter_runs(owner_id,run_id))",
)


def validate(job):
    if (
        not isinstance(job, dict)
        or set(job) - {"mode", "steps", "context", "model", "skills", "lifetime"}
        or job.get("mode") not in {"script", "model"}
    ):
        raise EngineError("INVALID_AUTOMATION")
    if job.get("lifetime", "durable") not in {"durable", "session"}:
        raise EngineError("INVALID_AUTOMATION")
    if (
        not isinstance(job.get("context", ""), str)
        or len(job.get("context", "")) > 16000
    ):
        raise EngineError("INVALID_AUTOMATION")
    if "model" in job and (not isinstance(job["model"], str) or not job["model"]):
        raise EngineError("INVALID_AUTOMATION")
    if "skills" in job and (
        not isinstance(job["skills"], list)
        or len(job["skills"]) > 32
        or any(not isinstance(s, str) for s in job["skills"])
    ):
        raise EngineError("INVALID_AUTOMATION")
    if job["mode"] == "model":
        if "steps" in job:
            raise EngineError("INVALID_AUTOMATION")
        return dict(job)
    if set(job) & {"model", "skills"}:
        raise EngineError("INVALID_AUTOMATION")
    steps = job.get("steps")
    if not isinstance(steps, list) or not 1 <= len(steps) <= 32:
        raise EngineError("INVALID_AUTOMATION")
    seen = set()
    for step in steps:
        if not isinstance(step, dict) or set(step) != {"id", "command", "depends_on"}:
            raise EngineError("INVALID_AUTOMATION")
        identity = step["id"]
        if (
            not isinstance(identity, str)
            or not identity
            or len(identity) > 100
            or identity in seen
            or not isinstance(step["command"], str)
            or not 1 <= len(step["command"]) <= 16000
        ):
            raise EngineError("INVALID_AUTOMATION")
        deps = step["depends_on"]
        if not isinstance(deps, list) or any(
            not isinstance(d, str) or d not in seen for d in deps
        ):
            raise EngineError("INVALID_AUTOMATION_DEPENDENCY")
        seen.add(identity)
    return dict(job)


class Automations:
    def __init__(self, adapter):
        self.adapter, self.store = adapter, adapter.store
        self.tasks = {}
        self.resources = {}
        self.cancelling = set()

    def tick(self):
        rows = self.store.write(
            lambda c: c.execute(
                "SELECT j.trigger_id,j.run_id,j.configuration,j.outputs,t.status FROM nma_automation_jobs j JOIN nma_triggers t USING(owner_id,trigger_id) WHERE j.owner_id=? AND j.state='running'",
                (self.store.owner,),
            ).fetchall()
        )
        for trigger, run, raw, outputs, status in rows:
            stopped = self.store.write(
                lambda c, run=run: self.adapter.reliability.stopped(c, run)
            )
            if stopped and trigger in self.resources and trigger not in self.cancelling:
                self.cancelling.add(trigger)
                broker, scope = self.resources[trigger]
                asyncio.create_task(asyncio.to_thread(broker.cancel, scope))
            if trigger not in self.tasks:
                task = asyncio.create_task(
                    asyncio.to_thread(
                        self.execute, trigger, run, json.loads(raw), json.loads(outputs)
                    )
                )
                self.tasks[trigger] = task
                task.add_done_callback(
                    lambda task, key=trigger: self.finished(key, task)
                )

    def finished(self, key, task):
        self.tasks.pop(key, None)
        self.resources.pop(key, None)
        self.cancelling.discard(key)
        # Persist known failures; never leave an unobserved task exception.
        if not task.cancelled() and task.exception():
            self.fail(key, "AUTOMATION_EXECUTION_FAILED")

    def fail(self, trigger, reason):
        from ngertiin_engine.goal_lifecycle import Lifecycle

        def record(conn):
            row = conn.execute(
                "SELECT j.run_id,j.configuration,d.goal_id,u.generation,g.generation,l.status FROM nma_automation_jobs j JOIN nma_triggers t USING(owner_id,trigger_id) JOIN nma_trigger_definitions d USING(owner_id,definition_id) JOIN nma_goals g USING(owner_id,goal_id) JOIN nma_goal_lifecycle l USING(owner_id,goal_id) JOIN nma_goal_units u ON u.owner_id=j.owner_id AND u.run_id=j.run_id AND u.goal_id=g.goal_id WHERE j.owner_id=? AND j.trigger_id=? AND j.state='running'",
                (self.store.owner, trigger),
            ).fetchone()
            if not row:
                return
            run, raw, goal, generation, current, status = row
            terminal = (
                "indeterminate"
                if reason == "indeterminate"
                else "cancelled"
                if reason == "ACCESS_REVOKED"
                else "failed"
            )
            conn.execute(
                "UPDATE nma_automation_jobs SET state=? WHERE owner_id=? AND trigger_id=?",
                (terminal, self.store.owner, trigger),
            )
            conn.execute(
                "UPDATE nma_triggers SET status='settled' WHERE owner_id=? AND trigger_id=?",
                (self.store.owner, trigger),
            )
            conn.execute(
                "INSERT OR IGNORE INTO nma_run_terminals VALUES (?,?,?)",
                (self.store.owner, run, terminal),
            )
            self.adapter.reliability.append(
                conn,
                run,
                json.loads(raw),
                "run." + terminal,
                {"status": terminal, "error_code": reason, "execution_kind": "script"},
            )
            conn.execute(
                "UPDATE nma_goal_units SET settled=1 WHERE owner_id=? AND run_id=?",
                (self.store.owner, run),
            )
            if generation == current and status in {"active", "waiting"}:
                lifecycle = Lifecycle(self.store)
                lifecycle.changed(conn, goal)
                lifecycle.state(conn, goal, "blocked", reason)
                from ngertiin_engine.goal_commands import GoalCommands

                self.adapter.reliability.append(
                    conn,
                    run,
                    json.loads(raw),
                    "goal.changed",
                    {"goal": GoalCommands(self.adapter).get(conn, goal)},
                )

        self.store.write(record)

    def execute(self, trigger, run, config, outputs):
        from tools.registry import registry

        from ngertiin_engine.goal_lifecycle import Lifecycle
        from ngertiin_engine.native_executor import UnknownOutcome
        from ngertiin_engine.native_surface import binding
        from ngertiin_engine.transcript import Transcript

        marker = config["nma_capabilities"]
        from toolsets import resolve_toolset

        if "terminal" not in {
            name for toolset in marker["toolsets"] for name in resolve_toolset(toolset)
        }:
            raise EngineError("CAPABILITY_DENIED")
        _, broker, scope = binding(
            marker,
            config,
            Path(os.environ["HERMES_HOME"]) / "state.db",
            self.store.owner,
        )

        self.resources[trigger] = (broker, scope)

        def authorize(conn=None):
            from ngertiin_engine.capabilities import authorize as authorize_capabilities

            authorize_capabilities(
                marker, Path(os.environ["HERMES_HOME"]) / "state.db", self.store.owner
            )

            def read(conn):
                row = conn.execute(
                    "SELECT d.state,u.generation,d.context_generation,g.generation,t.context_generation,l.status,j.state,r.status,r.definition_revision,d.revision FROM nma_automation_jobs j JOIN nma_triggers r USING(owner_id,trigger_id) JOIN nma_trigger_definitions d USING(owner_id,definition_id) JOIN nma_goals g USING(owner_id,goal_id) JOIN nma_threads t USING(owner_id,thread_id) JOIN nma_goal_lifecycle l USING(owner_id,goal_id) JOIN nma_goal_units u ON u.owner_id=j.owner_id AND u.run_id=j.run_id AND u.goal_id=g.goal_id WHERE j.owner_id=? AND j.trigger_id=?",
                    (self.store.owner, trigger),
                ).fetchone()
                if (
                    not row
                    or row[0] != "enabled"
                    or row[1] != row[3]
                    or row[2] != row[4]
                    or row[5] not in {"active", "waiting"}
                    or row[6] != "running"
                    or row[7] != "admitted"
                    or row[8] != row[9]
                    or self.adapter.reliability.stopped(conn, run)
                ):
                    raise EngineError("ACCESS_REVOKED")
                agent = self.adapter.agents.get(conn, config["agent_id"])
                if (
                    agent["access_generation"] != config["access_generation"]
                    or agent["status"] != "active"
                ):
                    raise EngineError("ACCESS_REVOKED")
                self.adapter.threads.check_binding(conn, config)

            if conn is None:
                self.store.write(read)
            else:
                read(conn)

        try:
            for step in config["automation"]["steps"]:
                if step["id"] in outputs:
                    continue
                dependencies = {key: outputs[key] for key in step["depends_on"]}
                command = (
                    "NMA_DEPENDENCY_RESULTS="
                    + shlex.quote(canonical(dependencies))
                    + " "
                    + "sh -c "
                    + shlex.quote(step["command"])
                )
                authorize()
                value = broker.invoke(
                    scope,
                    digest([trigger, step["id"]]),
                    "terminal",
                    {"command": command, "timeout": 60},
                    schema_hash=digest(registry.get_entry("terminal").schema),
                    allowed_tools={"terminal"},
                    authorize=authorize,
                    admission_id="automation:" + trigger,
                    timeout=90,
                )
                receipt = broker.receipt(scope, digest([trigger, step["id"]]))
                if not receipt or receipt["state"] not in {"returned"}:
                    raise UnknownOutcome("Unknown script effect")
                result = json.loads(value)
                if result.get(
                    "exit_code", result.get("exitCode", 0)
                ) != 0 or result.get("error"):
                    raise EngineError("AUTOMATION_SCRIPT_FAILED")
                outputs[step["id"]] = result
                self.store.write(
                    lambda c: c.execute(
                        "UPDATE nma_automation_jobs SET outputs=? WHERE owner_id=? AND trigger_id=?",
                        (canonical(outputs), self.store.owner, trigger),
                    )
                )
            authorize()

            def settle(conn):
                authorize(conn)
                conn.execute(
                    "UPDATE nma_automation_jobs SET state='completed' WHERE owner_id=? AND trigger_id=?",
                    (self.store.owner, trigger),
                )
                conn.execute(
                    "UPDATE nma_triggers SET status='settled' WHERE owner_id=? AND trigger_id=?",
                    (self.store.owner, trigger),
                )
                conn.execute(
                    "INSERT OR IGNORE INTO nma_run_terminals VALUES (?,?,'succeeded')",
                    (self.store.owner, run),
                )
                self.adapter.reliability.append(
                    conn,
                    run,
                    config,
                    "run.succeeded",
                    {
                        "status": "succeeded",
                        "usage": {},
                        "execution_kind": "script",
                        "outputs": outputs,
                    },
                )
                text = canonical(outputs)
                final_output = outputs[config["automation"]["steps"][-1]["id"]]
                if str(final_output.get("output", "")).strip() != "[SILENT]":
                    Transcript(self.store).append(conn, run, config, "agent", text)
                goal = conn.execute(
                    "SELECT goal_id FROM nma_trigger_definitions WHERE owner_id=? AND definition_id=(SELECT definition_id FROM nma_triggers WHERE owner_id=? AND trigger_id=?)",
                    (self.store.owner, self.store.owner, trigger),
                ).fetchone()[0]
                Lifecycle(self.store).state(
                    conn,
                    goal,
                    "waiting",
                    "Automation completed",
                    "Next scheduled occurrence",
                )
                conn.execute(
                    "UPDATE nma_goal_units SET settled=1,verdict='wait' WHERE owner_id=? AND run_id=?",
                    (self.store.owner, run),
                )
                from ngertiin_engine.goal_commands import GoalCommands

                self.adapter.reliability.append(
                    conn,
                    run,
                    config,
                    "goal.changed",
                    {"goal": GoalCommands(self.adapter).get(conn, goal)},
                )

            self.store.write(settle)
        except (EngineError, UnknownOutcome) as exc:
            broker.cancel(scope)
            self.fail(
                trigger, exc.code if isinstance(exc, EngineError) else "indeterminate"
            )


def blueprint(args):
    """Fill the pinned native catalog without calling its job registrar."""
    from cron.blueprint_catalog import BlueprintFillError, fill_blueprint, get_blueprint

    if set(args) != {
        "action",
        "goal_id",
        "expected_revision",
        "blueprint",
        "values",
        "timezone",
    } or not isinstance(args["values"], dict):
        raise EngineError("INVALID_REQUEST")
    item = get_blueprint(args["blueprint"])
    if item is None:
        raise EngineError("BLUEPRINT_NOT_FOUND")
    try:
        spec = fill_blueprint(item, args["values"])
    except (BlueprintFillError, TypeError, ValueError) as exc:
        raise EngineError("INVALID_BLUEPRINT_VALUES") from exc
    if spec["deliver"] != "origin":
        raise EngineError("EXTERNAL_DELIVERY_UNAVAILABLE")
    # Skills are selected explicitly from this agent's assigned IDs by the agent;
    # catalog skill names are prompt references, never new grants.
    context = (
        spec["prompt"]
        + "\nSuggested native skills: "
        + canonical(spec.get("skills", []))
    )
    return {
        "action": "schedule",
        "goal_id": args["goal_id"],
        "expected_revision": args["expected_revision"],
        "wake": {
            "kind": "cron",
            "expression": spec["schedule"],
            "timezone": args["timezone"],
            "missed_policy": "coalesce",
            "job": {"mode": "model", "context": context},
        },
    }


def continuation_binding(adapter, key, config, parent_run):
    """Carry the producing occurrence's job selection through linked work.

    Resolve against the current owner catalog and grants rather than reusing stale
    credentials or looking up a possibly replaced schedule definition.
    """
    previous = adapter.store.write(
        lambda c: c.execute(
            "SELECT b.config FROM nma_adapter_runs r JOIN nma_adapter_bindings b USING(owner_id,binding_id) WHERE r.owner_id=? AND r.run_id=?",
            (adapter.owner, parent_run),
        ).fetchone()
    )
    job = json.loads(previous[0]).get("automation") if previous else None
    return job_binding(adapter, key, config, job)


def job_binding(adapter, key, config, job):
    """Freeze an owner-local job route without editing the persistent agent."""
    if not job or job["mode"] == "script":
        return key, config
    from ngertiin_engine.capabilities import resolve
    from ngertiin_engine.inference_config import validate as inference

    value = dict(config)
    if "model" in job:
        model = adapter.connections.catalog().get(job["model"])
        if not model:
            raise EngineError("MODEL_UNAVAILABLE")
        for field in ("model", "provider", "base_url", "cwd"):
            value[field] = model[field]
        value["nma_provider"] = model
        value["inference"] = inference({}, adapter.connections.catalog(), job["model"])
    if "skills" in job:
        grants = value.get("nma_capabilities", {}).get("grants", {})
        if not set(job["skills"]) <= set(grants.get("skill_refs", [])):
            raise EngineError("CAPABILITY_DENIED")
        selected = {**grants, "skill_refs": job["skills"]}
        resolved, _ = resolve(selected)
        value["persona"] = (
            value.get("persona", "")
            + "\nJob-selected skills:\n"
            + "\n".join(resolved["skills"])
        )
    value["automation"] = job
    job_key = digest(["automation-binding-v1", key, job])
    adapter.store.write(
        lambda c: c.execute(
            "INSERT OR IGNORE INTO nma_adapter_bindings VALUES (?,?,?,?,NULL)",
            (adapter.owner, job_key, digest(value), canonical(value)),
        )
    )
    adapter.bindings[job_key] = value
    return job_key, value
