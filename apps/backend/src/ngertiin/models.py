"""Persisted account identity shared with the authenticated engine transport."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import Column, DateTime
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(UTC)


class Account(SQLModel, table=True):
    __tablename__ = "accounts"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    clerk_user_id: str = Field(unique=True, index=True, max_length=255)
    created_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True)))


__all__ = ["Account", "utcnow"]
