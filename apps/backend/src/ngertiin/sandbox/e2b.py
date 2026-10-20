"""E2B offline execution; the trusted launcher preserves UID/seccomp isolation."""

import asyncio
import json
import shlex
import time
from importlib.metadata import version
from pathlib import Path

from e2b import AsyncSandbox, AsyncTemplate

from ngertiin import e2b
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

ROOT, WORK, CONTROL = "/opt/ngertiin", "/tmp/ngertiin-work", "/tmp/ngertiin-control"


def filename(value):
    if value != clean_name(value) or value in ("", ".", ".."):
        raise RuntimeFailure("Nama berkas komputasi tidak valid.")
    return value


class E2BAdapter:
    name = "e2b"

    async def preflight(self):
        if not await AsyncTemplate.exists(get_settings().e2b_sandbox_template, **e2b.options()):
            raise RuntimeFailure("Template E2B kode belum tersedia. Jalankan build template.")
        return RuntimeInfo(self.name, version("e2b"), 2, 4, 22)

    async def create(self, spec: SessionSpec):
        if not 1 <= spec.ttl_minutes <= 10:
            raise RuntimeFailure("TTL runtime harus 1–10 menit.")
        await self.preflight()
        if await e2b.find(spec.name):
            raise RuntimeFailure(
                "Resource sebelumnya masih ada; rekonsiliasi sebelum retry.", unknown=True
            )
        try:
            sandbox = await AsyncSandbox.create(
                template=get_settings().e2b_sandbox_template,
                timeout=spec.ttl_minutes * 60,
                metadata={"ngertiin_resource": spec.name, "ngertiin": "code", "task": spec.task_id},
                allow_internet_access=False,
                network={"allow_public_traffic": False},
                lifecycle={"on_timeout": "kill", "auto_resume": False},
                **e2b.options(),
            )
            value = await sandbox.get_info(request_timeout=15)
            e2b.allocation(value)
            if value.allow_internet_access is not False:
                raise RuntimeFailure("E2B belum mengonfirmasi isolasi jaringan.", unknown=True)
            return SandboxRef(sandbox.sandbox_id, spec.name)
        except Exception as error:
            raise RuntimeFailure(
                "Provisioning E2B belum terkonfirmasi; akan direkonsiliasi.", unknown=True
            ) from error

    async def inspect(self, name):
        value = await e2b.find(name)
        if value is None:
            return Observation("absent")
        value = await e2b.info(value.sandbox_id)
        if value is None:
            return Observation("absent")
        return Observation(
            "running" if str(value.state) == "running" else "stopped",
            value.allow_internet_access is False,
        )

    async def stage(self, ref, files):
        rules = policy()
        if (
            len(files) > 15
            or any(len(f.data) > rules["max_file_bytes"] for f in files)
            or sum(len(f.data) for f in files) > 2 * rules["max_attachment_bytes"]
        ):
            raise RuntimeFailure("Input runtime melebihi batas transfer.")
        sandbox = await e2b.attach(await e2b.info(ref.id))
        command = (
            f"install -d -m 700 {CONTROL}; install -d -m 755 {ROOT} {WORK} {WORK}/inputs; "
            f"install -d -m 700 -o 65534 -g 65534 {WORK}/outputs; "
            "command -v setpriv && command -v prlimit && command -v timeout"
        )
        result = await e2b.run(sandbox, command, user="root")
        if result.exit_code:
            raise RuntimeFailure("Template E2B belum menyediakan supervisor isolasi.")
        for file in files:
            path = f"{CONTROL}/{filename(file.filename)}"
            await sandbox.files.write(path, file.data, user="root", request_timeout=20)
            target = shlex.quote(WORK + "/inputs/" + file.filename)
            result = await e2b.run(
                sandbox,
                f"install -m 444 {shlex.quote(path)} {target}",
                user="root",
            )
            if result.exit_code:
                raise RuntimeFailure("Input runtime gagal disiapkan.")
        result = await e2b.run(sandbox, f"chmod -R a-w {WORK}/inputs", user="root")
        if result.exit_code:
            raise RuntimeFailure("Input runtime gagal dikunci.")

    async def execute(self, ref, code, seconds):
        if len(code.encode()) > 20000 or not 1 <= seconds <= 60:
            raise RuntimeFailure("Kode atau deadline melebihi policy runtime.")
        sandbox = await e2b.attach(await e2b.info(ref.id))
        await sandbox.files.write(CONTROL + "/job.py", code, user="root", request_timeout=15)
        await sandbox.files.write(
            CONTROL + "/runner.py",
            Path(__file__).with_name("runner.py").read_bytes(),
            user="root",
            request_timeout=15,
        )
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
            async with asyncio.timeout(seconds + 20):
                result = await e2b.run(
                    sandbox,
                    "bash -c " + shlex.quote(command),
                    seconds=seconds + 10,
                    user="root",
                    cwd=WORK,
                )
        except Exception as error:
            raise RuntimeFailure(
                "Eksekusi E2B belum terkonfirmasi; tidak diulang otomatis.", unknown=True
            ) from error
        return ExecutionReceipt(
            result.exit_code,
            (result.stdout + result.stderr)[:16000],
            round((time.monotonic() - started) * 1000),
        )

    async def collect(self, ref, filenames):
        names = [filename(n) for n in filenames]
        if len(names) > 10:
            raise RuntimeFailure("Maksimal sepuluh berkas hasil.")
        sandbox = await e2b.attach(await e2b.info(ref.id))
        inspection = (
            "import json,os,stat; names=" + repr(names) + "; rows=[]\n"
            "for name in names:\n"
            f" p={WORK!r}+'/outputs/'+name; s=os.lstat(p)\n"
            " assert stat.S_ISREG(s.st_mode) and s.st_nlink==1\n"
            " os.chmod(p,0o444)\n"
            " rows.append({'name':name,'size':s.st_size})\n"
            f"os.chmod({WORK!r}+'/outputs',0o755)\nprint(json.dumps(rows))"
        )
        result = await e2b.run(sandbox, "python3 -c " + shlex.quote(inspection), user="root")
        if result.exit_code:
            raise RuntimeFailure("Hasil belum lengkap atau bukan berkas biasa yang aman.")
        output, total, rules = [], 0, policy()
        for row in json.loads(result.stdout):
            total += row["size"]
            if not 0 < row["size"] <= rules["max_file_bytes"] or total > rules["max_output_bytes"]:
                raise RuntimeFailure("Ukuran hasil komputasi melebihi batas.")
            data = await sandbox.files.read(
                f"{WORK}/outputs/{row['name']}", format="bytes", user="root", request_timeout=20
            )
            if len(data) != row["size"]:
                raise RuntimeFailure("Berkas hasil berubah saat diambil.")
            output.append(StagedFile(row["name"], bytes(data)))
        return output

    async def delete(self, name):
        value = await e2b.find(name)
        if value:
            await AsyncSandbox.kill(value.sandbox_id, **e2b.options())
        return (await self.inspect(name)).state == "absent"
