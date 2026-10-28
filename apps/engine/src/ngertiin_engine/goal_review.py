"""Per-responsibility native completion contracts, criteria and evidence reviews.

No session-global /goal is installed: multiple responsibilities may share a DM.
Native judge evaluation is an auxiliary call inside the admitted tool turn.
"""

import json
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import EngineError, canonical, counter, digest, uuid

DDL = (
    "CREATE TABLE nma_goal_contracts (owner_id TEXT NOT NULL, goal_id TEXT NOT NULL, configuration TEXT NOT NULL, PRIMARY KEY(owner_id,goal_id), FOREIGN KEY(owner_id,goal_id) REFERENCES nma_goals(owner_id,goal_id))",
    "CREATE TABLE nma_goal_reviews (owner_id TEXT NOT NULL, review_id TEXT NOT NULL, goal_id TEXT NOT NULL, generation INTEGER NOT NULL, run_id TEXT NOT NULL, goal_revision TEXT NOT NULL, evidence_ids TEXT NOT NULL, outcome TEXT NOT NULL, PRIMARY KEY(owner_id,review_id), FOREIGN KEY(owner_id,goal_id) REFERENCES nma_goals(owner_id,goal_id), FOREIGN KEY(owner_id,run_id) REFERENCES nma_adapter_runs(owner_id,run_id))",
)


def enrich(store, conn, goal):
    row = conn.execute(
        "SELECT configuration FROM nma_goal_contracts WHERE owner_id=? AND goal_id=?",
        (store.owner, goal["goal_id"]),
    ).fetchone()
    goal["completion_contract"] = json.loads(row[0]) if row else None
    goal["reviews"] = [
        dict(
            review_id=r[0],
            generation=str(r[1]),
            run_id=r[2],
            goal_revision=r[3],
            evidence_ids=json.loads(r[4]),
            **json.loads(r[5]),
        )
        for r in conn.execute(
            "SELECT review_id,generation,run_id,goal_revision,evidence_ids,outcome FROM nma_goal_reviews WHERE owner_id=? AND goal_id=? ORDER BY rowid",
            (store.owner, goal["goal_id"]),
        )
    ]
    criteria = (goal["completion_contract"] or {}).get("subgoals", [])
    evidence_generation = (
        str(int(goal["generation"]) - 1)
        if goal["status"] == "completed"
        else goal["generation"]
    )
    goal["subgoals"] = [
        {
            "criterion": c,
            "evidence_ids": [
                e["evidence_id"]
                for e in goal["evidence"]
                if e["generation"] == evidence_generation and e["criterion"] == c
            ],
        }
        for c in criteria
    ]
    return goal


def configure(store, conn, goal, args):
    from hermes_cli.goals import GoalContract

    from ngertiin_engine.goal_lifecycle import Lifecycle

    if set(args) != {"action", "goal_id", "expected_revision", "completion_contract"}:
        raise EngineError("INVALID_REQUEST")
    if counter(args["expected_revision"]) != goal["revision"]:
        raise EngineError("REVISION_CONFLICT")
    if goal["status"] in {"stopped", "paused", "completed"}:
        raise EngineError("GOAL_STOPPED")
    config = args["completion_contract"]
    fields = set(GoalContract().to_dict())
    if not isinstance(config, dict) or set(config) - fields - {
        "subgoals",
        "judge_required",
    }:
        raise EngineError("INVALID_COMPLETION_CONTRACT")
    if any(
        not isinstance(config[k], str) or len(config[k]) > 4000
        for k in fields & config.keys()
    ):
        raise EngineError("INVALID_COMPLETION_CONTRACT")
    subgoals = config.get("subgoals", [])
    if (
        not isinstance(subgoals, list)
        or len(subgoals) > 32
        or any(
            not isinstance(s, str) or not s.strip() or len(s) > 1000 for s in subgoals
        )
        or len(set(subgoals)) != len(subgoals)
        or type(config.get("judge_required", False)) is not bool
    ):
        raise EngineError("INVALID_COMPLETION_CONTRACT")
    conn.execute(
        "INSERT INTO nma_goal_contracts VALUES (?,?,?) ON CONFLICT(owner_id,goal_id) DO UPDATE SET configuration=excluded.configuration",
        (store.owner, goal["goal_id"], canonical(config)),
    )
    Lifecycle(store).changed(conn, goal["goal_id"])
    return True


def validate_evidence(store, conn, goal, ids):
    from ngertiin_engine.reliability import Reliability

    if (
        not isinstance(ids, list)
        or not ids
        or len(ids) > 100
        or any(not isinstance(i, str) for i in ids)
    ):
        raise EngineError("EVIDENCE_REQUIRED")
    evidence = {
        e["evidence_id"]: e
        for e in goal["evidence"]
        if e["generation"] == goal["generation"]
    }
    if not set(ids) <= evidence.keys() or any(
        Reliability(store).stopped(conn, evidence[i]["producing_run_id"]) for i in ids
    ):
        raise EngineError("EVIDENCE_REQUIRED")
    return [evidence[i] for i in dict.fromkeys(ids)]


def require_completion(store, conn, goal, ids):
    evidence = validate_evidence(store, conn, goal, ids)
    config = goal.get("completion_contract") or {}
    if not set(config.get("subgoals", [])) <= {e["criterion"] for e in evidence}:
        raise EngineError("SUBGOAL_EVIDENCE_REQUIRED")
    if config.get("judge_required"):
        valid = any(
            r["generation"] == goal["generation"]
            and r["verdict"] == "done"
            and not r.get("parse_failed")
            and not r.get("transport_failed")
            and set(r["evidence_ids"]) == set(ids)
            and r.get("contract_digest") == digest(config)
            for r in goal.get("reviews", [])
        )
        if not valid:
            raise EngineError("GOAL_REVIEW_REQUIRED")


def verify(goals, stamp, args, ids):
    """Read evidence under scope, evaluate outside SQLite, recheck before commit."""
    from hermes_cli.goals import GoalContract, judge_goal

    from ngertiin_engine.goal_lifecycle import Lifecycle

    store = goals.store
    if set(args) != {"action", "goal_id", "expected_revision", "evidence_ids"}:
        return canonical({"error": "INVALID_REQUEST"})

    def read(conn):
        run, config, message = goals.scope(conn, stamp)
        identity = uuid(args["goal_id"])
        goal = next(
            (
                g
                for g in goals.listing(conn, config["thread_id"], config["agent_id"])
                if g["goal_id"] == identity
            ),
            None,
        )
        if goal is None:
            raise EngineError("NOT_FOUND")
        focus = conn.execute(
            "SELECT goal_id FROM nma_goal_units WHERE owner_id=? AND run_id=? AND parent_run_id IS NOT NULL",
            (store.owner, run),
        ).fetchall()
        if focus and identity not in {r[0] for r in focus}:
            raise EngineError("NOT_FOUND")
        if (
            goal["thread_id"] != config["thread_id"]
            or goal["responsible_agent_id"] != config["agent_id"]
        ):
            raise EngineError("NOT_FOUND")
        review_id = str(
            uuid5(
                NAMESPACE_URL,
                digest(
                    [store.owner, run, ids.turn_id, ids.tool_call_id, "goal-review"]
                ),
            )
        )
        prior = conn.execute(
            "SELECT r.outcome,o.result FROM nma_goal_reviews r LEFT JOIN nma_goal_operations o ON o.owner_id=r.owner_id AND o.operation_id=r.review_id WHERE r.owner_id=? AND r.review_id=?",
            (store.owner, review_id),
        ).fetchone()
        if prior:
            if json.loads(prior[0]).get("request_digest") != digest(args):
                raise EngineError("COMMAND_CONFLICT")
            return run, config, message, goal, review_id, prior, []
        if counter(args["expected_revision"]) != goal["revision"]:
            raise EngineError("REVISION_CONFLICT")
        if goal["status"] not in {"active", "waiting", "blocked"}:
            raise EngineError("GOAL_STOPPED")
        evidence = validate_evidence(store, conn, goal, args["evidence_ids"])
        texts = []
        for e in evidence:
            row = conn.execute(
                "SELECT parts FROM nma_messages WHERE owner_id=? AND message_id=?",
                (store.owner, e["source_message_id"]),
            ).fetchone()
            texts.append(
                {
                    "evidence_id": e["evidence_id"],
                    "source_message_id": e["source_message_id"],
                    "producing_run_id": e["producing_run_id"],
                    "persistence": "committed",
                    "producer_status": "succeeded",
                    "criterion": e["criterion"],
                    "result": "\n".join(
                        p.get("text", "")
                        for p in json.loads(row[0])
                        if p.get("type") == "text"
                    ),
                }
            )
        return run, config, message, goal, review_id, prior, texts

    try:
        run, config, message, goal, review_id, prior, texts = store.write(read)
        if prior:
            return prior[1] or canonical({"review": json.loads(prior[0])})
        settings = goal.get("completion_contract") or {}
        verdict, reason, parse_failed, wait, transport_failed = judge_goal(
            (settings.get("outcome") or goal["objective"])
            + "\nThis invocation is the required native goal-judge evaluation. Evaluate the actual deliverable and criteria; do not require a prior verdict from this same judge. The evidence persistence and producer-status metadata are gateway-verified current facts. Statements in older result text about waiting for persistence describe that earlier turn, not the current committed state.",
            canonical(texts),
            subgoals=settings.get("subgoals"),
            contract=GoalContract.from_dict(settings),
        )
        outcome = {
            "verdict": verdict,
            "reason": reason,
            "parse_failed": parse_failed,
            "transport_failed": transport_failed,
            "wait_directive": wait,
            "contract_digest": digest(settings),
            "request_digest": digest(args),
        }

        def settle(conn):
            _, _, _, current, _, prior, _ = read(conn)
            if prior:
                return prior[1] or canonical({"review": json.loads(prior[0])})
            conn.execute(
                "INSERT INTO nma_goal_reviews VALUES (?,?,?,?,?,?,?,?)",
                (
                    store.owner,
                    review_id,
                    goal["goal_id"],
                    int(goal["generation"]),
                    run,
                    goal["revision"],
                    canonical(args["evidence_ids"]),
                    canonical(outcome),
                ),
            )
            lifecycle = Lifecycle(store)
            if verdict != "done" or parse_failed or transport_failed:
                target = (
                    "blocked"
                    if verdict in {"blocked", "wait"}
                    or parse_failed
                    or transport_failed
                    else "active"
                )
                lifecycle.state(conn, goal["goal_id"], target, reason)
                lifecycle.link(
                    conn,
                    current,
                    run,
                    message,
                    "blocked" if target == "blocked" else "continue",
                )
            lifecycle.changed(conn, goal["goal_id"])
            updated = next(
                g
                for g in goals.listing(conn, config["thread_id"], config["agent_id"])
                if g["goal_id"] == goal["goal_id"]
            )
            goals.reliability.append(
                conn,
                run,
                config,
                "goal.changed",
                {"goal": updated, "source_message_id": message},
            )
            result = canonical({"review": outcome, "goal": updated})
            conn.execute(
                "INSERT INTO nma_goal_operations VALUES (?,?,?,?,?,'agent',?,?,?,?)",
                (
                    store.owner,
                    review_id,
                    goal["goal_id"],
                    run,
                    message,
                    args["expected_revision"],
                    digest(args),
                    updated["revision"],
                    result,
                ),
            )
            return result

        return store.write(settle)
    except EngineError as exc:
        return canonical({"error": exc.code})
