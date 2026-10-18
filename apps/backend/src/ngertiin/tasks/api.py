"""Authenticated task commands; clients never select owners, tools or budgets."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from ngertiin.accounts.auth import current_account
from ngertiin.files.contracts import FileInput, OutputSpec
from ngertiin.models import Account
from ngertiin.tasks import actions, budget, commands, creation, store

router = APIRouter(tags=["tasks"])
AccountDep = Annotated[Account, Depends(current_account)]


class CommandInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_key: UUID


class CreateInput(CommandInput):
    thread_id: UUID
    instruction: str = Field(min_length=1, max_length=6000)
    review_required: bool = False
    inputs: list[FileInput] = Field(default_factory=list, max_length=5)
    outputs: list[OutputSpec] = Field(default_factory=list, max_length=10)
    result_id: UUID | None = None
    expected_result_revision: int | None = Field(default=None, ge=1)


class DecisionInput(CommandInput):
    revision: int = Field(ge=1)
    approved: bool


class RevisionInput(CommandInput):
    revision: int = Field(ge=1)
    draft: str = Field(min_length=1, max_length=24000)


@router.get("/tasks")
async def list_tasks(account: AccountDep, thread_id: UUID | None = None):
    return {
        "tasks": await store.listing(account.id, thread_id),
        "budget": await budget.summary(account.id),
    }


@router.post("/tasks", status_code=202)
async def create_task(body: CreateInput, account: AccountDep):
    return await creation.create(
        account.id,
        body.thread_id,
        body.request_key,
        body.instruction,
        body.review_required,
        inputs=[v.model_dump(mode="json") for v in body.inputs],
        outputs=[v.model_dump() for v in body.outputs],
        result_id=body.result_id,
        expected_result_revision=body.expected_result_revision,
    )


@router.get("/tasks/{task_id}")
async def task_detail(task_id: UUID, account: AccountDep):
    return await store.detail(account.id, task_id)


@router.post("/tasks/{task_id}/cancel")
async def cancel(task_id: UUID, account: AccountDep):
    return await commands.cancel(account.id, task_id)


@router.post("/tasks/{task_id}/retry")
async def retry(task_id: UUID, body: CommandInput, account: AccountDep):
    return await commands.retry(account.id, task_id, body.request_key)


@router.post("/tasks/{task_id}/revise")
async def revise(task_id: UUID, body: RevisionInput, account: AccountDep):
    return await commands.revise(account.id, task_id, body.revision, body.draft, body.request_key)


@router.post("/tasks/{task_id}/reconcile")
async def reconcile(task_id: UUID, account: AccountDep):
    return await actions.reconcile(account.id, task_id)


@router.post("/approvals/{action_id}/decision")
async def decide(action_id: UUID, body: DecisionInput, account: AccountDep):
    return await actions.decide(
        account.id, action_id, body.revision, body.approved, body.request_key
    )
