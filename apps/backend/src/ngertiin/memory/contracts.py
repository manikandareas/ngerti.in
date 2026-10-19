"""Memory inputs carry revisions and request keys, never caller-selected owners."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class Candidate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str = Field(pattern=r"^[a-z][a-z0-9_.-]{2,99}$")
    kind: Literal["fact", "preference", "observation"]
    statement: str = Field(min_length=3, max_length=500)
    anchor: str = Field(min_length=3, max_length=700)
    confidence: float = Field(ge=0, le=1)
    change: Literal["new", "correction", "change"] = "new"
    valid_from: datetime | None = None


class Admission(BaseModel):
    model_config = ConfigDict(extra="forbid")
    memories: list[Candidate] = Field(max_length=5)


class EditInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_key: UUID
    expected_revision: int = Field(ge=1)
    statement: str = Field(min_length=3, max_length=500)
    kind: Literal["fact", "preference", "observation"]
    change: Literal["correction", "change"] = "correction"


class ForgetInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_key: UUID
    expected_revision: int = Field(ge=1)


class SettingsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_key: UUID
    expected_revision: int = Field(ge=1)
    capture_enabled: bool


class CaptureInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_kind: Literal["message", "file", "result"]
    source_id: UUID
    source_revision: str = Field(min_length=1, max_length=100)
