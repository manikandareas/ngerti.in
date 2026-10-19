"""Explicit resource identities; clients never supply account or storage paths."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

Kind = Literal["thread", "task", "file", "result", "goal", "schedule"]


class ResourceRef(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Kind
    id: UUID
    revision: int | None = Field(default=None, ge=1)
    revision_id: UUID | None = None

    @model_validator(mode="after")
    def identity(self):
        if self.kind != "file" and self.revision_id is not None:
            raise ValueError("Revision file hanya berlaku pada referensi file.")
        if self.kind == "thread" and self.revision is not None:
            raise ValueError("Percakapan tidak memakai revision file.")
        return self


class SearchInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(default="", max_length=300)
    kinds: list[Kind] = Field(default_factory=list, max_length=6)
    since: datetime | None = None
    until: datetime | None = None
    sort: Literal["relevance", "recent", "title"] = "relevance"
    offset: int = Field(default=0, ge=0, le=100000)
    limit: int = Field(default=20, ge=1, le=50)

    @model_validator(mode="after")
    def valid(self):
        self.query = self.query.strip()
        if any(d and d.tzinfo is None for d in (self.since, self.until)):
            raise ValueError("Waktu pencarian harus menyertakan zona waktu.")
        if self.since and self.until and self.since >= self.until:
            raise ValueError("Rentang waktu pencarian tidak valid.")
        return self
