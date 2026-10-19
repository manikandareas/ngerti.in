"""Authenticated product controls; the same revisioned state serves UI and chat."""

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException

from ngertiin.async_db import transaction
from ngertiin.chat.store import json_value, lock_account, one, owned_thread
from ngertiin.memory.policy import fingerprint
from ngertiin.proactivity import store
from ngertiin.proactivity.contracts import PreferenceInput


async def account(conn, owner):
    await conn.execute(
        "INSERT INTO proactive_preferences(owner_id,intensity) "
        "SELECT %s,CASE WHEN enabled THEN 'normal' ELSE 'off' END FROM proactive_accounts "
        "WHERE owner_id=%s ON CONFLICT DO NOTHING",
        (owner, owner),
    )
    await conn.execute(
        "INSERT INTO proactive_preferences(owner_id) VALUES (%s) ON CONFLICT DO NOTHING", (owner,)
    )
    return await one(conn, "SELECT * FROM proactive_preferences WHERE owner_id=%s", (owner,))


async def scoped(conn, owner, scope, identity):
    if scope == "account":
        return await account(conn, owner)
    if scope == "thread":
        await owned_thread(conn, owner, identity)
    elif not await one(
        conn, "SELECT id FROM user_goals WHERE owner_id=%s AND id=%s", (owner, identity)
    ):
        raise HTTPException(404, "Tujuan tidak ditemukan.")
    return await one(
        conn,
        "SELECT * FROM proactive_scope_controls WHERE owner_id=%s AND scope=%s AND scope_id=%s",
        (owner, scope, identity),
    ) or {"revision": 1, "intensity": None, "snoozed_until": None}


async def listing(owner):
    async with transaction() as conn:
        await lock_account(conn, owner)
        value = await account(conn, owner)
        scopes = await (
            await conn.execute(
                "SELECT c.*,COALESCE(t.title,g.spec->>'title') AS title "
                "FROM proactive_scope_controls c LEFT JOIN chat_threads t ON c.scope='thread' "
                "AND t.id=c.scope_id AND t.owner_id=c.owner_id LEFT JOIN user_goals g "
                "ON c.scope='goal' AND g.id=c.scope_id AND g.owner_id=c.owner_id "
                "WHERE c.owner_id=%s ORDER BY c.updated_at DESC LIMIT 50",
                (owner,),
            )
        ).fetchall()
        recent = await (
            await conn.execute(
                "SELECT d.candidate_id,d.thread_id,d.created_at,c.reason,c.state,"
                "c.payload->>'title' AS title,t.title AS thread_title "
                "FROM proactive_deliveries d JOIN proactive_candidates c ON c.id=d.candidate_id "
                "JOIN chat_threads t ON t.id=d.thread_id WHERE d.owner_id=%s "
                "ORDER BY d.created_at DESC LIMIT 10",
                (owner,),
            )
        ).fetchall()
        pending = await one(
            conn,
            "SELECT count(*) AS n FROM proactive_candidates WHERE owner_id=%s AND state='eligible' "
            "AND expires_at>now()",
            (owner,),
        )
    return {
        "preferences": value,
        "scopes": scopes,
        "deliveries": recent,
        "pending": pending["n"],
        "server_time": datetime.now(UTC),
    }


async def change(owner, body: PreferenceInput, *, source_run=None):
    digest = fingerprint(body.model_dump(mode="json", exclude={"request_key"}))
    async with transaction() as conn:
        await lock_account(conn, owner)
        if source_run:
            live = await one(
                conn,
                "SELECT id FROM chat_runs WHERE id=%s AND owner_id=%s AND lease_token=%s "
                "AND status='running' AND NOT cancel_requested",
                (source_run["id"], owner, source_run["lease_token"]),
            )
            if not live:
                raise HTTPException(409, "Giliran chat sudah berakhir; preferensi belum berubah.")
        previous = await one(
            conn,
            "SELECT * FROM proactive_preference_commands WHERE owner_id=%s AND request_key=%s",
            (owner, body.request_key),
        )
        if previous:
            if previous["fingerprint"] != digest:
                raise HTTPException(409, "Kunci perubahan sudah dipakai untuk isi berbeda.")
            return previous["response"]
        current = await scoped(conn, owner, body.scope, body.scope_id)
        if current["revision"] != body.expected_revision:
            raise HTTPException(409, "Preferensi berubah. Muat data terbaru.")
        now = datetime.now(UTC)
        if body.snoozed_until and not now < body.snoozed_until <= now + timedelta(days=366):
            raise HTTPException(422, "Jeda harus di masa depan, maksimal satu tahun.")
        values = {
            **current,
            **body.model_dump(
                exclude_none=True,
                include={
                    "intensity",
                    "timezone",
                    "quiet_enabled",
                    "quiet_start",
                    "quiet_end",
                    "snoozed_until",
                },
            ),
        }
        if body.clear_snooze:
            values["snoozed_until"] = None
        if body.inherit:
            values["intensity"] = None
        revision = current["revision"] + 1
        if body.scope == "account":
            if values["quiet_enabled"] and values["quiet_start"] == values["quiet_end"]:
                raise HTTPException(422, "Awal dan akhir jam tenang harus berbeda.")
            values["onboarded_at"] = current["onboarded_at"] or (now if body.acknowledge else None)
            await conn.execute(
                "UPDATE proactive_preferences SET revision=%s,intensity=%s,timezone=%s,"
                "quiet_enabled=%s,quiet_start=%s,quiet_end=%s,snoozed_until=%s,onboarded_at=%s,"
                "updated_at=now() WHERE owner_id=%s",
                (
                    revision,
                    *[
                        values[k]
                        for k in (
                            "intensity",
                            "timezone",
                            "quiet_enabled",
                            "quiet_start",
                            "quiet_end",
                            "snoozed_until",
                            "onboarded_at",
                        )
                    ],
                    owner,
                ),
            )
            await store.control(conn, owner)
            active = bool(values["onboarded_at"] and values["intensity"] != "off")
            if not active:
                await store.revoke(conn, owner, "delivery_disabled")
            await conn.execute(
                "UPDATE proactive_accounts SET enabled=%s,revision=revision+1,evaluated_version=-1,"
                "due_at=now(),updated_at=now() WHERE owner_id=%s",
                (active, owner),
            )
        else:
            await conn.execute(
                "INSERT INTO proactive_scope_controls(owner_id,scope,scope_id,revision,intensity,"
                "snoozed_until) VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT(owner_id,scope,scope_id) "
                "DO UPDATE SET revision=EXCLUDED.revision,intensity=EXCLUDED.intensity,"
                "snoozed_until=EXCLUDED.snoozed_until,updated_at=now()",
                (
                    owner,
                    body.scope,
                    body.scope_id,
                    revision,
                    values["intensity"],
                    values["snoozed_until"],
                ),
            )
        # Preference changes wake held candidates; delivery rechecks all gates.
        await conn.execute(
            "UPDATE proactive_candidates SET delivery_due_at=now() "
            "WHERE owner_id=%s AND state='eligible'",
            (owner,),
        )
        response = {
            "scope": body.scope,
            "scope_id": body.scope_id,
            "revision": revision,
            "intensity": values["intensity"],
            "snoozed_until": values["snoozed_until"],
            "message": "Preferensi proaktif sudah diperbarui. Hasil Task/Jadwal tetap tersedia.",
        }
        await conn.execute(
            "INSERT INTO proactive_preference_commands(owner_id,request_key,fingerprint,response,"
            "source_run_id) VALUES (%s,%s,%s,%s,%s)",
            (
                owner,
                body.request_key,
                digest,
                json_value(response),
                source_run["id"] if source_run else None,
            ),
        )
        return response
