"""Validated process configuration; secrets never leave the backend."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT / ".env", extra="ignore", hide_input_in_errors=True
    )

    app_env: Literal["development", "production"] = "development"
    enable_dev_diagnostics: bool = False
    web_origin: str = "http://localhost:3000"
    database_url: SecretStr
    clerk_secret_key: SecretStr = SecretStr("")
    s3_endpoint_url: str
    s3_region: str = "us-east-1"
    s3_bucket: str
    s3_access_key_id: SecretStr
    s3_secret_access_key: SecretStr
    s3_addressing_style: Literal["path", "virtual", "auto"] = "path"
    openai_api_key: SecretStr = SecretStr("")
    openai_model: str = "gpt-6-luna"
    openai_base_url: str = "https://api.openai.com/v1"
    chat_max_output_tokens: int = Field(default=3000, ge=256, le=16000)
    chat_run_timeout_seconds: int = Field(default=180, ge=15, le=600)
    chat_max_model_calls: int = Field(default=6, ge=1, le=12)
    memory_enabled: bool = True
    memory_extraction_model: str = "gpt-5-mini"
    memory_embedding_model: str = "text-embedding-3-small"
    memory_embedding_dims: int = Field(default=1536, ge=256, le=2000)
    memory_context_bytes: int = Field(default=4000, ge=512, le=8000)
    memory_input_bytes: int = Field(default=6000, ge=1000, le=12000)
    memory_account_daily_units: int = Field(default=250000, ge=10000, le=2000000)
    memory_global_daily_units: int = Field(default=2500000, ge=100000, le=20000000)
    memory_job_units: int = Field(default=160000, ge=30000, le=300000)
    task_budget_units: int = Field(default=60000, ge=30000, le=120000)
    task_account_daily_units: int = Field(default=240000, ge=60000, le=2000000)
    task_global_daily_units: int = Field(default=2400000, ge=60000, le=20000000)
    mistral_api_key: SecretStr = SecretStr("")
    mistral_ocr_model: str = "mistral-ocr-4-1"
    mistral_ocr_usd_per_1000_pages: float = Field(default=4, ge=0, le=100)
    file_max_bytes: int = Field(default=10485760, ge=1024, le=10485760)
    file_batch_bytes: int = Field(default=26214400, ge=1024, le=26214400)
    file_account_bytes: int = Field(default=262144000, ge=10485760, le=1073741824)
    ocr_account_daily_pages: int = Field(default=100, ge=1, le=10000)
    ocr_global_daily_pages: int = Field(default=1000, ge=1, le=100000)
    daytona_api_key: SecretStr = SecretStr("")
    daytona_api_url: str = "https://app.daytona.io/api"
    daytona_target: str | None = None
    sandbox_provider: str = "daytona"
    sandbox_price_version: str = "daytona-linux-2026-10-18"
    sandbox_resource_microusd_per_hour: int = Field(default=166464, ge=0, le=180000)
    sandbox_account_daily_microusd: int = Field(default=1000000, ge=36000, le=10000000)
    sandbox_global_daily_microusd: int = Field(default=5000000, ge=36000, le=50000000)
    computer_task_seconds: int = Field(default=1200, ge=120, le=1200)
    computer_retention_days: int = Field(default=7, ge=1, le=7)
    computer_storage_microusd_per_hour: int = Field(default=864, ge=1, le=1200)

    @model_validator(mode="after")
    def validate_production(self) -> "Settings":
        if self.app_env == "production":
            if self.enable_dev_diagnostics:
                raise ValueError("ENABLE_DEV_DIAGNOSTICS must be false in production")
            if not self.clerk_secret_key.get_secret_value():
                raise ValueError("CLERK_SECRET_KEY is required in production")
            if not self.web_origin.startswith("https://"):
                raise ValueError("WEB_ORIGIN must use HTTPS in production")
            if not self.s3_endpoint_url.startswith("https://"):
                raise ValueError("S3_ENDPOINT_URL must use HTTPS in production")
        return self

    @property
    def diagnostics_enabled(self) -> bool:
        return self.app_env == "development" and self.enable_dev_diagnostics

    @property
    def allowed_origins(self) -> list[str]:
        origins = [self.web_origin.rstrip("/")]
        if self.app_env == "development":
            origins += ["http://localhost:3000", "http://127.0.0.1:3000"]
        return sorted(set(origins))


@lru_cache
def get_settings() -> Settings:
    return Settings()


__all__ = ["ROOT", "Settings", "get_settings"]
