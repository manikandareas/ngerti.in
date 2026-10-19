"""Public schedule input never selects owners, grants or provider policy."""

from datetime import date, time
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ngertiin.files.contracts import FileInput, OutputSpec
from ngertiin.goals.contracts import GoalRef


class ScheduleSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=100)
    instruction: str = Field(min_length=1, max_length=6000)
    timezone: str = Field(max_length=100)
    frequency: Literal["once", "daily", "weekly", "interval"]
    interval_hours: int | None = Field(default=None, ge=1, le=8760, strict=True)
    start_date: date
    local_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    weekdays: list[int] = Field(default_factory=list, max_length=7)
    runtime_kind: Literal["text", "code", "browser"] = "text"
    review_required: bool = False
    per_run_cap: int = Field(default=60000, ge=30000, le=120000)
    inputs: list[FileInput] = Field(default_factory=list, max_length=5)
    outputs: list[OutputSpec] = Field(default_factory=list, max_length=10)
    goal: GoalRef | None = None

    @model_validator(mode="after")
    def valid(self):
        self.title, self.instruction = self.title.strip(), self.instruction.strip()
        if not self.title or not self.instruction or len(self.instruction.encode()) > 6000:
            raise ValueError("Judul/instruksi kosong atau terlalu panjang.")
        try:
            ZoneInfo(self.timezone)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError("Gunakan zona waktu IANA, misalnya Asia/Makassar.") from error
        if any(type(d) is not int or d not in range(7) for d in self.weekdays):
            raise ValueError("Hari memakai Senin=0 sampai Minggu=6.")
        self.weekdays = sorted(set(self.weekdays))
        if self.frequency == "weekly" and not self.weekdays:
            raise ValueError("Pilih setidaknya satu hari.")
        if self.frequency == "interval" and self.interval_hours is None:
            raise ValueError("Isi interval 1–8760 jam dalam bilangan bulat.")
        if self.frequency != "interval":
            self.interval_hours = None
        if self.runtime_kind == "browser" and self.inputs:
            raise ValueError("Lampiran diproses melalui Task teks/Python.")
        if not 2000 <= self.start_date.year <= 2100:
            raise ValueError("Tanggal jadwal harus berada pada tahun 2000–2100.")
        time.fromisoformat(self.local_time)
        return self


class ProposalInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_key: UUID
    thread_id: UUID
    operation: Literal["create", "update", "pause", "resume", "delete", "run"]
    schedule_id: UUID | None = None
    expected_revision: int | None = Field(default=None, ge=1)
    spec: ScheduleSpec | None = None


class DecisionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    approved: bool
