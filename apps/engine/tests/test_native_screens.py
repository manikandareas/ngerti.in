"""Real isolated desktop/browser behavior and durable exclusive input contracts."""

import json
import os
import shlex
import threading
import time
from uuid import uuid4

import pytest
from ngertiin_engine.contracts import digest
from ngertiin_engine.native_executor import (
    IsolatedTools,
    Scope,
    ScopeRefused,
    UnknownOutcome,
)

pytestmark = pytest.mark.skipif(
    not os.environ.get("NMA_TEST_DESKTOP_IMAGE"),
    reason="Requires the reviewed X11/Cua image",
)


@pytest.fixture
def desktop(tmp_path):
    import model_tools  # noqa: F401
    from tools.registry import registry

    scope = Scope(*(str(uuid4()) for _ in range(3)))
    broker = IsolatedTools(
        tmp_path, scope.owner_id, image=os.environ["NMA_TEST_DESKTOP_IMAGE"]
    )

    def invoke(name, arguments, operation=None):
        value = broker.invoke(
            scope,
            operation or str(uuid4()),
            name,
            arguments,
            schema_hash=digest(registry.get_entry(name).schema),
            allowed_tools={
                "browser_exec",
                "browser_cdp",
                "browser_dialog",
                "computer_use",
                "terminal",
            },
        )
        return json.loads(value) if isinstance(value, str) else value

    try:
        yield broker, scope, invoke
    finally:
        broker.cleanup()


def test_real_nonbrowser_desktop_and_native_accessibility(desktop):
    broker, scope, invoke = desktop
    launched = invoke(
        "terminal", {"command": "mousepad /work/native-desktop.txt", "background": True}
    )
    assert launched["exit_code"] == 0, launched
    invoke("computer_use", {"action": "wait", "seconds": 2})
    observed = invoke(
        "computer_use", {"action": "capture", "app": "Mousepad", "mode": "ax"}
    )
    assert observed["width"] > 0 and observed["elements"], observed
    typed = invoke(
        "computer_use", {"action": "type", "text": "VERIFIED_NATIVE_DESKTOP"}
    )
    assert typed.get("ok") is True, typed
    saved = invoke(
        "computer_use",
        {"action": "key", "keys": "ctrl+s", "delivery_mode": "foreground"},
    )
    assert saved.get("ok") is True, saved
    assert broker.file_bytes(scope, "native-desktop.txt") == b"VERIFIED_NATIVE_DESKTOP"
    captured = invoke(
        "computer_use", {"action": "capture", "app": "Mousepad", "mode": "vision"}
    )
    assert captured.get("_multimodal"), captured


def test_takeover_fences_batches_disconnect_and_restart(desktop):
    broker, scope, invoke = desktop
    first, second = broker.screen.issue(scope), broker.screen.issue(scope)
    broker.screen.takeover(scope, first["grant"], lambda: None)
    with pytest.raises(ScopeRefused):
        broker.screen.takeover(scope, second["grant"], lambda: None)
    denied = invoke("terminal", {"command": "touch /work/must-not-exist"})
    assert denied["outcome"] == "rejected" and denied["error"] == "HUMAN_CONTROL_ACTIVE"
    frame = json.loads(
        broker.screen.invoke(
            scope, first["grant"], "frame", {}, str(uuid4()), lambda: None
        )
    )
    assert frame["image"].startswith("data:image/png;base64,")
    with broker._db() as db:
        assert not any(
            "data:image" in (r[0] or "")
            for r in db.execute("SELECT result FROM operations")
        )
    broker.screen.revoke(scope, first["grant"])
    restarted = IsolatedTools(broker.control_dir, scope.owner_id, image=broker.image)
    assert restarted.screen.state(scope)[0] == "disconnected"
    assert (
        invoke("terminal", {"command": "touch /work/still-denied"})["outcome"]
        == "rejected"
    )
    with pytest.raises(ScopeRefused):
        restarted.screen.invoke(
            scope,
            first["grant"],
            "input",
            {"kind": "key", "key": "Return"},
            str(uuid4()),
            lambda: None,
        )
    resumed = restarted.screen.release(scope, second["grant"], lambda: None)
    assert resumed["control"] == "agent" and resumed["observation"]["image"]
    assert (
        invoke(
            "terminal",
            {"command": "test ! -f /work/must-not-exist; test ! -f /work/still-denied"},
        )["exit_code"]
        == 0
    )
    with broker._db() as db:
        db.execute("UPDATE screen_grants SET expires=0")
    with pytest.raises(ScopeRefused):
        restarted.screen.invoke(
            scope, second["grant"], "frame", {}, str(uuid4()), lambda: None
        )


def test_pending_transfer_waits_for_exactly_one_active_batch(desktop):
    broker, scope, invoke = desktop
    grant = broker.screen.issue(scope)["grant"]
    entered = threading.Event()
    finished = threading.Event()

    def batch():
        entered.set()
        result = invoke(
            "terminal",
            {
                "command": "printf BEFORE > /work/active.txt; sleep 2; printf AFTER >> /work/active.txt"
            },
        )
        assert result["exit_code"] == 0
        finished.set()

    worker = threading.Thread(target=batch)
    worker.start()
    entered.wait(5)
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        with broker._db() as db:
            if db.execute(
                "SELECT 1 FROM operations WHERE state='dispatching'"
            ).fetchone():
                break
        time.sleep(0.05)
    broker.screen.takeover(scope, grant, lambda: None)
    worker.join(10)
    assert (
        finished.is_set() and broker.file_bytes(scope, "active.txt") == b"BEFOREAFTER"
    )
    assert broker.screen.state(scope)[0] == "human"


FIXTURE = """from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*a): pass
 def do_GET(self):
  content=b'<title>Native fixture</title><form method="post" action="/submit"><input id="name" name="name"><input id="password" type="password" name="password"><button>Submit</button></form><iframe src="/frame"></iframe>' if self.path!='/frame' else b'<p id="frame">FRAME_READY</p>'
  self.send_response(200); self.send_header('Content-Length',str(len(content))); self.end_headers(); self.wfile.write(content)
 def do_POST(self):
  data=self.rfile.read(int(self.headers['Content-Length'])); p=Path('/work/post-count'); p.write_text(str(int(p.read_text())+1) if p.exists() else '1'); Path('/work/submitted').write_bytes(data)
  data=b'<title>Submitted</title>FORM_VERIFIED'; self.send_response(200); self.send_header('Content-Length',str(len(data))); self.send_header('Set-Cookie','fixture=persisted; Max-Age=86400; Path=/'); self.end_headers(); self.wfile.write(data)
HTTPServer(('127.0.0.1',8765),Handler).serve_forever()
"""


def test_native_browser_form_iframe_tabs_download_and_receipt(desktop):
    broker, scope, invoke = desktop
    script = "python -c " + shlex.quote(FIXTURE)
    assert invoke("terminal", {"command": script, "background": True})["exit_code"] == 0
    # The disposable fixture listens only inside this capsule. Keep production
    # private-URL refusal unchanged; explicitly opt this fixture into loopback.
    configure = "import json;from pathlib import Path;p=Path('/work/state/config.yaml');c=json.loads(p.read_text());c['browser']['allow_private_urls']=True;p.write_text(json.dumps(c))"
    assert (
        invoke("terminal", {"command": "python -c " + shlex.quote(configure)})[
            "exit_code"
        ]
        == 0
    )
    code = 'import time; new_tab("http://127.0.0.1:8765/"); wait_for_load(); print(page_info()); print(js("document.querySelector(\'iframe\').contentDocument.querySelector(\'#frame\').textContent")); fill_input("#name", "NativeFixture"); js("document.querySelector(\'form\').submit()"); time.sleep(0.5); wait_for_load(); print(js("document.body.innerText"))'
    result = invoke("browser_exec", {"code": code}, "one-post")
    assert result.get("success"), result
    assert "FORM_VERIFIED" in json.dumps(result) and "FRAME_READY" in json.dumps(
        result
    ), result
    assert broker.file_bytes(scope, "post-count") == b"1"
    assert broker.file_bytes(scope, "submitted") == b"name=NativeFixture&password="
    assert invoke("browser_exec", {"code": code}, "one-post") == result
    assert broker.file_bytes(scope, "post-count") == b"1"
    tabs = invoke("browser_cdp", {"method": "Target.getTargets"})
    assert not tabs.get("error"), tabs
    download = invoke(
        "browser_exec",
        {
            "code": 'new_tab("about:blank"); cdp("Browser.setDownloadBehavior", behavior="allow", downloadPath="/work/downloads"); js("document.body.innerHTML=\'<a download=proof.txt href=data:text/plain,VERIFIED_DOWNLOAD>Download</a>\'; document.querySelector(\'a\').click()"); capture_screenshot()'
        },
    )
    assert download.get("_multimodal") or download.get("success"), download
    assert broker.file_bytes(scope, "downloads/proof.txt") == b"VERIFIED_DOWNLOAD"
    opened = invoke(
        "browser_exec",
        {
            "code": "from browser_harness.helpers import current_tab,activate_tab;new_tab('http://127.0.0.1:8765/');activate_tab(current_tab());js(\"setTimeout(() => { window.dialogAccepted = confirm('NMA032 dialog') }, 500)\"); print('Dialog scheduled')"
        },
    )
    assert opened.get("success"), opened
    time.sleep(0.8)
    handled = invoke("browser_dialog", {"action": "accept"})
    assert not handled.get("error"), handled
    confirmed = invoke("browser_exec", {"code": "print(js('window.dialogAccepted'))"})
    assert "True" in confirmed.get("output", "") or "true" in confirmed.get(
        "output", ""
    ), confirmed
    present = invoke("browser_exec", {"code": "print(cdp('Storage.getCookies'))"})
    assert "persisted" in present.get("output", ""), present
    broker.pause(scope)
    restored = broker.ensure(scope)
    cookies = broker._docker(
        "exec",
        restored["container"],
        "/opt/native/bin/python",
        "-c",
        "import json;from urllib.request import urlopen;from websockets.sync.client import connect;url=json.load(urlopen('http://127.0.0.1:9222/json/version'))['webSocketDebuggerUrl'];ws=connect(url);ws.send(json.dumps({'id':1,'method':'Storage.getCookies'}));print(ws.recv());ws.close()",
    )
    assert "persisted" in cookies, cookies
    assert broker.file_bytes(scope, "downloads/proof.txt") == b"VERIFIED_DOWNLOAD"


def test_partial_native_batch_is_unknown_and_never_replayed(desktop):
    import model_tools  # noqa: F401
    from tools.registry import registry

    broker, scope, invoke = desktop
    assert invoke(
        "browser_exec", {"code": "print('Browser ready for fault injection')"}
    ).get("success")
    code = "from pathlib import Path;import time;Path('/work/partial.txt').write_text('BEFORE');time.sleep(30);Path('/work/partial.txt').write_text('AFTER')"
    with pytest.raises(UnknownOutcome):
        broker.invoke(
            scope,
            "partial-batch",
            "browser_exec",
            {"code": code},
            schema_hash=digest(registry.get_entry("browser_exec").schema),
            allowed_tools={"browser_exec"},
            timeout=5,
        )
    assert broker.receipt(scope, "partial-batch")["state"] == "indeterminate"
    with pytest.raises(UnknownOutcome):
        broker.invoke(
            scope,
            "partial-batch",
            "browser_exec",
            {"code": code},
            schema_hash=digest(registry.get_entry("browser_exec").schema),
            allowed_tools={"browser_exec"},
        )
    assert broker.file_bytes(scope, "partial.txt") == b"BEFORE"
    resumed = IsolatedTools(broker.control_dir, scope.owner_id, image=broker.image)
    assert resumed.receipt(scope, "partial-batch")["state"] == "indeterminate"


def test_failed_batch_with_screenshot_remains_unknown(desktop):
    broker, scope, invoke = desktop
    code = "from pathlib import Path;p=Path('/work/image-dispatch-count');p.write_text(str(int(p.read_text())+1) if p.exists() else '1');print(capture_screenshot());raise NameError('NMA032_IMAGE_FAILURE')"
    result = invoke("browser_exec", {"code": code}, "failed-image-batch")
    assert result.get("_multimodal"), result
    assert broker.receipt(scope, "failed-image-batch")["state"] == "indeterminate"
    assert broker.file_bytes(scope, "image-dispatch-count") == b"1"
    assert invoke("browser_exec", {"code": code}, "failed-image-batch") == result
    assert broker.file_bytes(scope, "image-dispatch-count") == b"1"


def test_public_egress_refuses_private_targets_and_interrupted_network(desktop):
    from tools.registry import registry

    broker, scope, invoke = desktop
    checked = invoke(
        "browser_exec",
        {"code": "new_tab('https://example.com/');wait_for_load();print(page_info())"},
    )
    assert checked.get("success") and "Example Domain" in checked.get("output", ""), (
        checked
    )
    refusal = invoke(
        "terminal",
        {
            "command": "python -c \"import http.client;c=http.client.HTTPConnection('egress',8080,timeout=5);c.request('GET','http://169.254.169.254/');print(c.getresponse().status)\""
        },
    )
    assert refusal["exit_code"] == 0 and "403" in refusal["output"], refusal
    network = "nma-egress-" + broker.controller[:8] + "-" + scope.key[:16]
    broker._docker("network", "disconnect", network, network + "-proxy")
    operation = "network-interruption"
    try:
        broker.invoke(
            scope,
            operation,
            "browser_exec",
            {
                "code": "new_tab('https://example.com/?native-network-loss=1');wait_for_load();print(page_info())"
            },
            schema_hash=digest(registry.get_entry("browser_exec").schema),
            allowed_tools={"browser_exec"},
            timeout=5,
        )
    except UnknownOutcome:
        pass
    assert broker.receipt(scope, operation)["state"] == "indeterminate"
    with pytest.raises((ScopeRefused, UnknownOutcome)):
        broker.invoke(
            scope,
            operation,
            "browser_exec",
            {
                "code": "new_tab('https://example.com/?native-network-loss=1');wait_for_load();print(page_info())"
            },
            schema_hash=digest(registry.get_entry("browser_exec").schema),
            allowed_tools={"browser_exec"},
        )


def test_closed_browser_tab_recovers_or_retains_unknown_receipt(desktop):
    broker, scope, invoke = desktop
    assert invoke(
        "browser_exec",
        {
            "code": "new_tab('about:blank');js(\"document.title='STALE_TAB_PROBE'\");print(page_info())"
        },
    ).get("success")
    container = broker.ensure(scope)["container"]
    close = "import json;from urllib.request import urlopen;from websockets.sync.client import connect;t=next(t for t in json.load(urlopen('http://127.0.0.1:9222/json/list')) if t.get('title')=='STALE_TAB_PROBE');ws=connect(t['webSocketDebuggerUrl']);ws.send(json.dumps({'id':1,'method':'Page.close'}));ws.close()"
    broker._docker("exec", container, "/opt/native/bin/python", "-c", close)
    try:
        observed = invoke(
            "browser_exec",
            {"code": "print(page_info())", "timeout_s": 5},
            "closed-tab-observation",
        )
    except UnknownOutcome:
        observed = {"success": False}
    receipt = broker.receipt(scope, "closed-tab-observation")
    if observed.get("success"):
        assert "STALE_TAB_PROBE" not in observed.get("output", ""), observed
        assert receipt["state"] == "returned"
    else:
        assert receipt["state"] == "indeterminate"


def test_simultaneous_owner_displays_and_wrong_scope_grants(desktop, tmp_path):
    broker, scope, invoke = desktop
    other_scope = Scope(*(str(uuid4()) for _ in range(3)))
    other = IsolatedTools(
        tmp_path / "other-owner", other_scope.owner_id, image=broker.image
    )
    try:
        from tools.registry import registry

        def other_invoke(name, arguments):
            return json.loads(
                other.invoke(
                    other_scope,
                    str(uuid4()),
                    name,
                    arguments,
                    schema_hash=digest(registry.get_entry(name).schema),
                    allowed_tools={"terminal", "computer_use"},
                )
            )

        for dispatch, marker in [
            (invoke, "FIRST_DISPLAY"),
            (other_invoke, "SECOND_DISPLAY"),
        ]:
            dispatch(
                "terminal",
                {"command": "mousepad /work/display.txt", "background": True},
            )
            dispatch("computer_use", {"action": "wait", "seconds": 2})
            assert (
                dispatch(
                    "computer_use",
                    {"action": "capture", "app": "Mousepad", "mode": "ax"},
                )["width"]
                > 0
            )
            assert dispatch("computer_use", {"action": "type", "text": marker}).get(
                "ok"
            )
            assert dispatch(
                "computer_use",
                {"action": "key", "keys": "ctrl+s", "delivery_mode": "foreground"},
            ).get("ok")
        assert broker.file_bytes(scope, "display.txt") == b"FIRST_DISPLAY"
        assert other.file_bytes(other_scope, "display.txt") == b"SECOND_DISPLAY"
        first = broker.screen.issue(scope)
        second = other.screen.issue(other_scope)
        assert (
            broker.ensure(scope)["container"] != other.ensure(other_scope)["container"]
        )
        with pytest.raises(ScopeRefused):
            broker.screen.invoke(
                other_scope, first["grant"], "frame", {}, str(uuid4()), lambda: None
            )
        same_owner_other_thread = Scope(scope.owner_id, scope.agent_id, str(uuid4()))
        with pytest.raises(ScopeRefused):
            broker.screen.invoke(
                same_owner_other_thread,
                first["grant"],
                "frame",
                {},
                str(uuid4()),
                lambda: None,
            )
        with pytest.raises(ScopeRefused):
            other.screen.invoke(
                other_scope, first["grant"], "frame", {}, str(uuid4()), lambda: None
            )
        other.screen.takeover(other_scope, second["grant"], lambda: None)
        assert (
            invoke("terminal", {"command": "printf FIRST_OWNER > /work/identity.txt"})[
                "exit_code"
            ]
            == 0
        )
        assert other.screen.state(other_scope)[0] == "human"
        assert broker.file_bytes(scope, "identity.txt") == b"FIRST_OWNER"
    finally:
        other.cleanup()


def test_stale_window_does_not_redirect_input(desktop):
    broker, scope, invoke = desktop
    assert (
        invoke(
            "terminal",
            {"command": "mousepad /work/stale-window.txt", "background": True},
        )["exit_code"]
        == 0
    )
    invoke("computer_use", {"action": "wait", "seconds": 2})
    assert (
        invoke("computer_use", {"action": "capture", "app": "Mousepad", "mode": "ax"})[
            "width"
        ]
        > 0
    )
    target = broker.ensure(scope)["container"]
    broker._docker("exec", target, "pkill", "-9", "-x", "mousepad")
    result = invoke("computer_use", {"action": "type", "text": "MUST_NOT_REDIRECT"})
    assert result.get("ok") is False or result.get("error"), result
    operations = broker._db()
    with operations as db:
        assert (
            db.execute(
                "SELECT COUNT(*) FROM operations WHERE state='indeterminate'"
            ).fetchone()[0]
            >= 1
        )


def test_driver_restart_and_display_loss_require_fresh_observation(desktop):
    broker, scope, invoke = desktop
    invoke("terminal", {"command": "mousepad /work/recovery.txt", "background": True})
    invoke("computer_use", {"action": "wait", "seconds": 2})
    assert (
        invoke("computer_use", {"action": "capture", "app": "Mousepad", "mode": "ax"})[
            "width"
        ]
        > 0
    )
    container = broker.ensure(scope)["container"]
    broker._docker("exec", container, "pkill", "-9", "-f", "^/opt/cua/.*")
    # Native transport may reconnect only for this new observation. No earlier
    # input operation is submitted again after the driver process is lost.
    recovered = invoke(
        "computer_use", {"action": "capture", "app": "Mousepad", "mode": "ax"}
    )
    assert recovered.get("width", 0) > 0 or recovered.get("error"), recovered
    if recovered.get("error"):
        with pytest.raises(ScopeRefused):
            broker.ensure(scope)
        with broker._db() as db:
            assert (
                db.execute(
                    "SELECT COUNT(*) FROM operations WHERE state='indeterminate'"
                ).fetchone()[0]
                >= 1
            )
    broker.cancel(scope)
    restarted = Scope(
        scope.owner_id, scope.agent_id, scope.thread_id, scope.generation + 1
    )
    grant = broker.screen.issue(restarted)["grant"]
    fresh = json.loads(
        broker.screen.invoke(restarted, grant, "frame", {}, str(uuid4()), lambda: None)
    )
    assert fresh["image"].startswith("data:image/png;base64,")
    container = broker.ensure(restarted)["container"]
    broker._docker("exec", container, "pkill", "-9", "-x", "Xvfb")
    with pytest.raises(RuntimeError, match="failed readiness"):
        broker.screen.invoke(restarted, grant, "frame", {}, str(uuid4()), lambda: None)
    broker.screen.revoke(restarted, grant)
    broker.pause(restarted)
    token = broker.screen.issue(restarted)["grant"]
    fresh = json.loads(
        broker.screen.invoke(restarted, token, "frame", {}, str(uuid4()), lambda: None)
    )
    assert fresh["image"].startswith("data:image/png;base64,")
    with pytest.raises(ScopeRefused):
        broker.screen.invoke(restarted, grant, "frame", {}, str(uuid4()), lambda: None)


def test_navigation_wait_observes_submitted_document_without_replaying(desktop):
    broker, scope, invoke = desktop
    delayed = FIXTURE.replace(
        "from pathlib import Path", "from pathlib import Path\nimport time"
    ).replace(
        "data=b'<title>Submitted</title>FORM_VERIFIED'",
        "time.sleep(1); data=b'<title>Submitted</title>FORM_VERIFIED'",
    )
    assert (
        invoke(
            "terminal",
            {"command": "python -c " + shlex.quote(delayed), "background": True},
        )["exit_code"]
        == 0
    )
    configure = "import json;from pathlib import Path;p=Path('/work/state/config.yaml');c=json.loads(p.read_text());c['browser']['allow_private_urls']=True;p.write_text(json.dumps(c))"
    assert (
        invoke("terminal", {"command": "python -c " + shlex.quote(configure)})[
            "exit_code"
        ]
        == 0
    )
    for sequence in range(1, 4):
        code = """
new_tab('http://127.0.0.1:8765/')
wait_for_load()
fill_input('#name', 'Navigation')
js("document.querySelector('form').submit()")
assert wait_for_load(timeout=5)
print(page_info())
print(js('document.body.innerText'))
"""
        result = invoke("browser_exec", {"code": code}, f"navigation-{sequence}")
        assert result.get("success") and "FORM_VERIFIED" in result.get("output", ""), (
            json.dumps(result)
        )
        assert broker.file_bytes(scope, "post-count") == str(sequence).encode()
        assert (
            invoke("browser_exec", {"code": code}, f"navigation-{sequence}") == result
        )
        assert broker.file_bytes(scope, "post-count") == str(sequence).encode()


def test_companion_cdp_download_setting_survives_return(desktop):
    broker, scope, invoke = desktop
    opened = invoke(
        "browser_exec",
        {
            "code": "new_tab('about:blank');js(\"document.body.innerHTML='<a download=companion.txt href=data:text/plain,VERIFIED_COMPANION_DOWNLOAD>Download</a>'\")"
        },
    )
    assert opened.get("success"), opened
    configured = invoke(
        "browser_cdp",
        {
            "method": "Browser.setDownloadBehavior",
            "params": {"behavior": "allow", "downloadPath": "/work/downloads"},
        },
        "download-setting",
    )
    assert configured.get("success"), configured
    clicked = invoke(
        "browser_exec", {"code": "js(\"document.querySelector('a').click()\")"}
    )
    assert clicked.get("success"), clicked
    observed = invoke(
        "terminal",
        {
            "command": "python -c \"import time;from pathlib import Path;p=Path('/work/downloads/companion.txt');deadline=time.monotonic()+3\nwhile not p.exists() and time.monotonic()<deadline:time.sleep(.05)\nprint(p.exists())\""
        },
    )
    assert observed.get("output", "").strip() == "True", observed
    assert (
        broker.file_bytes(scope, "downloads/companion.txt")
        == b"VERIFIED_COMPANION_DOWNLOAD"
    )
