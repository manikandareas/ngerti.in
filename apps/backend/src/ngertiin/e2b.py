"""Bounded E2B SDK operations shared only by the two provider adapters."""

from datetime import UTC, datetime

from e2b import AsyncSandbox, CommandExitException, NotFoundException
from e2b.sandbox.sandbox_api import SandboxQuery, SandboxState

from ngertiin.config import get_settings
from ngertiin.sandbox.contracts import RuntimeFailure


def options():
    key = get_settings().e2b_api_key.get_secret_value()
    if not key:
        raise RuntimeFailure("E2B_API_KEY belum dikonfigurasi.")
    return {"api_key": key, "request_timeout": 20, "retries": 0}


async def find(name):
    pager = AsyncSandbox.list(
        query=SandboxQuery(
            metadata={"ngertiin_resource": name},
            state=[SandboxState("running"), SandboxState("paused")],
        ),
        **options(),
    )
    found = []
    while pager.has_next:
        found.extend(await pager.next_items())
        if len(found) > 1:
            raise RuntimeFailure("Identitas resource E2B ambigu; perlu rekonsiliasi.", unknown=True)
    return found[0] if found else None


async def info(ident):
    try:
        return await AsyncSandbox.get_info(ident, **options())
    except NotFoundException:
        return None


def allocation(value):
    if (value.cpu_count, value.memory_mb) != (2, 4096):
        raise RuntimeFailure("Alokasi E2B harus 2 vCPU/4 GiB. Periksa template.", unknown=True)
    if not value.network or value.network.get("allow_public_traffic") is not False:
        raise RuntimeFailure("Ingress E2B belum terproteksi.", unknown=True)


async def attach(value, *, seconds=None, resume=False):
    if value is None:
        raise RuntimeFailure("Resource E2B tidak ditemukan.")
    if not resume and str(value.state) != "running":
        raise RuntimeFailure("Komputer sudah berhenti; mulai sesi baru untuk melanjutkan.")
    remaining = (
        seconds if seconds is not None else int((value.end_at - datetime.now(UTC)).total_seconds())
    )
    if remaining < 1:
        raise RuntimeFailure("Deadline E2B telah berakhir.")
    sandbox = await AsyncSandbox.connect(value.sandbox_id, timeout=remaining, **options())
    # connect only extends expiry; set_timeout also shortens it to the app deadline.
    if seconds is not None:
        await sandbox.set_timeout(seconds, request_timeout=15)
    return sandbox


async def run(sandbox, command, *, seconds=15, user="user", cwd=None):
    try:
        return await sandbox.commands.run(
            command, user=user, cwd=cwd, timeout=seconds, request_timeout=seconds + 5
        )
    except CommandExitException as error:
        # A confirmed nonzero exit is a receipt, not a transport/unknown outcome.
        return error
