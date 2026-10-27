"""Fixed display setup and trusted web-viewer transport inside the Linux capsule."""

import base64
import json
import os
import subprocess
import time
from pathlib import Path


def start():
    Path(os.environ["XDG_RUNTIME_DIR"]).mkdir(mode=0o700, exist_ok=True)
    bus = subprocess.Popen(
        ["dbus-daemon", "--session", "--nofork", "--print-address=1"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    address = bus.stdout.readline().strip()
    if not address:
        raise RuntimeError("Isolated desktop session bus failed startup")
    os.environ["DBUS_SESSION_BUS_ADDRESS"] = address
    children = [
        bus,
        subprocess.Popen(
            ["Xvfb", ":99", "-screen", "0", "1280x800x24", "-nolisten", "tcp"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        ),
    ]
    for _ in range(100):
        if Path("/tmp/.X11-unix/X99").exists():
            break
        time.sleep(0.05)
    children.append(
        subprocess.Popen(
            ["openbox"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
    )
    return children


def stop_browser(browser):
    """Let Chromium commit its persistent profile before terminating its process."""
    from urllib.request import urlopen

    from websockets.exceptions import WebSocketException
    from websockets.sync.client import connect

    try:
        with urlopen("http://127.0.0.1:9222/json/version", timeout=2) as response:
            endpoint = json.load(response)["webSocketDebuggerUrl"]
        with connect(endpoint, open_timeout=2) as websocket:
            websocket.send(json.dumps({"id": 1, "method": "Browser.close"}))
        browser.wait(timeout=8)
    except (
        OSError,
        ValueError,
        KeyError,
        WebSocketException,
        subprocess.TimeoutExpired,
    ):
        browser.terminate()
        try:
            browser.wait(timeout=3)
        except subprocess.TimeoutExpired:
            browser.kill()
            browser.wait(timeout=3)


def screen(args, task_id, browser_session=None):
    action = args.get("action")
    browser = None
    if action in {"focus", "reobserve"} and browser_session is not None:
        from tools.browser_use_cli import browser_exec

        code = "from browser_harness.helpers import current_tab,activate_tab,ensure_real_tab;ensure_real_tab();activate_tab(current_tab())"
        if action == "reobserve":
            code = """from browser_harness.helpers import current_tab,list_tabs,switch_tab,js,page_info
previous = current_tab()
visible = None
for tab in list_tabs():
    switch_tab(tab)
    if js('document.visibilityState') == 'visible':
        visible = tab
        break
switch_tab(visible or previous)
print(page_info())"""
        browser = browser_exec(
            code, session=browser_session, task_id=task_id, timeout_s=20
        )
        if isinstance(browser, str):
            browser = json.loads(browser)
        if browser.get("success") is not True:
            raise ValueError("Browser observation could not be rebound")
    if action == "focus":
        return {"browser": browser}
    if action in {"frame", "reobserve"}:
        result = subprocess.run(
            ["import", "-window", "root", "png:-"],
            capture_output=True,
            check=True,
            timeout=10,
        )
        return {
            "image": "data:image/png;base64,"
            + base64.b64encode(result.stdout).decode(),
            "width": 1280,
            "height": 800,
            "observed_at": time.time(),
            "browser": browser,
        }
    if action == "diagnostics":
        from tools.computer_use.cua_backend_driver import (
            cua_driver_runtime_contract_status,
        )
        from tools.computer_use.permissions import computer_use_status

        health = computer_use_status()

        return {
            "ready": health.get("ready") is True,
            "health": health,
            "display": os.environ.get("DISPLAY"),
            "driver": cua_driver_runtime_contract_status(),
            "platform": "linux-x11",
            "keychain": "unavailable; encrypted owner-local vault supported",
        }
    if action == "input":
        kind = args.get("kind")
        if (
            kind == "click"
            and type(args.get("x")) is int
            and type(args.get("y")) is int
            and 0 <= args["x"] < 1280
            and 0 <= args["y"] < 800
        ):
            command = [
                "xdotool",
                "mousemove",
                str(args["x"]),
                str(args["y"]),
                "click",
                "1",
            ]
        elif (
            kind == "text"
            and isinstance(args.get("text"), str)
            and len(args["text"]) <= 4096
        ):
            # Send text through stdin; passwords never appear in process argv.
            subprocess.run(
                ["xdotool", "type", "--clearmodifiers", "--file", "-"],
                input=args["text"],
                text=True,
                check=True,
                timeout=10,
            )
            return {"input": "sent"}
        elif kind == "key" and args.get("key") in {
            "Tab",
            "Return",
            "Escape",
            "BackSpace",
            "Left",
            "Right",
            "Up",
            "Down",
            "ctrl+a",
            "ctrl+s",
            "ctrl+l",
        }:
            command = ["xdotool", "key", "--clearmodifiers", args["key"]]
        else:
            raise ValueError("Invalid screen input")
        subprocess.run(command, capture_output=True, check=True, timeout=10)
        return {"input": "sent"}
    raise ValueError("Invalid screen operation")


def page(args, task_id):
    """Retain native supervisor evaluation for trusted vault fills over signed RPC."""
    from tools.browser_session_cdp import ensure_cdp_supervisor
    from tools.browser_supervisor import SUPERVISOR_REGISTRY

    ensure_cdp_supervisor(task_id)
    supervisor = SUPERVISOR_REGISTRY.get(task_id)
    if supervisor is None:
        return {"success": False, "error": "Browser supervisor unavailable"}
    if args.get("action") == "focus":
        return supervisor.focus_page(args["origin"], accept=args.get("accept"))
    value = supervisor.evaluate_runtime(args["expression"])
    return (
        {"success": bool(value.get("ok")), "result": value.get("result")}
        if value.get("ok")
        else {"success": False, "error": "Page evaluation failed"}
    )
