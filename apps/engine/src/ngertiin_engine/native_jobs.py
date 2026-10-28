"""Observe native process receipts inside the existing Hermes gateway lifecycle."""

import json
import os
import sqlite3
from pathlib import Path

from ngertiin_engine.contracts import EngineError, canonical
from ngertiin_engine.native_executor import IsolatedTools, Scope


def reconcile(adapter):
    from ngertiin_engine.capabilities import FIELDS, resolve
    from ngertiin_engine.reliability import Reliability

    home = Path(os.environ["HERMES_HOME"])
    for path in (home / "native-execution").glob("*/isolated-tools.db"):
        with sqlite3.connect(path) as conn:
            image = conn.execute(
                "SELECT value FROM metadata WHERE key='image'"
            ).fetchone()
            rows = conn.execute("SELECT scope_json,state FROM scopes").fetchall()
        if not image:
            continue
        broker = IsolatedTools(path.parent, adapter.owner, image=image[0])
        for encoded, state in rows:
            scope = Scope(**json.loads(encoded))
            try:
                child = adapter.store.write(
                    lambda conn, scope=scope: conn.execute(
                        "SELECT c.child_session_id,c.status,b.config FROM nma_delegated_children c JOIN nma_adapter_runs r ON r.owner_id=c.owner_id AND r.run_id=c.root_run_id JOIN nma_adapter_bindings b USING(owner_id,binding_id) WHERE c.owner_id=? AND json_extract(c.descriptor,'$.resource_agent_id')=?",
                        (adapter.owner, scope.agent_id),
                    ).fetchone()
                )
                agent_id = json.loads(child[2])["agent_id"] if child else scope.agent_id
                if child and child[1] not in {"running", "completed", "schema_invalid"}:
                    raise EngineError("ACCESS_REVOKED")
                thread, agent = adapter.store.write(
                    lambda conn, scope=scope, agent_id=agent_id: (
                        adapter.context.scope(conn, agent_id, scope.thread_id),
                        adapter.agents.get(conn, agent_id),
                    )
                )
                grants = {k: agent["config"].get(k, []) for k in FIELDS}
                resolved, _ = resolve(grants)
                from ngertiin_engine.native_surface import binding

                marker = {
                    **resolved,
                    "grants": grants,
                    "agent_id": agent_id,
                    "access_generation": agent["access_generation"],
                }
                _, _, current = binding(
                    marker,
                    {
                        "thread_id": scope.thread_id,
                        "context_generation": thread["context_generation"],
                        **({"child_session_id": child[0]} if child else {}),
                    },
                    home / "state.db",
                    adapter.owner,
                )
                if state == "ready" and current.key != scope.key:
                    broker.cancel(scope)
                    continue
            except EngineError:
                if state == "ready":
                    broker.cancel(scope)
                    continue
            with broker._db() as conn:
                active = conn.execute(
                    "SELECT 1 FROM jobs WHERE scope_key=? AND state='running'",
                    (scope.key,),
                ).fetchone()
            if active and state == "ready":
                receipts = broker.status(scope)
            else:
                with broker._db() as conn:
                    receipts = [
                        json.loads(row[0])
                        for row in conn.execute(
                            "SELECT receipt FROM jobs WHERE scope_key=?", (scope.key,)
                        )
                    ]
            for job in receipts:

                def record(conn, scope=scope, job=job):
                    if conn.execute(
                        "SELECT 1 FROM nma_native_job_events WHERE owner_id=? AND scope_key=? AND handle=? AND state=?",
                        (adapter.owner, scope.key, job["handle"], job["state"]),
                    ).fetchone():
                        return
                    origin = conn.execute(
                        "SELECT r.run_id,b.config FROM nma_adapter_runs r JOIN nma_adapter_bindings b USING(owner_id,binding_id) WHERE r.owner_id=? AND r.native_admission_id=?",
                        (adapter.owner, job.get("native_admission_id")),
                    ).fetchone()
                    if origin:
                        Reliability(adapter.store).append(
                            conn,
                            origin[0],
                            json.loads(origin[1]),
                            "workspace.process." + job["state"],
                            job,
                        )
                    conn.execute(
                        "INSERT INTO nma_native_job_events VALUES (?,?,?,?,?)",
                        (
                            adapter.owner,
                            scope.key,
                            job["handle"],
                            job["state"],
                            canonical(job),
                        ),
                    )

                adapter.store.write(record)
