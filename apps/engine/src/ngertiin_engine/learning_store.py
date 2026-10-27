"""Versioned procedural and declarative memory inside the existing owner writer."""

import json
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.context import Context, now
from ngertiin_engine.contracts import EngineError, canonical, digest

DDL = (
    "CREATE TABLE nma_memory_metadata (owner_id TEXT NOT NULL,memory_id TEXT NOT NULL,target TEXT NOT NULL CHECK(target IN ('memory','user')),PRIMARY KEY(owner_id,memory_id),FOREIGN KEY(owner_id,memory_id) REFERENCES nma_memory_entries(owner_id,memory_id))",
    "CREATE TABLE nma_memory_revisions (owner_id TEXT NOT NULL,memory_id TEXT NOT NULL,revision INTEGER NOT NULL,snapshot TEXT NOT NULL,operation_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(owner_id,memory_id,revision),FOREIGN KEY(owner_id,memory_id) REFERENCES nma_memory_entries(owner_id,memory_id))",
    "CREATE TABLE nma_learning_receipts (owner_id TEXT NOT NULL,operation_id TEXT NOT NULL,payload_digest TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(owner_id,operation_id),FOREIGN KEY(owner_id) REFERENCES nma_partition(owner_id))",
    "CREATE TABLE nma_skill_entries (owner_id TEXT NOT NULL,skill_id TEXT NOT NULL,namespace TEXT NOT NULL,name TEXT NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('active','archived')),origin TEXT NOT NULL,catalog_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(owner_id,skill_id),UNIQUE(owner_id,namespace,name),FOREIGN KEY(owner_id) REFERENCES nma_partition(owner_id))",
    "CREATE TABLE nma_skill_revisions (owner_id TEXT NOT NULL,skill_id TEXT NOT NULL,revision INTEGER NOT NULL,files TEXT NOT NULL,provenance TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(owner_id,skill_id,revision),FOREIGN KEY(owner_id,skill_id) REFERENCES nma_skill_entries(owner_id,skill_id))",
    "CREATE TABLE nma_skill_usage (owner_id TEXT NOT NULL,skill_id TEXT NOT NULL,revision INTEGER NOT NULL,operation_id TEXT NOT NULL,run_id TEXT,result TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(owner_id,skill_id,operation_id),FOREIGN KEY(owner_id,skill_id,revision) REFERENCES nma_skill_revisions(owner_id,skill_id,revision))",
    "CREATE TABLE nma_learning_maintenance (owner_id TEXT NOT NULL,namespace TEXT NOT NULL,last_run REAL NOT NULL,report TEXT NOT NULL,PRIMARY KEY(owner_id,namespace),FOREIGN KEY(owner_id) REFERENCES nma_partition(owner_id))",
    "CREATE TABLE nma_memory_provider_banks (owner_id TEXT NOT NULL,namespace TEXT NOT NULL,bank_id TEXT NOT NULL,snapshot_digest TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','ready','deleted')),PRIMARY KEY(owner_id,namespace,bank_id),FOREIGN KEY(owner_id) REFERENCES nma_partition(owner_id))",
)


def identity(*parts):
    return str(uuid5(NAMESPACE_URL, canonical(parts)))


def namespace(context, thread):
    # Private procedures follow the agent across its DMs; group-derived procedures
    # stay in the exact group, including when the same agent visits a DM later.
    return (
        "agent:" + context["agent_id"]
        if thread["kind"] == "dm"
        else "thread:" + context["thread_id"]
    )


def once(conn, owner, operation_id, payload, operation):
    prior = conn.execute(
        "SELECT payload_digest,result FROM nma_learning_receipts WHERE owner_id=? AND operation_id=?",
        (owner, operation_id),
    ).fetchone()
    fingerprint = digest(payload)
    if prior:
        if prior[0] != fingerprint:
            raise EngineError("COMMAND_CONFLICT")
        return json.loads(prior[1])
    result = operation()
    conn.execute(
        "INSERT INTO nma_learning_receipts VALUES (?,?,?,?)",
        (owner, operation_id, fingerprint, canonical(result)),
    )
    return result


def snapshot_memory(conn, context, item, operation_id):
    conn.execute(
        "INSERT OR IGNORE INTO nma_memory_revisions VALUES (?,?,?,?,?,?)",
        (
            context.store.owner,
            item["memory_id"],
            int(item["revision"]),
            canonical(item),
            operation_id,
            now(),
        ),
    )


def backfill_memory(conn, context):
    for (memory_id,) in conn.execute(
        "SELECT memory_id FROM nma_memory_entries WHERE owner_id=?",
        (context.store.owner,),
    ).fetchall():
        snapshot_memory(conn, context, context.memory(conn, memory_id), "historical")


def memory_lineage(before, arguments, result, remaining):
    """Attach identities to the exact per-operation matches returned by Hermes.

    Native validation, matching, patching and final-budget checks have already
    succeeded. Walk its receipts in order, including edits of newly added facts.
    Equal content does not imply equal identity: remove then add is a new fact.
    """
    entries = [(item, item["content"]) for item in before]
    batch = arguments.get("operations")
    for index, operation in enumerate(batch or [arguments], 1):
        action = operation["action"]
        if action == "add":
            content = (
                operation.get("content") or operation.get("new_text") or ""
            ).strip()
            if content not in [text for _, text in entries]:
                entries.append((None, content))
            continue
        if batch:
            previous = result[
                "removed_entries" if action == "remove" else "patched_entries"
            ][str(index)]
        else:
            previous = result[
                "removed_entry" if action == "remove" else "patched_entry_before"
            ]
        # Hermes selects the first exact match when equal entries exist. Its
        # receipt contains the full matched text, even for tolerant span matches.
        position = next(i for i, (_, text) in enumerate(entries) if text == previous)
        if action == "remove":
            entries.pop(position)
        else:
            content = (
                result["patched_entries_after"][str(index)]
                if batch
                else result["patched_entry_after"]
            )
            entries[position] = (entries[position][0], content)
    if [text for _, text in entries] != remaining:
        raise EngineError("MEMORY_LINEAGE_MISMATCH")
    return entries


class Memories:
    def __init__(self, context: Context):
        self.context, self.store = context, context.store

    def inventory(self, conn, scope):
        items = self.context.retrieve(conn, **scope)["memory"]
        for item in items:
            metadata = conn.execute(
                "SELECT target FROM nma_memory_metadata WHERE owner_id=? AND memory_id=?",
                (self.store.owner, item["memory_id"]),
            ).fetchone()
            item["target"] = metadata[0] if metadata else "memory"
        return items

    def apply_native(self, conn, scope, arguments, operation_id, sources, run_id=None):
        """Use native matching, threat checks, batches and budgets; replace only I/O."""
        from tools.memory_tool import MemoryStore, memory_tool

        thread = self.context.scope(conn, **scope)
        private = thread["kind"] == "dm"
        items = [
            item
            for item in self.inventory(conn, scope)
            if item["scope_kind"] == ("agent_private" if private else "thread_shared")
        ]

        class TransactionMemory(MemoryStore):
            applied = False

            def _mutate(native, target, mutate, **_):
                result = mutate(native._entries_for(target), native._char_limit(target))
                if isinstance(result, dict):
                    return result
                native.applied = True
                native._set_entries(target, result[0])
                return native._success_response(
                    target, result[1], **(result[2] if len(result) > 2 else {})
                )

        native = TransactionMemory()
        for target in ("memory", "user"):
            native._set_entries(
                target, [i["content"] for i in items if i["target"] == target]
            )
        result = json.loads(memory_tool(store=native, **arguments))
        if result.get("success") is not True or not native.applied:
            return result
        target = arguments.get("target", "memory")
        before = [i for i in items if i["target"] == target]
        remaining = native._entries_for(target)
        entries = memory_lineage(before, arguments, result, remaining)
        retained = {old["memory_id"] for old, _ in entries if old is not None}
        removed = [item for item in before if item["memory_id"] not in retained]
        changed_ids, invalidated = [], [item["memory_id"] for item in removed]
        for index, (old, text) in enumerate(entries):
            if old is not None and old["content"] == text:
                continue
            memory_id = (
                old["memory_id"]
                if old
                else identity(self.store.owner, operation_id, index)
            )
            if old:
                invalidated.append(memory_id)
                snapshot_memory(conn, self.context, old, operation_id)
                conn.execute(
                    "UPDATE nma_memory_entries SET content=?,source_message_ids=?,revision=revision+1,generation=generation+1,updated_at=? WHERE owner_id=? AND memory_id=?",
                    (
                        text,
                        canonical(sorted(set(old["source_message_ids"] + sources))),
                        now(),
                        self.store.owner,
                        memory_id,
                    ),
                )
            else:
                conn.execute(
                    "INSERT INTO nma_memory_entries(owner_id,memory_id,scope_kind,agent_id,thread_id,content,source_message_ids,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
                    (
                        self.store.owner,
                        memory_id,
                        "agent_private" if private else "thread_shared",
                        scope["agent_id"] if private else None,
                        None if private else scope["thread_id"],
                        text,
                        canonical(sources),
                        now(),
                        now(),
                    ),
                )
                conn.execute(
                    "INSERT INTO nma_memory_metadata VALUES (?,?,?)",
                    (self.store.owner, memory_id, target),
                )
            snapshot_memory(
                conn, self.context, self.context.memory(conn, memory_id), operation_id
            )
            changed_ids.append(memory_id)
        for old in removed:
            snapshot_memory(conn, self.context, old, operation_id)
            conn.execute(
                "UPDATE nma_memory_entries SET status='deleted',revision=revision+1,generation=generation+1,updated_at=? WHERE owner_id=? AND memory_id=?",
                (now(), self.store.owner, old["memory_id"]),
            )
            snapshot_memory(
                conn,
                self.context,
                self.context.memory(conn, old["memory_id"]),
                operation_id,
            )
            changed_ids.append(old["memory_id"])
        if invalidated:
            self.invalidate(conn, invalidated, completing_run_id=run_id)
        return {**result, "memory_ids": changed_ids}

    def invalidate(self, conn, ids, *, completing_run_id=None):
        affected = set()
        for memory_id in ids:
            item = self.context.memory(conn, memory_id)
            if item["thread_id"]:
                affected.add(item["thread_id"])
            else:
                affected.update(
                    row[0]
                    for row in conn.execute(
                        "SELECT thread_id FROM nma_threads WHERE owner_id=? AND dm_agent_id=?",
                        (self.store.owner, item["agent_id"]),
                    )
                )
            affected.update(
                row[0]
                for row in conn.execute(
                    "SELECT target_thread_id FROM nma_scope_grants WHERE owner_id=? AND source_kind='memory' AND source_id=? AND status='active'",
                    (self.store.owner, memory_id),
                )
            )
        self.context.invalidate(conn, affected, completing_run_id=completing_run_id)

    def correct(self, conn, scope, payload, revision, operation_id):
        items = {i["memory_id"]: i for i in self.inventory(conn, scope)}
        memory_id = payload.get("memory_id")
        if memory_id not in items:
            raise EngineError("NOT_FOUND")
        item = items[memory_id]
        if item["revision"] != revision:
            raise EngineError("REVISION_CONFLICT")
        content = payload.get("content")
        if payload.get("action") not in {"correct", "forget"} or (
            payload["action"] == "correct"
            and (not isinstance(content, str) or not 1 <= len(content.strip()) <= 16000)
        ):
            raise EngineError("INVALID_REQUEST")
        snapshot_memory(conn, self.context, item, operation_id)
        conn.execute(
            "UPDATE nma_memory_entries SET content=?,status=?,revision=revision+1,generation=generation+1,updated_at=? WHERE owner_id=? AND memory_id=?",
            (
                content.strip() if payload["action"] == "correct" else item["content"],
                "active" if payload["action"] == "correct" else "deleted",
                now(),
                self.store.owner,
                memory_id,
            ),
        )
        snapshot_memory(
            conn, self.context, self.context.memory(conn, memory_id), operation_id
        )
        self.invalidate(conn, [memory_id])
        return {"memory_id": memory_id, "revision": str(int(revision) + 1)}
