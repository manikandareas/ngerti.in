"""Validated process configuration; secrets never leave the backend."""

from functools import lru_cache
from pathlib import Path
from typing import Literal
from uuid import UUID

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT / ".env", extra="ignore", hide_input_in_errors=True
    )

    unlimited_account_ids: frozenset[UUID] = frozenset()

    app_env: Literal["development", "production"] = "development"
    enable_dev_diagnostics: bool = False
    web_origin: str = "http://localhost:3000"
    nma_partitions_file: str = ""
    nma_partition_driver: list[str] = Field(default_factory=list)
    clerk_webhook_signing_secret: SecretStr = SecretStr("")
    database_url: SecretStr
    clerk_secret_key: SecretStr = SecretStr("")
    e2b_api_key: SecretStr = SecretStr("")
    e2b_computer_template: str = "ngertiin-desktop-v2"
    billing_mode: Literal["test", "live"] = "test"
    billing_public_api_url: str = ""
    duitku_enabled: bool = False
    duitku_merchant_code: str = ""
    duitku_api_key: SecretStr = SecretStr("")
    duitku_card_method: Literal["MG", "VC"] = "MG"
    duitku_signature_algorithm: Literal["md5", "hmac_sha256"] = "md5"
    lemonsqueezy_enabled: bool = False
    lemonsqueezy_api_key: SecretStr = SecretStr("")
    lemonsqueezy_webhook_secret: SecretStr = SecretStr("")
    lemonsqueezy_store_id: str = ""
    lemonsqueezy_variant_id: str = ""
    lemonsqueezy_currency: Literal["IDR", "USD"] = "IDR"
    lemonsqueezy_price_minor: int = Field(default=27075000, ge=1)

    @model_validator(mode="after")
    def validate_production(self) -> "Settings":
        if self.app_env == "production":
            if (self.duitku_enabled or self.lemonsqueezy_enabled) and self.billing_mode != "live":
                raise ValueError("Enabled production billing requires BILLING_MODE=live")
            if self.enable_dev_diagnostics:
                raise ValueError("ENABLE_DEV_DIAGNOSTICS must be false in production")
            if not self.clerk_secret_key.get_secret_value():
                raise ValueError("CLERK_SECRET_KEY is required in production")
            if not self.web_origin.startswith("https://"):
                raise ValueError("WEB_ORIGIN must use HTTPS in production")
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
