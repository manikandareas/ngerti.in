"""Exact, bounded user edits and proposals. Owner and status are server-owned."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PersonaContent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=50)
    tagline: str = Field(max_length=160)
    avatar: Literal["gwen", "initial"]
    soul: str = Field(min_length=1, max_length=4000)

    @model_validator(mode="after")
    def bounded(self):
        self.name, self.tagline, self.soul = (
            self.name.strip(),
            self.tagline.strip(),
            self.soul.strip(),
        )
        if not self.name or not self.soul or len(self.soul.encode()) > 6000:
            raise ValueError("Nama dan karakter wajib diisi; karakter maksimal 6000 byte.")
        if any(ord(c) < 32 for c in self.name + self.tagline):
            raise ValueError("Nama dan deskripsi harus berupa satu baris.")
        return self


class EditInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_key: UUID
    expected_revision: int = Field(ge=1)
    content: PersonaContent


class RestoreInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_key: UUID
    expected_revision: int = Field(ge=1)
    revision: int = Field(ge=1)


class DecisionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    approved: bool
