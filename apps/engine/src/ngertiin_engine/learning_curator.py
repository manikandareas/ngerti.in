"""Run native deterministic skill maintenance from the gateway's own chore."""

import json
import time
from datetime import datetime

from ngertiin_engine.context import now


def maintain(learning, *, clock=None, force=False):
    from agent import curator
    from tools import skill_usage

    clock = time.time() if clock is None else clock
    if not curator.is_enabled() or curator.is_paused():
        return {"status": "disabled"}
    if curator.get_consolidate():
        return {
            "status": "setup_required",
            "reason": "scoped_curator_consolidation_required",
        }
    interval = curator.get_interval_hours() * 3600

    def operation(conn):
        rows = conn.execute(
            "SELECT DISTINCT e.namespace,m.agent_id,m.thread_id FROM nma_skill_entries e JOIN nma_memberships m ON m.owner_id=e.owner_id JOIN nma_threads t ON t.owner_id=m.owner_id AND t.thread_id=m.thread_id JOIN nma_agents a ON a.owner_id=m.owner_id AND a.agent_id=m.agent_id WHERE e.owner_id=? AND e.status='active' AND m.status='active' AND t.status='open' AND a.status='active' AND ((e.namespace='agent:'||m.agent_id AND t.kind='dm') OR e.namespace='thread:'||m.thread_id) ORDER BY e.namespace,m.thread_id",
            (learning.store.owner,),
        ).fetchall()
        seen, reports = set(), []
        for ns, agent_id, thread_id in rows:
            if ns in seen:
                continue
            seen.add(ns)
            previous = conn.execute(
                "SELECT last_run FROM nma_learning_maintenance WHERE owner_id=? AND namespace=?",
                (learning.store.owner, ns),
            ).fetchone()
            if not force and not previous:
                conn.execute(
                    "INSERT INTO nma_learning_maintenance VALUES (?,?,?,?)",
                    (learning.store.owner, ns, clock, '{"seeded":true}'),
                )
                continue
            if not force and previous and previous[0] + interval > clock:
                continue
            # Active/queued execution retains its complete package. Maintenance
            # never submits, resumes or changes a stopped goal/admission.
            busy = conn.execute(
                "SELECT 1 FROM nma_adapter_runs r JOIN nma_adapter_bindings b USING(owner_id,binding_id) LEFT JOIN session_admissions a ON a.request_id='nma:'||r.operation_id WHERE r.owner_id=? AND (a.status IS NULL OR a.status<>'terminal') AND ((?='agent:'||json_extract(b.config,'$.agent_id') AND json_extract(b.config,'$.thread_id') IN (SELECT thread_id FROM nma_threads WHERE kind='dm')) OR ?='thread:'||json_extract(b.config,'$.thread_id')) LIMIT 1",
                (learning.store.owner, ns, ns),
            ).fetchone()
            if busy:
                continue
            if not force:
                latest = conn.execute(
                    "SELECT max(m.created_at) FROM nma_messages m JOIN nma_threads t USING(owner_id,thread_id) WHERE m.owner_id=? AND ((?='agent:'||t.dm_agent_id AND t.kind='dm') OR ?='thread:'||t.thread_id)",
                    (learning.store.owner, ns, ns),
                ).fetchone()[0]
                if (
                    latest
                    and clock - datetime.fromisoformat(latest).timestamp()
                    < curator.get_min_idle_hours() * 3600
                ):
                    continue
            scope = {"agent_id": agent_id, "thread_id": thread_id}
            items = learning.skills.listing(conn, scope)
            usage = {}
            for item in items:
                dates = conn.execute(
                    "SELECT created_at,updated_at FROM nma_skill_entries WHERE owner_id=? AND skill_id=?",
                    (learning.store.owner, item["skill_id"]),
                ).fetchone()
                count, last = conn.execute(
                    "SELECT count(*),max(created_at) FROM nma_skill_usage WHERE owner_id=? AND skill_id=?",
                    (learning.store.owner, item["skill_id"]),
                ).fetchone()
                usage[item["name"]] = {
                    "created_by": "agent"
                    if item["origin"] == "learned"
                    else "installed",
                    "created_at": dates[0],
                    "last_used_at": last,
                    "last_patched_at": dates[1],
                    "use_count": count,
                    "state": "active",
                    "pinned": item["origin"] != "learned",
                }
            with learning.skills.materialized(items) as root:
                skill_usage.save_usage(usage)
                counts = curator.apply_automatic_transitions()
                remaining = {path.parent.name for path in root.glob("*/SKILL.md")}
                for item in items:
                    if item["name"] not in remaining:
                        learning.skills.save(
                            conn,
                            scope,
                            item["name"],
                            item["files"],
                            {"source": "native_curator", "at": now()},
                            expected=item["revision"],
                            status="archived",
                        )
            conn.execute(
                "INSERT INTO nma_learning_maintenance VALUES (?,?,?,?) ON CONFLICT(owner_id,namespace) DO UPDATE SET last_run=excluded.last_run,report=excluded.report",
                (learning.store.owner, ns, clock, json.dumps(counts)),
            )
            reports.append(counts)
        return {"status": "checked", "reports": reports}

    return learning.store.write(operation)


def install():
    from gateway import run

    def chore():
        from ngertiin_engine.agents import Agents
        from ngertiin_engine.app_interactions import _store_factory
        from ngertiin_engine.learning import Learning
        from ngertiin_engine.threads import Threads

        if _store_factory is not None:
            store = _store_factory()
            maintain(Learning(store, Threads(store, Agents(store, {}))))

    run._housekeeping_curator = chore
