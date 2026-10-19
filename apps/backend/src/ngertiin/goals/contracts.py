"""Explicit, bounded goal commands; owners and grants are never client selected."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class GoalRef(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    revision: int = Field(ge=1)


class GoalSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=100)
    target: str = Field(min_length=1, max_length=2000)
    criteria: list[str] = Field(min_length=1, max_length=12)
    horizon: str = Field(default="", max_length=200)
    next_action: str = Field(default="", max_length=1000)
    budget_cap: int = Field(default=360000, ge=30000, le=3000000, strict=True)

    @model_validator(mode="after")
    def bounded(self):
        self.title, self.target = self.title.strip(), self.target.strip()
        self.criteria = [item.strip() for item in self.criteria]
        if not self.title or not self.target or any(not c or len(c) > 500 for c in self.criteria):
            raise ValueError("Isi target dan 1–12 kriteria, masing-masing maksimal 500 karakter.")
        if (
            len(set(self.criteria)) != len(self.criteria)
            or len(self.model_dump_json().encode()) > 12000
        ):
            raise ValueError("Kriteria harus berbeda dan keseluruhan tujuan maksimal 12.000 byte.")
        return self


class EvidenceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    criterion: int = Field(ge=0, le=11)
    state: Literal["unmet", "in_progress", "met"]
    note: str = Field(min_length=1, max_length=2000)
    task_id: UUID | None = None
    result_id: UUID | None = None
    result_revision: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def valid(self):
        self.note = self.note.strip()
        if not self.note or bool(self.result_id) != bool(self.result_revision):
            raise ValueError("Isi catatan dan pilih ID/revisi hasil secara lengkap.")
        return self


class ProposalInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_key: UUID
    thread_id: UUID
    operation: Literal["create", "update", "pause", "resume", "complete", "archive", "evidence"]
    goal_id: UUID | None = None
    expected_revision: int | None = Field(default=None, ge=1)
    spec: GoalSpec | None = None
    evidence: EvidenceInput | None = None


class DecisionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    approved: bool
