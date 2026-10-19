"""Models can propose assistance, never application commands or grants."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Candidate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal[
        "meaningful_update", "needs_input", "goal_next_step", "plan_adjustment", "personalized_idea"
    ]
    title: str = Field(min_length=1, max_length=120)
    action: str = Field(
        min_length=1,
        max_length=600,
        description="One optional question offering a bounded draft; missing facts "
        "stay placeholders. Never promise completed or ready-to-submit output.",
    )
    why_relevant: str = Field(
        min_length=1,
        max_length=300,
        description="One short sentence linking the offer to an evidenced need.",
    )
    why_now: str = Field(
        min_length=1,
        max_length=300,
        description="One observed change only. No speculative risks or consequences.",
    )
    what_is_new: str = Field(
        min_length=1,
        max_length=300,
        description="The new assistance offered, not news the user already said.",
    )
    evidence_ids: list[str] = Field(min_length=1, max_length=6)
    thread_id: UUID
    expires_in_hours: int = Field(default=24, ge=1, le=24, strict=True)

    @model_validator(mode="after")
    def distinct(self):
        if len(set(self.evidence_ids)) != len(self.evidence_ids):
            raise ValueError("Evidence references must be distinct")
        for field in ("title", "action", "why_relevant", "why_now", "what_is_new"):
            if not getattr(self, field).strip():
                raise ValueError("Candidate text must not be blank")
        return self


class Proposals(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidates: list[Candidate] = Field(max_length=5)


class EvaluationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    thread_id: UUID | None = None


class ConfigureInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool
    expected_revision: int = Field(ge=1, strict=True)
