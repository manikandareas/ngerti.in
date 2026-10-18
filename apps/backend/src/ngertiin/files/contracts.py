"""Public file references and finite, versioned product policy."""

from pathlib import PurePath
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ngertiin.config import get_settings

MIB = 1024 * 1024
TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".json": "application/json",
}
OUTPUT_TYPES = {**TYPES, ".html": "text/html"}
OUTPUT_FORMATS = ("md", "txt", "csv", "json", "html")


class FileInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision_id: UUID
    start: int = Field(default=1, ge=1)
    end: int | None = Field(default=None, ge=1)


class OutputSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    filename: str = Field(min_length=1, max_length=180)
    format: Literal["md", "txt", "csv", "json", "html"]

    @field_validator("filename")
    @classmethod
    def safe_name(cls, value: str):
        if clean_name(value) != value or value in (".", ".."):
            raise ValueError("Nama hasil harus berupa nama file tanpa direktori.")
        return value


def clean_name(value: str) -> str:
    name = PurePath(value.replace("\\", "/")).name.strip()
    return "".join(c for c in name if c.isprintable())[:180]


def policy() -> dict:
    settings = get_settings()
    return {
        "version": "product-files-v1",
        "max_file_bytes": settings.file_max_bytes,
        "max_attachment_bytes": settings.file_batch_bytes,
        "max_attachments": 5,
        "max_pdf_pages": 20,
        "max_task_pages": 40,
        "max_output_files": 10,
        "max_output_bytes": 25 * MIB,
        "max_extraction_bytes": 4 * MIB,
        "ocr_account_daily_pages": settings.ocr_account_daily_pages,
        "ocr_global_daily_pages": settings.ocr_global_daily_pages,
        "model": settings.mistral_ocr_model,
        "provider": "mistral",
        "price_version": "ocr-configured-v1",
        "usd_per_1000_pages": str(settings.mistral_ocr_usd_per_1000_pages),
        "retention": "until_deleted",
        "orphan_hours": 24,
    }


def output_specs(values: list[dict]) -> list[dict]:
    if len(values) > 10:
        raise ValueError("Maksimal 10 berkas hasil.")
    specs = [OutputSpec.model_validate(v).model_dump() for v in values]
    names: set[str] = set()
    for spec in specs:
        if not spec["filename"].lower().endswith("." + spec["format"]):
            raise ValueError("Ekstensi nama hasil harus sesuai format.")
        if spec["filename"].casefold() in names:
            raise ValueError("Nama berkas hasil harus berbeda.")
        names.add(spec["filename"].casefold())
    return specs
