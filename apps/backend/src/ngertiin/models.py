"""Persisted identities and the development diagnostic slice."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import Column, DateTime, UniqueConstraint
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(UTC)


class Account(SQLModel, table=True):
    __tablename__ = "accounts"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    clerk_user_id: str = Field(unique=True, index=True, max_length=255)
    created_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True)))


class DiagnosticRun(SQLModel, table=True):
    __tablename__ = "diagnostic_runs"
    __table_args__ = (UniqueConstraint("owner_id", "request_key"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    owner_id: UUID = Field(foreign_key="accounts.id", index=True)
    request_key: UUID
    job_id: int | None = None
    status: str = Field(default="queued", max_length=32)
    delay_seconds: int = 10
    artifact_id: UUID | None = None
    error: str | None = Field(default=None, max_length=1000)
    created_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True)))
    updated_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True)))


class StoredObject(SQLModel, table=True):
    __tablename__ = "stored_objects"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    owner_id: UUID = Field(foreign_key="accounts.id", index=True)
    object_key: str = Field(unique=True, max_length=1024)
    filename: str = Field(max_length=255)
    content_type: str = Field(max_length=255)
    size: int
    created_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True)))


__all__ = ["Account", "DiagnosticRun", "StoredObject", "utcnow"]
