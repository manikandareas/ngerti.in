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
