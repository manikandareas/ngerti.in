"""Bounded conversation summaries and owner-scoped replay, without execution."""

import base64
import json

from ngertiin_engine.contracts import EngineError, canonical, uuid


class Inbox:
    def __init__(self, adapter):
        self.adapter, self.store = adapter, adapter.store
        self.owner = self.store.owner

    def summary(self, conn, thread_id):
        row = conn.execute(
            "SELECT t.kind,t.title,t.dm_agent_id,t.status,s.activity_seq,s.last_read_seq,t.updated_at FROM nma_threads t JOIN nma_conversation_state s USING(owner_id,thread_id) WHERE t.owner_id=? AND t.thread_id=?",
            (self.owner, thread_id),
        ).fetchone()
        if not row:
            raise EngineError("NOT_FOUND")
        from ngertiin_engine.agents import avatar_url

        identity = (
            conn.execute(
                "SELECT display_name,status,handle FROM nma_agents WHERE owner_id=? AND agent_id=?",
                (self.owner, row[2]),
            ).fetchone()
            if row[2]
            else None
        )
        primary = conn.execute(
            "SELECT 1 FROM nma_primary_dms WHERE owner_id=? AND thread_id=?",
            (self.owner, thread_id),
        ).fetchone()
        last = conn.execute(
            "SELECT message_id,message_seq,author_kind,author_agent_id,substr(json_extract(parts,'$[0].text'),1,240) FROM nma_messages WHERE owner_id=? AND thread_id=? ORDER BY message_seq DESC LIMIT 1",
            (self.owner, thread_id),
        ).fetchone()
        unread = conn.execute(
            "SELECT COUNT(*) FROM nma_messages WHERE owner_id=? AND thread_id=? AND author_kind='agent' AND message_seq>?",
            (self.owner, thread_id, row[5]),
        ).fetchone()[0]
        named = conn.execute(
            "SELECT 1 FROM nma_commands WHERE owner_id=? AND json_extract(body,'$.type')='history.rename' AND json_extract(result,'$.thread.thread_id')=? LIMIT 1",
            (self.owner, thread_id),
        ).fetchone()
        return {
            "thread_id": thread_id,
            "kind": row[0],
            "is_primary": bool(primary),
            "title": identity[0] if identity and primary and not named else row[1],
            "dm_agent_id": row[2],
            "status": row[3],
            "agent_status": identity[1] if identity else None,
            "avatar_url": avatar_url(identity[2]) if identity else None,
            "activity_sequence": str(row[4]),
            "last_read_sequence": str(row[5]),
            "updated_at": row[6],
            "unread_count": str(unread),
            "last_message": {
                "message_id": last[0],
                "message_seq": str(last[1]),
                "author_kind": last[2],
                "author_agent_id": last[3],
                "preview": last[4],
            }
            if last
            else None,
        }

    def listing(self, p):
        if set(p) != {"after"}:
            raise EngineError("INVALID_REQUEST")

        def read(conn):
            epoch = conn.execute(
                "SELECT incarnation FROM nma_stream WHERE owner_id=?", (self.owner,)
            ).fetchone()[0]
            anchor = conn.execute(
                "SELECT COALESCE(MAX(sequence),0) FROM nma_events WHERE owner_id=?",
                (self.owner,),
            ).fetchone()[0]
            seq, thread = 2**63 - 1, ""
            if p["after"]:
                try:
                    raw = p["after"]
                    if not isinstance(raw, str) or len(raw) > 1024:
                        raise ValueError
                    claims = json.loads(
                        base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))
                    )
                    if (
                        not isinstance(claims, list)
                        or len(claims) != 5
                        or claims[:2] != [self.owner, epoch]
                    ):
                        raise ValueError
                    for value in claims[2:4]:
                        if (
                            not isinstance(value, str)
                            or not value.isascii()
                            or not value.isdecimal()
                            or str(int(value)) != value
                            or not 0 <= int(value) <= 2**63 - 1
                        ):
                            raise ValueError
                    if int(claims[2]) > anchor:
                        raise ValueError
                    anchor, seq, thread = (
                        int(claims[2]),
                        int(claims[3]),
                        uuid(claims[4]),
                    )
                except (ValueError, TypeError, EngineError):
                    raise EngineError("INVALID_CURSOR") from None
            rows = conn.execute(
                "SELECT s.thread_id,s.activity_seq FROM nma_conversation_state s JOIN nma_threads t USING(owner_id,thread_id) WHERE s.owner_id=? AND (t.kind='group' OR EXISTS (SELECT 1 FROM nma_primary_dms d WHERE d.owner_id=t.owner_id AND d.thread_id=t.thread_id)) AND (s.activity_seq<? OR (s.activity_seq=? AND s.thread_id>?)) ORDER BY s.activity_seq DESC,s.thread_id LIMIT 51",
                (self.owner, seq, seq, thread),
            ).fetchall()
            items = [self.summary(conn, r[0]) for r in rows[:50]]
            cursor = (
                base64.urlsafe_b64encode(
                    canonical(
                        [self.owner, epoch, str(anchor), str(rows[49][1]), rows[49][0]]
                    ).encode()
                )
                .decode()
                .rstrip("=")
                if len(rows) > 50
                else None
            )
            return {
                "items": items,
                "next_cursor": cursor,
                "replay_epoch": epoch,
                "through_sequence": str(anchor),
            }

        return self.store.write(read)

    def events(self, p):
        if set(p) != {"replay_epoch", "last_sequence"}:
            raise EngineError("INVALID_REQUEST")

        def read(conn):
            epoch, maximum = self.adapter.dm.watermark(conn)
            if p.get("replay_epoch") not in (None, epoch):
                raise EngineError("CURSOR_RESET")
            raw = p.get("last_sequence")
            if (
                not isinstance(raw, str)
                or not raw.isascii()
                or not raw.isdecimal()
                or str(int(raw)) != raw
                or int(raw) > 2**63 - 1
            ):
                raise EngineError("INVALID_CURSOR")
            seq = int(raw)
            if seq > maximum:
                raise EngineError("CURSOR_AHEAD")
            rows = conn.execute(
                "SELECT sequence,payload FROM nma_events WHERE owner_id=? AND sequence>? AND json_extract(payload,'$.type')='conversation.changed' ORDER BY sequence LIMIT 129",
                (self.owner, seq),
            ).fetchall()
            events = [json.loads(r[1]) for r in rows[:128]]
            for item in events:
                item["payload"] = self.summary(conn, item["thread_id"])
            return {
                "events": events,
                "replay_epoch": epoch,
                "last_sequence": str(rows[127][0] if len(rows) > 128 else maximum),
                "has_more": len(rows) > 128,
            }

        return self.store.write(read)
