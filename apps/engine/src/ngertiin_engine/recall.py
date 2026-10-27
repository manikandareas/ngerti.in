"""Native FTS, browse and compression recall over an authorized SQL view."""

import json
from pathlib import Path

from ngertiin_engine.contracts import EngineError


def sessions(conn, store, scope, contexts):
    thread = contexts.scope(conn, **scope)
    rows = conn.execute(
        "SELECT b.native_session_id,b.config FROM nma_adapter_bindings b JOIN nma_threads t ON t.owner_id=b.owner_id AND t.thread_id=json_extract(b.config,'$.thread_id') JOIN nma_memberships m ON m.owner_id=t.owner_id AND m.thread_id=t.thread_id AND m.agent_id=? WHERE b.owner_id=? AND b.native_session_id IS NOT NULL AND t.status='open' AND m.status='active' AND json_extract(b.config,'$.context_generation')=CAST(t.context_generation AS TEXT) AND ((t.kind='dm' AND t.dm_agent_id=? AND json_extract(b.config,'$.agent_id')=?) OR t.thread_id=?)",
        (
            scope["agent_id"],
            store.owner,
            scope["agent_id"] if thread["kind"] == "dm" else "",
            scope["agent_id"],
            scope["thread_id"],
        ),
    ).fetchall()
    from hermes_state_local import local_receipt

    result = {}
    for native_id, config in rows:
        config = json.loads(config)
        receipt = local_receipt(store.authority.db, native_id)
        if not receipt:
            continue
        ids = {receipt["entry"]["session_id"]}
        for item in receipt.get("lineage", []):
            if isinstance(item, str):
                ids.add(item)
            elif isinstance(item, dict):
                ids.update(
                    item[key]
                    for key in ("session_id", "id", "from_session_id", "to_session_id")
                    if isinstance(item.get(key), str)
                )
        for native in ids:
            result[native] = {
                "thread_id": config["thread_id"],
                "agent_id": config["agent_id"],
                "link": "/conversations/" + config["thread_id"],
            }
    return result


def search(store, contexts, scope, arguments):
    from hermes_state import SessionDB
    from tools.session_search_tool import session_search

    if arguments.get("profile") or "/" in str(arguments.get("session_id", "")):
        raise EngineError("NOT_FOUND")
    allowed = store.write(lambda conn: sessions(conn, store, scope, contexts))
    selected = arguments.get("session_id")
    if selected and selected not in allowed:
        raise EngineError("NOT_FOUND")

    class ScopedSessionDB(SessionDB):
        def _connect_read_only(self, timeout):
            conn = super()._connect_read_only(timeout)
            # Native IO-error recovery can reopen its handle. Install the scope
            # on every connection, before even the first native read.
            conn.execute("CREATE TEMP TABLE nma_recall_allowed(id TEXT PRIMARY KEY)")
            conn.executemany(
                "INSERT INTO nma_recall_allowed VALUES (?)", [(sid,) for sid in allowed]
            )
            conn.execute(
                "CREATE TEMP VIEW sessions AS SELECT s.* FROM main.sessions s JOIN nma_recall_allowed a ON a.id=s.id"
            )
            conn.execute(
                "CREATE TEMP VIEW messages AS SELECT m.* FROM main.messages m JOIN nma_recall_allowed a ON a.id=m.session_id"
            )
            return conn

    db = ScopedSessionDB(db_path=Path(store.authority.db.db_path), read_only=True)
    try:
        result = json.loads(session_search(db=db, **arguments))
        result["sources"] = allowed
        current = store.write(lambda conn: sessions(conn, store, scope, contexts))
        if current != allowed:
            raise EngineError("ACCESS_REVOKED")
        return result
    finally:
        db.close()
