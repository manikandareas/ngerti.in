"""Meter actual chat model attempts independently from one-message quota admission."""

import json
from uuid import uuid4

from langchain_core.utils.function_calling import convert_to_openai_tool

from ngertiin.async_db import transaction
from ngertiin.chat.store import StaleRun, one
from ngertiin.config import get_settings
from ngertiin.usage import events, ledger, prices

CALL_TOKENS = 100000


async def admit(conn, owner, run, thread):
    settings = get_settings()
    p = await ledger.period(conn, owner)
    price = p["policy"]["prices"].get(settings.openai_model, prices.snapshot(settings.openai_model))
    await ledger.open_work(
        conn,
        owner,
        f"chat:{run}",
        "chat",
        "Percakapan dengan Gwen",
        prices.maximum(CALL_TOKENS * settings.chat_max_model_calls, price),
        thread=thread,
    )


async def call(run, request, handler):
    body = [m.model_dump_json() for m in request.messages]
    if request.system_message:
        body.append(request.system_message.model_dump_json())
    # Tool schemas are model input as well; reserve their full serialized byte bound.
    body.extend(json.dumps(convert_to_openai_tool(t), ensure_ascii=False) for t in request.tools)
    ceiling = sum(len(s.encode()) for s in body) + 4096 + get_settings().chat_max_output_tokens
    if ceiling > CALL_TOKENS:
        raise ValueError("Konteks percakapan melebihi batas komputasi. Mulai percakapan baru.")
    identity = "chat-model:" + str(uuid4())
    async with transaction() as conn:
        await ledger.period(conn, run["owner_id"])
        live = await one(conn, "SELECT * FROM chat_runs WHERE id=%s", (run["id"],))
        if live["cancel_requested"] or live["lease_token"] != run["lease_token"]:
            raise StaleRun()
        work = await one(
            conn,
            "SELECT * FROM compute_work WHERE owner_id=%s AND resource_key=%s",
            (run["owner_id"], f"chat:{run['id']}"),
        )
        if not work:
            # A turn admitted before the migration gets prospective accounting only.
            await admit(conn, run["owner_id"], run["id"], run["thread_id"])
            work = await one(
                conn,
                "SELECT * FROM compute_work WHERE owner_id=%s AND resource_key=%s",
                (run["owner_id"], f"chat:{run['id']}"),
            )
        await ledger.reopen(conn, run["owner_id"], work["resource_key"])
        event = await events.model_reserve(
            conn,
            run["owner_id"],
            identity,
            get_settings().openai_model,
            ceiling,
            work=work,
            kind="model",
        )
    usage = None
    try:
        response = await handler(request)
        for message in response.result:
            if getattr(message, "usage_metadata", None):
                usage = message.usage_metadata
        return response
    finally:
        amount, state = prices.model_cost(usage, event["price"], event["reserved"])
        async with transaction() as conn:
            await ledger.settle_event(conn, run["owner_id"], identity, amount, state, usage or {})
