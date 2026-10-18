"""Daytona SDK stays here; generated code runs as an unprivileged, offline user."""

import asyncio
import json
import shlex
import time
from importlib.metadata import version
from pathlib import Path

from daytona import AsyncDaytona, CreateSandboxFromSnapshotParams, DaytonaConfig
from daytona.common.errors import DaytonaNotFoundError
from daytona_api_client_async import ConfigApi

from ngertiin.config import get_settings
from ngertiin.files.contracts import clean_name, policy
from ngertiin.sandbox.contracts import (
    ExecutionReceipt,
    Observation,
    RuntimeFailure,
    RuntimeInfo,
    SandboxRef,
    SessionSpec,
    StagedFile,
)

SNAPSHOT = "daytona-medium"
ROOT = "/opt/ngertiin"
WORK = "/tmp/ngertiin-work"
CONTROL = "/tmp/ngertiin-control"


def supervisor(command: str) -> str:
    return "sudo -n bash -c " + shlex.quote(command)


def client() -> AsyncDaytona:
    settings = get_settings()
    if not settings.daytona_api_key.get_secret_value():
        raise RuntimeFailure("Komputasi belum tersedia. Kredensial runtime belum dikonfigurasi.")
    if not settings.daytona_api_url.startswith("https://"):
        raise RuntimeFailure("Endpoint runtime wajib HTTPS.")
    return AsyncDaytona(
        DaytonaConfig(
            api_key=settings.daytona_api_key.get_secret_value(),
            api_url=settings.daytona_api_url,
            target=settings.daytona_target,
            otel_enabled=False,
        )
    )


def filename(value: str) -> str:
    if value != clean_name(value) or value in ("", ".", ".."):
        raise RuntimeFailure("Nama berkas komputasi tidak valid.")
    return value


class DaytonaAdapter:
    name = "daytona"

    def __init__(self):
        if not get_settings().daytona_api_key.get_secret_value():
            raise RuntimeFailure("Kredensial runtime belum dikonfigurasi.")

    async def preflight(self) -> RuntimeInfo:
        async with asyncio.timeout(20), client() as api:
            snap = await api.snapshot.get(SNAPSHOT)
            config = await ConfigApi(api._api_client).config_controller_get_config()
        if (snap.cpu, snap.mem, snap.disk, snap.gpu) != (2, 4, 8, 0):
            raise RuntimeFailure("Alokasi runtime berubah. Policy dan budget perlu ditinjau.")
        return RuntimeInfo(self.name, version("daytona"), 2, 4, 8, config.version)

    async def create(self, spec: SessionSpec) -> SandboxRef:
        if not 1 <= spec.ttl_minutes <= 10:
            raise RuntimeFailure("TTL runtime harus 1–10 menit.")
        await self.preflight()
        try:
            async with client() as api:
                sandbox = await api.create(
                    CreateSandboxFromSnapshotParams(
                        name=spec.name,
                        snapshot=SNAPSHOT,
                        public=False,
                        network_block_all=True,
                        ttl_minutes=spec.ttl_minutes,
                        auto_stop_interval=3,
                        auto_delete_interval=0,
                        labels={"ngertiin": "ng035", "task": spec.task_id},
                    ),
                    timeout=60,
                )
                if (sandbox.cpu, sandbox.memory, sandbox.disk) != (2, 4, 8):
                    raise RuntimeFailure("Alokasi resource tidak sesuai policy.", unknown=True)
                if sandbox.network_block_all is not True:
                    raise RuntimeFailure(
                        "Runtime belum mengonfirmasi isolasi jaringan.", unknown=True
                    )
                return SandboxRef(sandbox.id, spec.name)
        except RuntimeFailure:
            raise
        except Exception as error:
            # Even a failed create acknowledgement can leave a billed resource.
            raise RuntimeFailure(
                "Provisioning belum terkonfirmasi. Resource akan diperiksa sebelum retry.",
                unknown=True,
            ) from error

    async def inspect(self, name: str) -> Observation:
        async with client() as api:
            try:
                sandbox = await api.get(name, request_timeout=15)
            except DaytonaNotFoundError:
                return Observation("absent")
            state = str(sandbox.state.value if hasattr(sandbox.state, "value") else sandbox.state)
            return Observation(
                "running" if state == "started" else "stopped" if state == "stopped" else "pending",
                sandbox.network_block_all is True,
            )

    async def stage(self, ref: SandboxRef, files: list[StagedFile]) -> None:
        rules = policy()
        if (
            len(files) > 15
            or any(len(file.data) > rules["max_file_bytes"] for file in files)
            or sum(len(file.data) for file in files) > 2 * rules["max_attachment_bytes"]
        ):
            raise RuntimeFailure("Input runtime melebihi batas transfer.")
        async with client() as api:
            sandbox = await api.get(ref.id, request_timeout=15)
            result = await sandbox.process.exec(
                f"mkdir -m 700 -p {CONTROL}; "
                + supervisor(
                    f"install -d -m 755 {ROOT} {WORK} {WORK}/inputs; "
                    f"install -d -m 700 -o 65534 -g 65534 {WORK}/outputs; "
                    "test $(id -u) = 0 && command -v setpriv "
                    "&& command -v prlimit && command -v timeout"
                ),
                timeout=10,
            )
            if result.exit_code:
                raise RuntimeFailure(
                    "Snapshot tidak menyediakan supervisor isolasi yang diperlukan."
                )
            for file in files:
                await sandbox.fs.upload_file(
                    file.data, f"{CONTROL}/{filename(file.filename)}", timeout=20
                )
                result = await sandbox.process.exec(
                    supervisor(
                        f"install -m 444 {shlex.quote(CONTROL + '/' + file.filename)} "
                        f"{shlex.quote(WORK + '/inputs/' + file.filename)}"
                    ),
                    timeout=5,
                )
                if result.exit_code:
                    raise RuntimeFailure("Input runtime gagal disiapkan.")
            result = await sandbox.process.exec(
                supervisor(f"chmod -R a-w {WORK}/inputs"), timeout=5
            )
            if result.exit_code:
                raise RuntimeFailure("Input runtime gagal dikunci.")

    async def execute(self, ref: SandboxRef, code: str, seconds: int) -> ExecutionReceipt:
        if len(code.encode()) > 20000 or not 1 <= seconds <= 60:
            raise RuntimeFailure("Kode atau deadline melebihi policy runtime.")
        async with client() as api:
            sandbox = await api.get(ref.id, request_timeout=15)
            await sandbox.fs.upload_file(code.encode(), CONTROL + "/job.py", timeout=15)
            await sandbox.fs.upload_file(
                Path(__file__).with_name("runner.py").read_bytes(),
                CONTROL + "/runner.py",
                timeout=15,
            )
            # Hard limits cannot be raised by UID 65534. no-new-privs prevents
            # sudo/setuid, env -i removes inherited values. The trusted launcher
            # installs inherited seccomp rules: a provider firewall flag alone
            # is not proof of zero egress on every organization tier.
            command = (
                f"install -m 444 {CONTROL}/job.py {ROOT}/job.py; rm -rf {WORK}/outputs; "
                f"install -m 444 {CONTROL}/runner.py {ROOT}/runner.py; "
                f"install -d -m 700 -o 65534 -g 65534 {WORK}/outputs; "
                "set -o pipefail; "
                f"timeout --kill-after=2s {seconds}s "
                "setpriv --reuid=65534 --regid=65534 --clear-groups --no-new-privs "
                "--inh-caps=-all --ambient-caps=-all "
                "prlimit --nofile=64:64 --nproc=64:64 --fsize=10485760:10485760 "
                f"--cpu={seconds}:{seconds} --as=2147483648:2147483648 -- "
                "env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/tmp LANG=C.UTF-8 "
                "OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 "
                f"python3 -I {ROOT}/runner.py 2>&1 | head -c 16000; "
                "rc=${PIPESTATUS[0]}; pkill -KILL -u 65534 2>/dev/null || true; exit $rc"
            )
            started = time.monotonic()
            try:
                async with asyncio.timeout(seconds + 15):
                    result = await sandbox.process.exec(
                        supervisor(command), cwd=WORK, timeout=seconds + 10
                    )
            except Exception as error:
                raise RuntimeFailure(
                    "Eksekusi belum terkonfirmasi. Tidak menjalankan ulang secara otomatis.",
                    unknown=True,
                ) from error
            return ExecutionReceipt(
                result.exit_code, result.result[:16000], round((time.monotonic() - started) * 1000)
            )

    async def collect(self, ref: SandboxRef, filenames: list[str]) -> list[StagedFile]:
        names = [filename(n) for n in filenames]
        if len(names) > 10:
            raise RuntimeFailure("Maksimal sepuluh berkas hasil.")
        rules, output, total = policy(), [], 0
        async with client() as api:
            sandbox = await api.get(ref.id, request_timeout=15)
            # No untrusted process remains. lstat rejects links/FIFOs/devices and
            # root-owned parent directories prevent replacement of the output dir.
            inspection = (
                "import json,os,stat; names=" + repr(names) + "; rows=[]\n"
                "for name in names:\n"
                f" p={WORK!r}+'/outputs/'+name; s=os.lstat(p)\n"
                " assert stat.S_ISREG(s.st_mode) and s.st_nlink==1\n"
                " os.chmod(p,0o444)\n"
                " rows.append({'name':name,'size':s.st_size})\n"
                f"os.chmod({WORK!r}+'/outputs',0o755)\nprint(json.dumps(rows))"
            )
            result = await sandbox.process.exec(
                supervisor("python3 -c " + shlex.quote(inspection)), timeout=5
            )
            if result.exit_code:
                raise RuntimeFailure("Hasil belum lengkap atau bukan berkas biasa yang aman.")
            for row in json.loads(result.result):
                if not 0 < row["size"] <= rules["max_file_bytes"]:
                    raise RuntimeFailure("Ukuran hasil komputasi melebihi batas.")
                total += row["size"]
                if total > rules["max_output_bytes"]:
                    raise RuntimeFailure("Total hasil komputasi melebihi 25 MiB.")
                chunks, received = [], 0
                stream = await sandbox.fs.download_file_stream(
                    f"{WORK}/outputs/{row['name']}", timeout=20
                )
                try:
                    async for chunk in stream:
                        received += len(chunk)
                        if received > row["size"]:
                            raise RuntimeFailure("Ukuran hasil berubah saat diambil.")
                        chunks.append(chunk)
                finally:
                    await stream.aclose()
                if received != row["size"]:
                    raise RuntimeFailure("Berkas hasil belum lengkap.")
                output.append(StagedFile(row["name"], b"".join(chunks)))
        return output

    async def delete(self, name: str) -> bool:
        async with client() as api:
            try:
                sandbox = await api.get(name, request_timeout=15)
            except DaytonaNotFoundError:
                return True
            await api.delete(sandbox, wait=True, timeout=45)
        return (await self.inspect(name)).state == "absent"
