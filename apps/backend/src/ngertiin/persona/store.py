"""Short owner-serialized writes; history also records rejection for future memory curation."""

from ngertiin.chat.store import json_value, one
from ngertiin.persona.policy import DEFAULT_SOUL, DEFAULT_TAGLINE, snapshot


async def current(conn, owner):
    await conn.execute(
        "INSERT INTO agent_profiles(owner_id,soul,tagline) VALUES (%s,%s,%s) "
        "ON CONFLICT DO NOTHING",
        (owner, DEFAULT_SOUL, DEFAULT_TAGLINE),
    )
    profile = await one(conn, "SELECT * FROM agent_profiles WHERE owner_id=%s", (owner,))
    value = snapshot(profile)
    await conn.execute(
        "INSERT INTO persona_revisions(owner_id,revision,content,source) "
        "VALUES (%s,%s,%s,'baseline') ON CONFLICT DO NOTHING",
        (owner, value["revision"], json_value({k: v for k, v in value.items() if k != "revision"})),
    )
    return value


async def listing(conn, owner):
    profile = await current(conn, owner)
    await conn.execute(
        "UPDATE persona_proposals SET status='expired',decided_at=now() "
        "WHERE owner_id=%s AND status='proposed' AND expires_at<=now()",
        (owner,),
    )
    proposals = await (
        await conn.execute(
            "SELECT * FROM persona_proposals WHERE owner_id=%s AND source='chat' "
            "ORDER BY (status='proposed') DESC,created_at DESC LIMIT 40",
            (owner,),
        )
    ).fetchall()
    return {"profile": profile, "proposals": proposals}


async def history(conn, owner, before):
    rows = await (
        await conn.execute(
            "SELECT revision,content,source,restored_from,created_at FROM persona_revisions "
            "WHERE owner_id=%s AND revision<%s ORDER BY revision DESC LIMIT 21",
            (owner, before),
        )
    ).fetchall()
    return {"revisions": rows[:20], "has_more": len(rows) > 20}


async def memory_exclusions(conn, owner, run_ids):
    """NG-017 must exclude persona requests, including rejected ones, from capture.

    Return references and decisions rather than turning proposed instructions into facts.
    This does not itself implement memory capture or recall.
    """
    ids = list(run_ids)
    if len(ids) > 100:
        raise ValueError("Periksa paling banyak 100 sumber persona per batch capture.")
    return await (
        await conn.execute(
            "SELECT source_run_id,status,applied_revision FROM persona_proposals "
            "WHERE owner_id=%s AND source_run_id=ANY(%s)",
            (owner, ids),
        )
    ).fetchall()
