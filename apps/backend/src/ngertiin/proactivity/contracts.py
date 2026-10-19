"""Models can propose assistance, never application commands or grants."""

from datetime import datetime
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Candidate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal[
        "meaningful_update", "needs_input", "goal_next_step", "plan_adjustment", "personalized_idea"
    ]
    title: str = Field(min_length=1, max_length=120)
    action: str | None = Field(
        default=None,
        max_length=600,
        description="Optional bounded next action or exact question when input is needed. "
        "Informative updates need no question. Never promise unperformed work.",
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
        description="New supported information or assistance, not repetition of user news.",
    )
    evidence_ids: list[str] = Field(min_length=1, max_length=6)
    thread_id: UUID
    expires_in_hours: int = Field(default=24, ge=1, le=24, strict=True)

    @model_validator(mode="after")
    def distinct(self):
        if len(set(self.evidence_ids)) != len(self.evidence_ids):
            raise ValueError("Evidence references must be distinct")
        for field in ("title", "why_relevant", "why_now", "what_is_new"):
            if not getattr(self, field).strip():
                raise ValueError("Candidate text must not be blank")
        if self.action is not None and not self.action.strip():
            raise ValueError("Use null for an absent action")
        if self.kind == "needs_input" and not self.action:
            raise ValueError("Input candidates require an exact question")
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


Intensity = Literal["off", "quiet", "normal", "active"]


class PreferenceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_key: UUID
    expected_revision: int = Field(ge=1, strict=True)
    scope: Literal["account", "thread", "goal"] = "account"
    scope_id: UUID | None = None
    intensity: Intensity | None = None
    inherit: bool = False
    timezone: str | None = None
    quiet_enabled: bool | None = None
    quiet_start: int | None = Field(default=None, ge=0, le=1439, strict=True)
    quiet_end: int | None = Field(default=None, ge=0, le=1439, strict=True)
    snoozed_until: datetime | None = None
    clear_snooze: bool = False
    acknowledge: bool = False

    @model_validator(mode="after")
    def valid_preferences(self):
        if (self.scope == "account") != (self.scope_id is None):
            raise ValueError("Scope account has no ID; thread/goal require an exact ID")
        if self.timezone is not None:
            try:
                ZoneInfo(self.timezone)
            except (ZoneInfoNotFoundError, ValueError) as error:
                raise ValueError("Timezone IANA tidak valid") from error
        if self.snoozed_until and self.snoozed_until.tzinfo is None:
            raise ValueError("Waktu jeda harus memuat timezone")
        if self.scope != "account" and any(
            v is not None
            for v in (self.timezone, self.quiet_enabled, self.quiet_start, self.quiet_end)
        ):
            raise ValueError("Jam tenang dan timezone berlaku pada akun")
        if self.inherit and (self.scope == "account" or self.intensity is not None):
            raise ValueError("Pewarisan hanya untuk thread/goal tanpa intensitas baru")
        if self.clear_snooze and self.snoozed_until:
            raise ValueError("Pilih jeda atau hapus jeda")
        return self
