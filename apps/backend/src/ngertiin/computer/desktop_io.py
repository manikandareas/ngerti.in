"""Fixed sandbox-side GUI operations; no generated shell or exported browser state."""

import json
import os
import socket
import subprocess
import sys
import time
from urllib.request import ProxyHandler, build_opener

os.environ["DISPLAY"] = ":0"


def run(args):
    return subprocess.run(args, check=True, capture_output=True, timeout=10)


def background(args, *, cwd=None):
    subprocess.Popen(
        args,
        cwd=cwd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL,
        start_new_session=True,
    )


def port(number):
    try:
        with socket.create_connection(("127.0.0.1", number), timeout=0.5):
            return True
    except OSError:
        return False


def display_ready():
    try:
        return subprocess.run(["xdpyinfo"], capture_output=True, timeout=1).returncode == 0
    except subprocess.TimeoutExpired:
        return False


def setup():
    if not display_ready():
        background(
            ["Xvfb", ":0", "-ac", "-screen", "0", "1280x720x24", "-dpi", "96", "-nolisten", "tcp"]
        )
    ready_until = time.monotonic() + 18
    while time.monotonic() < ready_until:
        if display_ready():
            break
        time.sleep(0.25)
    else:
        raise RuntimeError("Desktop display unavailable")
    if subprocess.run(["pgrep", "-x", "xfwm4"], capture_output=True).returncode:
        background(["startxfce4"])
    if not port(5900):
        background(
            [
                "x11vnc",
                "-display",
                ":0",
                "-listen",
                "127.0.0.1",
                "-forever",
                "-shared",
                "-rfbport",
                "5900",
                "-nopw",
                "-wait",
                "50",
            ]
        )
    if not port(6080):
        background(
            ["./novnc_proxy", "--vnc", "127.0.0.1:5900", "--listen", "6080", "--web", "/opt/noVNC"],
            cwd="/opt/noVNC/utils",
        )
    for _ in range(40):
        if port(5900) and port(6080):
            return
        time.sleep(0.25)
    raise RuntimeError("Desktop viewer unavailable")


def health(network=False):
    missing = [p for p in (5900, 6080, 8899, 9222) if not port(p)]
    if missing:
        raise RuntimeError("Desktop services not ready: " + ",".join(map(str, missing)))
    direct = build_opener(ProxyHandler({}))
    with direct.open("http://127.0.0.1:9222/json/version", timeout=2) as reply:
        if "webSocketDebuggerUrl" not in json.load(reply):
            raise RuntimeError("Browser CDP unavailable")
    if network:
        proxy = build_opener(ProxyHandler({"https": "http://127.0.0.1:8899"}))
        with proxy.open("https://example.com", timeout=8) as reply:
            if reply.status != 200:
                raise RuntimeError("Public HTTPS unavailable")


def act(action):
    def key(value):
        run(["xdotool", "key", "--clearmodifiers", value])

    kind = action["kind"]
    if kind == "navigate":
        key("ctrl+l")
        run(["xdotool", "type", "--clearmodifiers", "--delay", "0", "--", action["url"]])
        key("Return")
    elif kind == "click":
        run(["xdotool", "mousemove", "--sync", str(action["x"]), str(action["y"])])
        run(["xdotool", "click", "1"])
    elif kind == "type":
        run(["xdotool", "type", "--clearmodifiers", "--delay", "0", "--", action["text"]])
    elif kind == "key":
        key("Return" if action["key"] == "Enter" else action["key"])
    elif kind == "scroll":
        run(["xdotool", "mousemove", str(action["x"]), str(action["y"])])
        run(
            [
                "xdotool",
                "click",
                "--repeat",
                str(action["amount"]),
                "--delay",
                "80",
                "4" if action["direction"] == "up" else "5",
            ]
        )
    else:
        raise ValueError("Unsupported desktop action")


if __name__ == "__main__":
    if sys.argv[1] == "setup":
        setup()
    elif sys.argv[1] == "health":
        health(network="--network" in sys.argv)
    elif sys.argv[1] == "act":
        act(json.loads(sys.argv[2]))
