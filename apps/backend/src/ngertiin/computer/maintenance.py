"""One-off, owner-scoped retained-runtime maintenance with normal compute admission.

Only an upgrade-blocked Task may acquire a free workspace. No running worker or
human channel is reused. Failure retains the profile and blocks normal admission
until provider stop is confirmed. Installation is never part of each Task start.
"""

import math
import shlex
from contextlib import suppress
from datetime import UTC, datetime

from fastapi import HTTPException

from ngertiin import e2b
from ngertiin.chat.store import json_value, one
from ngertiin.computer import lifecycle, store, usage
from ngertiin.computer.e2b import E2BComputer, resource
from ngertiin.tasks import store as tasks

INSTALL = r"""set -eu
python3 -m pip install --no-cache-dir uv==0.10.7
export UV_PYTHON_INSTALL_DIR=/opt/ngertiin-python
uv python install 3.12.12
JEV_RUNTIME=$(mktemp -d /opt/ngertiin-jev-v2.XXXXXXXX)
uv venv --python 3.12.12 "$JEV_RUNTIME"
chmod 755 "$JEV_RUNTIME"
python3 - <<'PY'
import hashlib,json,urllib.request
with urllib.request.urlopen('https://pypi.org/pypi/browser-harness/0.1.13/json',timeout=20) as r:
    release=json.load(r)
wheel=next(f for f in release['urls'] if f['filename'].endswith('py3-none-any.whl'))
with urllib.request.urlopen(wheel['url'],timeout=20) as r:
    data=r.read()
expected='2491459e4bfc0ee8aea22dc6c4680fc0f791b7ba553446323c50d2883449d769'
assert hashlib.sha256(data).hexdigest() == expected
open('/tmp/browser_harness-0.1.13-py3-none-any.whl','wb').write(data)
PY
uv pip install --python "$JEV_RUNTIME/bin/python" /tmp/browser_harness-0.1.13-py3-none-any.whl
"$JEV_RUNTIME/bin/python" -c 'import browser_harness.helpers'
if test -L /opt/ngertiin-jev; then
  readlink -f /opt/ngertiin-jev > /opt/ngertiin-jev.rollback
fi
if test -d /opt/ngertiin-jev && ! test -L /opt/ngertiin-jev; then
  mv /opt/ngertiin-jev /opt/ngertiin-jev-before-v2
  echo /opt/ngertiin-jev-before-v2 > /opt/ngertiin-jev.rollback
fi
ln -sfn "$JEV_RUNTIME" /opt/ngertiin-jev.next
mv -Tf /opt/ngertiin-jev.next /opt/ngertiin-jev
sync
"""


async def upgrade(owner, task_id):
    async with tasks.locked(owner, task_id) as (conn, task):
        if task["status"] != "waiting_user" or task["stage"] != "computer_upgrade_required":
            raise HTTPException(409, "Task tidak menunggu pembaruan runtime.")
        await conn.execute("SELECT pg_advisory_xact_lock(330035)")
        workspace = await one(
            conn,
            "SELECT * FROM browser_workspaces WHERE owner_id=%s AND provider='e2b' "
            "AND state<>'deleted' FOR UPDATE",
            (owner,),
        )
        if (
            not workspace
            or workspace["state"] != "stopped"
            or workspace["active_task_id"]
            or workspace["unknown_effect"]
        ):
            raise HTTPException(
                409, "Maintenance memerlukan workspace yang sudah berhenti dan bebas."
            )
        rules = {**task["budget_policy"]["computer"], "seconds": 180}
        rules["compute_reservation"] = math.ceil(360 * rules["microusd_per_hour"] / 3600)
        session = await usage.reserve(conn, task, workspace, rules)
        workspace = await one(
            conn,
            "UPDATE browser_workspaces SET "
            "state='starting',active_task_id=%s,control='handoff',"
            "control_version=control_version+1,deadline=%s WHERE id=%s RETURNING *",
            (task_id, session["deadline"], workspace["id"]),
        )
        await conn.execute(
            "UPDATE computer_viewers SET closed=true WHERE workspace_id=%s", (workspace["id"],)
        )
    runtime = E2BComputer()
    upgraded = False
    sandbox = None
    try:
        value = await resource(workspace)
        sandbox = await e2b.attach(value, seconds=180, resume=True)
        result = await e2b.run(sandbox, "id -u && test -d /opt && df -Pk /opt", user="root")
        if result.exit_code:
            raise ValueError("Maintenance privilege/disk preflight gagal.")
        result = await e2b.run(sandbox, "bash -c " + shlex.quote(INSTALL), seconds=140, user="root")
        if result.exit_code:
            raise ValueError("Instalasi runtime terpin belum berhasil; profil dipertahankan.")
        # Restart only trusted desktop processes; the profile stays on the same disk.
        seconds = int((workspace["deadline"] - datetime.now(UTC)).total_seconds())
        if seconds < 30:
            raise ValueError("Budget waktu maintenance habis sebelum validasi.")
        await runtime.start(workspace, seconds)
        manifest = workspace.get("capability", {})
        if not manifest.get("dom"):
            raise ValueError("Capability runtime baru belum lolos probe.")
        await runtime.stop(workspace)
        seconds = int((workspace["deadline"] - datetime.now(UTC)).total_seconds())
        if seconds < 30:
            raise ValueError("Cold resume belum diuji dalam deadline maintenance.")
        await runtime.start(workspace, seconds)
        if not workspace.get("capability", {}).get("dom"):
            raise ValueError("Capability hilang sesudah cold resume.")
        async with tasks.locked(owner, task_id) as (conn, task):
            current = await store.owned(conn, owner, workspace["id"], lock=True)
            if current["control_version"] != workspace["control_version"]:
                raise ValueError("Lease maintenance berubah.")
            await conn.execute(
                "UPDATE browser_workspaces SET capability=%s WHERE id=%s",
                (json_value(workspace["capability"]), workspace["id"]),
            )
        upgraded = True
    finally:
        if not upgraded and sandbox is not None:
            # The rollback file contains only a trusted local interpreter path.
            with suppress(Exception):
                await e2b.run(
                    sandbox,
                    "if test -f /opt/ngertiin-jev.rollback; then "
                    'ln -sfn "$(cat /opt/ngertiin-jev.rollback)" /opt/ngertiin-jev.next; '
                    "mv -Tf /opt/ngertiin-jev.next /opt/ngertiin-jev; sync; fi",
                    user="root",
                )
        stopped = await lifecycle.stop_task(owner, task_id, runtime)
    if upgraded and stopped:
        async with tasks.locked(owner, task_id) as (conn, task):
            if task["status"] == "waiting_user" and task["stage"] == "computer_upgrade_required":
                await tasks.change(
                    conn, task, status="queued", stage="computer_continuing", error=None
                )
                await tasks.enqueue(conn, task)
                await tasks.emit(conn, task)
    return {"upgraded": upgraded, "stopped": stopped}
