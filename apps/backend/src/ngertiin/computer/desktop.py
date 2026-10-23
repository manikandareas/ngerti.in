"""Trusted sandbox launcher/collector, never generated or modified by the model."""

import json
import os
import shutil
import signal
import socket
import stat
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, build_opener

ROOT = Path("/tmp/ng036")
PROFILE = Path.home() / ".ngertiin-browser"
DOWNLOADS = ROOT / "downloads"


def profile_size():
    total = 0
    for root, _, files in os.walk(PROFILE, followlinks=False):
        for name in files:
            total += (Path(root) / name).lstat().st_size
            if total > 1024 * 1024 * 1024:
                raise ValueError("Profil melebihi 1 GiB; reset browser untuk melanjutkan.")
    return total


def terminate(group):
    command = Path(f"/proc/{group}/cmdline")
    if not command.exists():
        return
    identity = command.read_bytes()
    if not any(value in identity for value in (b"chromium", b"chrome", b"/tmp/ng036/egress.py")):
        return
    try:
        os.killpg(group, signal.SIGTERM)
        time.sleep(1)
        os.killpg(group, signal.SIGKILL)
    except ProcessLookupError:
        pass


def stop():
    state = ROOT / "processes.json"
    if state.exists():
        # Ask Chromium to flush its profile before process/provider shutdown.
        # The sole CDP operation is Browser.close; cookies are never queried.
        try:
            import base64

            opener = build_opener(ProxyHandler({}))
            with opener.open("http://127.0.0.1:9222/json/version", timeout=2) as reply:
                target = urlsplit(json.load(reply)["webSocketDebuggerUrl"])
            with socket.create_connection(("127.0.0.1", 9222), timeout=2) as connection:
                key = base64.b64encode(os.urandom(16)).decode()
                request = (
                    f"GET {target.path} HTTP/1.1\r\nHost: localhost:9222\r\n"
                    f"Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
                    "Sec-WebSocket-Version: 13\r\n\r\n"
                )
                connection.sendall(request.encode())
                response = b""
                while b"\r\n\r\n" not in response and len(response) < 16384:
                    block = connection.recv(4096)
                    if not block:
                        break
                    response += block
                if b" 101 " in response.split(b"\r\n", 1)[0]:
                    payload = b'{"id":1,"method":"Browser.close"}'
                    mask = os.urandom(4)
                    connection.sendall(
                        bytes([0x81, 0x80 | len(payload)])
                        + mask
                        + bytes(v ^ mask[i % 4] for i, v in enumerate(payload))
                    )
                    connection.recv(4096)
                    time.sleep(0.5)
        except (OSError, ValueError, KeyError):
            pass
        for group in json.loads(state.read_text()).values():
            terminate(group)
        state.unlink(missing_ok=True)
    shutil.rmtree(DOWNLOADS, ignore_errors=True)


def launch(seconds):
    stop()
    (ROOT / "target.json").unlink(missing_ok=True)
    PROFILE.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(PROFILE, 0o700)
    profile_size()
    DOWNLOADS.mkdir(mode=0o700, parents=True, exist_ok=True)
    for path in DOWNLOADS.iterdir():
        if path.is_file() or path.is_symlink():
            path.unlink()
    for name in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
        (PROFILE / name).unlink(missing_ok=True)
    preferences = PROFILE / "Default" / "Preferences"
    preferences.parent.mkdir(exist_ok=True)
    values = json.loads(preferences.read_text()) if preferences.exists() else {}
    values.update(
        {
            "download": {"default_directory": str(DOWNLOADS), "prompt_for_download": False},
            "credentials_enable_service": False,
            "session": {"restore_on_startup": 1},
            "profile": {"password_manager_enabled": False},
        }
    )
    preferences.write_text(json.dumps(values))
    proxy = subprocess.Popen(
        [sys.executable, str(ROOT / "egress.py")],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    browser = subprocess.Popen(
        [
            shutil.which("chromium") or shutil.which("google-chrome") or "chromium",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--no-first-run",
            "--disable-sync",
            "--disable-quic",
            "--disable-background-networking",
            "--restore-last-session",
            "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
            "--proxy-server=http://127.0.0.1:8899",
            "--proxy-bypass-list=<-loopback>",
            "--remote-debugging-address=127.0.0.1",
            "--remote-debugging-port=9222",
            "--user-data-dir=" + str(PROFILE),
            "--window-size=1280,720",
            "--start-maximized",
            "about:blank",
        ],
        env={"PATH": "/usr/bin:/bin", "HOME": str(Path.home()), "DISPLAY": ":0"},
        stdout=subprocess.DEVNULL,
        stderr=(ROOT / "probe-browser.log").open("ab")
        if os.environ.get("NGERTIIN_STARTUP_DIAGNOSTICS") == "1"
        else subprocess.DEVNULL,
        start_new_session=True,
    )
    (ROOT / "processes.json").write_text(json.dumps({"browser": browser.pid, "proxy": proxy.pid}))
    # Provider idle-stop is independent. This supervisor also ends the browser
    # at the absolute deadline after local API/worker death; it never deletes profile.
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        time.sleep(min(5, max(0, deadline - time.monotonic())))
        try:
            profile_size()
            if sum(p.lstat().st_size for p in DOWNLOADS.iterdir()) > 25 * 1024 * 1024:
                break
        except (OSError, ValueError):
            break
    stop()


def collect(names):
    import base64

    values = []
    total = 0
    for name in names:
        if name != Path(name).name or name in (".", ".."):
            raise ValueError("Invalid filename")
        path = DOWNLOADS / name
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise ValueError("Only regular downloads")
        total += info.st_size
        if not 0 < info.st_size <= 10 * 1024 * 1024 or total > 25 * 1024 * 1024:
            raise ValueError("Download size limit")
        with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as file:
            data = file.read(10 * 1024 * 1024 + 1)
        if len(data) != info.st_size or len(data) > 10 * 1024 * 1024:
            raise ValueError("Download changed during collection")
        values.append({"filename": name, "data": base64.b64encode(data).decode()})
    print(json.dumps(values))


if __name__ == "__main__":
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    command = sys.argv[1]
    if command == "launch":
        launch(min(1200, max(30, int(sys.argv[2]))))
    elif command == "stop":
        stop()
        print(
            json.dumps(
                {
                    "profile_bytes": profile_size(),
                    "egress_bytes": json.loads((ROOT / "egress.json").read_text()).get("bytes", 0)
                    if (ROOT / "egress.json").exists()
                    else 0,
                }
            )
        )
    elif command == "collect":
        collect(json.loads(sys.argv[2]))
    elif command == "target":
        from cdp import target_fingerprint

        print(json.dumps(target_fingerprint(json.loads(sys.argv[2]))))
