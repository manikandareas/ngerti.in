"""Opt-in real Docker/native-tool boundary proof for the selected spike seam."""

import hashlib
import json
import os
import threading
import time
from pathlib import Path
from uuid import uuid4

import pytest
from isolated_tools import (
    CSV,
    DEFAULT_IMAGE,
    IsolatedTools,
    OperationConflict,
    Scope,
    ScopeRefused,
    UnknownOutcome,
)

pytestmark = pytest.mark.skipif(
    not os.environ.get("NMA028_ISOLATION_TEST"),
    reason="Real Docker/native browser proof is opt-in",
)
REPORTS = []


def result(value):
    parsed = json.loads(value)
    assert (
        parsed.get("success") is not False
        and not parsed.get("error")
        and parsed.get("exit_code", 0) == 0
    ), parsed
    return parsed


@pytest.fixture
def isolated(tmp_path):
    owner, agent, thread = (str(uuid4()) for _ in range(3))
    client = IsolatedTools(
        tmp_path / "controller",
        owner,
        image=os.environ.get("NMA028_IMAGE", DEFAULT_IMAGE),
    )
    scope = Scope(owner, agent, thread)
    try:
        yield client, scope
    finally:
        client.cleanup()


def test_real_secret_and_cross_scope_isolation(isolated, monkeypatch):
    client, a = isolated
    b = Scope(a.owner_id, a.agent_id, str(uuid4()))
    secret = uuid4().hex
    (client.control_dir / "control-secret").write_text(secret)
    monkeypatch.setenv("NMA_CONTROL_CANARY", secret)
    monkeypatch.setenv("NMA_PROVIDER_CANARY", uuid4().hex)
    monkeypatch.setenv("OPENAI_API_KEY", "synthetic-provider-" + uuid4().hex)
    result(
        client.invoke(
            a,
            "private-file",
            "write_file",
            {"path": "/work/private.txt", "content": "PRIVATE_DM_CANARY"},
        )
    )
    code = """import json,os
from pathlib import Path
print(json.dumps({'control_file':Path(CONTROL_CANARY_PATH).exists(),'control_env':os.environ.get('NMA_CONTROL_CANARY'),'provider_env':os.environ.get('NMA_PROVIDER_CANARY'),'model_key':os.environ.get('OPENAI_API_KEY'),'docker_socket':Path('/var/run/docker.sock').exists(),'uid':os.getuid(),'private_dm_file':Path('/work/private.txt').exists()}))""".replace(
        "CONTROL_CANARY_PATH", repr(str(client.control_dir / "control-secret"))
    )
    boundary = result(
        client.invoke(
            b, "boundary", "browser_exec", {"code": code, "session": "boundary"}
        )
    )
    observed = json.loads(boundary["output"])
    assert observed == {
        "control_file": False,
        "control_env": None,
        "provider_env": None,
        "model_key": None,
        "docker_socket": False,
        "uid": 10001,
        "private_dm_file": False,
    }
    with pytest.raises(ScopeRefused):
        client.invoke(
            Scope(str(uuid4()), a.agent_id, a.thread_id),
            "foreign",
            "terminal",
            {"command": "id"},
        )
    with pytest.raises(ScopeRefused):
        client.invoke(
            a,
            "forged-native-scope",
            "browser_exec",
            {"code": "print('no')", "task_id": b.key},
        )
    with pytest.raises(ScopeRefused):
        client.file_bytes(a, "../../control-secret")
    result(
        client.invoke(
            b,
            "symlink-export-probe",
            "terminal",
            {"command": "ln -s /etc/passwd /work/export-escape"},
        )
    )
    with pytest.raises(RuntimeError):
        client.file_bytes(b, "export-escape")
    REPORTS.append(
        {
            "case": "secret_and_cross_scope",
            "passed": True,
            "observation": observed,
            "separate_workspace_keys": [a.key, b.key],
            "image": client.image,
        }
    )


@pytest.mark.parametrize("repeat", [1, 2, 3])
def test_real_native_browser_terminal_files_and_browser_download(isolated, repeat):
    client, scope = isolated
    fixture = client.ensure(scope)["fixture_url"]
    session = "native-form"
    result(
        client.invoke(
            scope,
            "navigate",
            "browser_exec",
            {
                "code": f'new_tab("{fixture}/"); wait_for_load(); js("document.querySelector(\'a\').click()"); wait_for_load(); print(page_info())',
                "session": session,
            },
        )
    )
    result(
        client.invoke(
            scope,
            "form-action",
            "browser_exec",
            {
                "code": 'fill_input("input[name=name]","Synthetic"); fill_input("input[name=note]","NMA028"); js("document.querySelector(\'button\').click()"); wait_for_load(); print(page_info())',
                "session": session,
            },
        )
    )
    observed = result(
        client.invoke(
            scope,
            "form-observation",
            "browser_exec",
            {
                "code": "print(js(\"document.querySelector('#receipt').textContent\"))",
                "session": session,
            },
        )
    )
    assert "NMA028_SAVED" in observed["output"]
    result(
        client.invoke(
            scope,
            "browser-download",
            "browser_exec",
            {
                "code": 'cdp("Browser.setDownloadBehavior",behavior="allow",downloadPath="/work/downloads",eventsEnabled=True); js("document.querySelector(\'a\').click()"); print("Download requested")',
                "session": session,
            },
        )
    )
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        try:
            content = client.file_bytes(scope, "downloads/report.csv")
            break
        except RuntimeError:
            time.sleep(0.1)
    else:
        pytest.fail("Browser-managed download did not produce a file")
    assert content == CSV
    terminal = result(
        client.invoke(
            scope,
            "terminal-verify",
            "terminal",
            {"command": "sha256sum /work/downloads/report.csv"},
        )
    )
    assert hashlib.sha256(CSV).hexdigest() in terminal["output"]
    native_file = result(
        client.invoke(
            scope, "file-read", "read_file", {"path": "/work/downloads/report.csv"}
        )
    )
    assert "synthetic,42" in json.dumps(native_file)
    observed = client.inspect(scope)
    posts = [r for r in observed["ledger"] if r["method"] == "POST"]
    assert posts == [
        {
            "method": "POST",
            "path": "/submit",
            "fields": {"name": ["Synthetic"], "note": ["NMA028"]},
        }
    ]
    REPORTS.append(
        {
            "case": "native_form_download",
            "repeat": repeat,
            "passed": True,
            "ledger": observed["ledger"],
            "files": observed["files"],
            "image": client.image,
        }
    )


def test_receipt_replay_and_supervisor_restart_do_not_repeat_effect(isolated):
    client, scope = isolated
    args = {"command": "printf x >> /work/effect-count; cat /work/effect-count"}
    first = client.invoke(scope, "one-effect", "terminal", args)
    assert client.invoke(scope, "one-effect", "terminal", args) == first
    restored = IsolatedTools(client.control_dir, scope.owner_id, image=client.image)
    assert restored.invoke(scope, "one-effect", "terminal", args) == first
    assert restored.file_bytes(scope, "effect-count") == b"x"
    with pytest.raises(OperationConflict):
        restored.invoke(scope, "one-effect", "terminal", {"command": "printf changed"})
    REPORTS.append(
        {
            "case": "receipt_replay_restart",
            "passed": True,
            "effect_count_bytes": 1,
            "receipt": restored.receipt(scope, "one-effect"),
            "image": client.image,
        }
    )


def test_pause_preserves_workspace_and_missing_volume_requires_recovery(isolated):
    client, scope = isolated
    result(
        client.invoke(
            scope,
            "persisted-file",
            "write_file",
            {"path": "/work/retained.txt", "content": "RETAINED_WORKSPACE"},
        )
    )
    first = client.ensure(scope)
    assert client.pause(scope)["paused"] is True
    assert client.ensure(scope) == first
    assert client.file_bytes(scope, "retained.txt") == b"RETAINED_WORKSPACE"
    client._docker("rm", "--force", first["container"])
    client._docker("volume", "rm", first["volume"])
    with pytest.raises(ScopeRefused, match="empty replacement refused"):
        client.ensure(scope)
    with pytest.raises(ScopeRefused):
        client.inspect(scope)
    with pytest.raises(ScopeRefused):
        client.file_bytes(scope, "retained.txt")
    with client._db() as db:
        state = db.execute(
            "SELECT state FROM scopes WHERE scope_key=?", (scope.key,)
        ).fetchone()[0]
    assert state == "recovery_required"
    assert (
        client._docker("volume", "inspect", first["volume"], check=False).returncode
        != 0
    )
    REPORTS.append(
        {
            "case": "pause_and_missing_volume",
            "passed": True,
            "retained_before_fault": True,
            "recovery_state": state,
            "empty_replacement_created": False,
            "image": client.image,
        }
    )


def test_cancel_fences_active_native_code_and_preserves_unknown_receipt(isolated):
    client, scope = isolated
    errors = []

    def execute():
        try:
            client.invoke(
                scope,
                "stop-case",
                "terminal",
                {
                    "command": "printf started > /work/started; sleep 15; printf late > /work/after-stop",
                    "timeout": 30,
                },
                timeout=45,
            )
        except (UnknownOutcome, RuntimeError) as error:
            errors.append(type(error).__name__)

    thread = threading.Thread(target=execute)
    thread.start()
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            if client.file_bytes(scope, "started") == b"started":
                break
        except (RuntimeError, ScopeRefused):
            pass
        time.sleep(0.1)
    else:
        pytest.fail("Native tool never reached the cancellation barrier")
    client.cancel(scope)
    thread.join(timeout=10)
    assert not thread.is_alive() and errors == ["UnknownOutcome"]
    with pytest.raises(UnknownOutcome):
        client.invoke(
            scope,
            "stop-case",
            "terminal",
            {
                "command": "printf started > /work/started; sleep 15; printf late > /work/after-stop",
                "timeout": 30,
            },
        )
    with pytest.raises(ScopeRefused):
        client.invoke(
            scope,
            "new-after-stop",
            "terminal",
            {"command": "printf late > /work/after-stop"},
        )
    snapshot = client.inspect(scope)
    assert "after-stop" not in {f["path"] for f in snapshot["files"]}
    assert client.receipt(scope, "stop-case")["state"] == "indeterminate"
    REPORTS.append(
        {
            "case": "cancel",
            "passed": True,
            "receipt": client.receipt(scope, "stop-case"),
            "files": snapshot["files"],
            "image": client.image,
        }
    )


def test_lost_ack_after_form_effect_is_not_replayed(isolated):
    client, scope = isolated
    fixture = client.ensure(scope)["fixture_url"]
    result(
        client.invoke(
            scope,
            "prepare-form",
            "browser_exec",
            {
                "code": f'new_tab("{fixture}/form"); wait_for_load(); print(page_info())',
                "session": "lost-ack",
            },
        )
    )
    args = {
        "code": 'fill_input("input[name=name]","Synthetic"); fill_input("input[name=note]","NMA028"); js("document.querySelector(\'button\').click()"); wait_for_load(); import time; time.sleep(15); print(page_info())',
        "session": "lost-ack",
    }
    with pytest.raises(UnknownOutcome):
        client.invoke(scope, "lost-ack", "browser_exec", args, timeout=4)
    snapshot = client.inspect(scope)
    posts = [r for r in snapshot["ledger"] if r["method"] == "POST"]
    assert len(posts) == 1, snapshot
    with pytest.raises(UnknownOutcome):
        client.invoke(scope, "lost-ack", "browser_exec", args)
    with pytest.raises(ScopeRefused):
        client.invoke(scope, "blind-retry", "browser_exec", args)
    assert (
        len([r for r in client.inspect(scope)["ledger"] if r["method"] == "POST"]) == 1
    )
    REPORTS.append(
        {
            "case": "lost_ack",
            "passed": True,
            "posts": posts,
            "receipt": client.receipt(scope, "lost-ack"),
            "image": client.image,
        }
    )


@pytest.fixture(scope="session", autouse=True)
def save_reports():
    yield
    target = os.environ.get("NMA028_ISOLATION_OUTPUT")
    if target:
        Path(target).write_text(json.dumps({"reports": REPORTS}, indent=2) + "\n")
