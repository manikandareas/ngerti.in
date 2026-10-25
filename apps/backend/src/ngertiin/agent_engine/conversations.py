"""Additive messaging APIs. No UI or execution lifecycle lives here."""

from typing import Annotated
from uuid import UUID, uuid5

from fastapi import APIRouter, Depends, Query, Response
from sqlmodel import Session

from ngertiin.accounts.provisioning import enqueue, status
from ngertiin.agent_engine.api import AccountDep, Command, failure, forward
from ngertiin.agent_engine.stream import cursor, read_command
from ngertiin.db import get_session

router = APIRouter(prefix="/api/agent-engine/v1", tags=["agent-engine"])
SessionDep = Annotated[Session, Depends(get_session)]


@router.get("/bootstrap")
async def bootstrap_status(account: AccountDep, session: SessionDep):
    value = status(session, str(account.id))
    if value["status"] == "ready":
        return await forward(str(account.id), read_command("account.read", {}))
    return {"status": value["status"], "error_code": value["error_code"]}


@router.post("/bootstrap")
async def bootstrap(account: AccountDep, session: SessionDep, response: Response):
    enqueue(session, str(account.id))
    session.commit()
    value = await bootstrap_status(account, session)
    if value["status"] != "ready":
        response.status_code = 202
        response.headers["Retry-After"] = "2"
    return value


@router.post("/agents/{agent_id}/dm")
async def direct_message(agent_id: UUID, body: Command, account: AccountDep):
    if body.type != "thread.ensure_dm" or body.payload != {"agent_id": str(agent_id)}:
        raise failure("INVALID_REQUEST", str(body.command_id))
    return await forward(str(account.id), body.model_dump(mode="json"))


@router.get("/conversations")
async def conversations(account: AccountDep, after: str | None = Query(None, max_length=1024)):
    owner = str(account.id)
    result = await forward(owner, read_command("conversation.list", {"after": after}))
    result["through_cursor"] = cursor(
        owner, "conversations", result.pop("replay_epoch"), result.pop("through_sequence")
    )
    return result


def setup_command(owner: str):
    body = read_command("account.ensure", {})
    body["command_id"] = str(uuid5(UUID(owner), "account-setup-v1"))
    return body
