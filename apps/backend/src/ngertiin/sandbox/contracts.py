"""No provider SDK types cross this interface. Unknown effects are never replayable."""

from dataclasses import dataclass
from typing import Literal, Protocol


@dataclass(frozen=True)
class RuntimeInfo:
    provider: str
    version: str
    cpu: int
    ram_gib: int
    disk_gib: int
    provider_version: str = ""


@dataclass(frozen=True)
class SessionSpec:
    name: str
    task_id: str
    owner_id: str
    ttl_minutes: int


@dataclass(frozen=True)
class SandboxRef:
    id: str
    name: str


@dataclass(frozen=True)
class Observation:
    state: Literal["running", "stopped", "pending", "absent"]
    network_blocked: bool = False


@dataclass(frozen=True)
class StagedFile:
    filename: str
    data: bytes


@dataclass(frozen=True)
class ExecutionReceipt:
    exit_code: int
    stdout: str
    duration_ms: int


class RuntimeFailure(ValueError):
    def __init__(self, message: str, *, unknown: bool = False):
        super().__init__(message)
        self.unknown = unknown


class RuntimePending(ValueError):
    """The resource/effect needs reconciliation before another dispatch."""


class SandboxRuntime(Protocol):
    """All I/O is bounded. delete confirms absence; inspect never starts a resource.

    Provision uses a deterministic name and absolute provider TTL. Adapters must
    enforce resource/network policy outside untrusted code, clear its environment,
    and terminate descendants before collecting bounded, regular-file outputs.
    A transport failure is an unknown effect, not evidence of non-execution.
    """

    name: str

    async def preflight(self) -> RuntimeInfo: ...
    async def create(self, spec: SessionSpec) -> SandboxRef: ...
    async def inspect(self, name: str) -> Observation: ...
    async def stage(self, ref: SandboxRef, files: list[StagedFile]) -> None: ...
    async def execute(self, ref: SandboxRef, code: str, seconds: int) -> ExecutionReceipt: ...
    async def collect(self, ref: SandboxRef, filenames: list[str]) -> list[StagedFile]: ...
    async def delete(self, name: str) -> bool: ...
