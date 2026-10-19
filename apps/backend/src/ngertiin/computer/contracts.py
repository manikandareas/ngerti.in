"""Small typed computer capabilities; no arbitrary code, shell, cookie or profile tools."""

import hashlib
import ipaddress
import socket
from dataclasses import dataclass
from typing import Literal, Protocol
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ngertiin.sandbox.contracts import RuntimeFailure, StagedFile


class ComputerPaused(Exception):
    """Domain state was durably yielded; no worker is needed while waiting."""


class NeedsHuman(ValueError):
    """Sensitive or opaque inputs require private takeover, never an agent action."""


class Action(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["navigate", "click", "type", "key", "scroll", "ask_user", "finish"]
    description: str = Field(min_length=1, max_length=600)
    url: str = Field(default="", max_length=2048)
    x: int = Field(default=640, ge=0, lt=1280)
    y: int = Field(default=360, ge=0, lt=720)
    text: str = Field(default="", max_length=2000)
    key: Literal["Tab", "Enter", "Escape", "BackSpace", "Up", "Down", "Left", "Right"] = "Tab"
    direction: Literal["up", "down"] = "down"
    amount: int = Field(default=3, ge=1, le=8)
    files: list[dict] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def validate_arguments(self):
        if self.kind == "navigate":
            parsed = urlsplit(self.url)
            if (
                parsed.scheme != "https"
                or not parsed.hostname
                or parsed.username
                or parsed.password
                or parsed.port not in (None, 443)
            ):
                raise ValueError("Navigasi agent memerlukan URL HTTPS publik tanpa kredensial.")
        if self.kind == "type" and (not self.text or "\x00" in self.text):
            raise ValueError("Teks aksi tidak valid.")
        return self

    @property
    def requires_approval(self):
        # A screenshot cannot prove that a click/key only reads. Gate these
        # effects in the backend, including actions the model calls harmless.
        return self.kind in ("click", "type", "key")


async def public_url(url: str):
    import asyncio

    host = urlsplit(url).hostname
    try:
        addresses = await asyncio.to_thread(socket.getaddrinfo, host, 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
            raise ValueError("private destination")
    except (ValueError, OSError) as error:
        raise RuntimeFailure(
            "Tujuan browser harus dapat diakses melalui internet publik."
        ) from error


@dataclass(frozen=True)
class Screen:
    png: bytes

    @property
    def fingerprint(self):
        return hashlib.sha256(self.png).hexdigest()


class ComputerRuntime(Protocol):
    name: str

    async def start(self, workspace: dict, seconds: int) -> str: ...
    async def observe(self, workspace: dict) -> Screen: ...
    async def act(self, workspace: dict, action: Action) -> None: ...
    async def target(self, workspace: dict, action: Action) -> str: ...
    async def collect(self, workspace: dict, filenames: list[str]) -> list[StagedFile]: ...
    async def stop(self, workspace: dict) -> dict: ...
    async def delete(self, workspace: dict) -> bool: ...
    async def preview(self, workspace: dict) -> str: ...
    async def heartbeat(self, workspace: dict) -> None: ...
