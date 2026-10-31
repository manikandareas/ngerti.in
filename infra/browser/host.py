"""One headful browser/profile/display; VNC observes this exact X server."""
import os
import signal
import subprocess
import time
from pathlib import Path

import configure  # noqa: F401

children = []

def stop(*_):
    for child in reversed(children):
        if child.poll() is None:
            child.terminate()
    for child in reversed(children):
        try:
            child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            child.kill()
    raise SystemExit(0)

signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
# A stopped container has no live Chrome singleton. Never touch another profile.
for name in ('SingletonLock', 'SingletonSocket', 'SingletonCookie'):
    (Path('/profile') / name).unlink(missing_ok=True)
children.append(subprocess.Popen(['Xvfb', ':99', '-screen', '0', '1280x900x24', '-nolisten', 'tcp']))
for _ in range(100):
    if Path('/tmp/.X11-unix/X99').exists():
        break
    time.sleep(0.05)
children.append(subprocess.Popen([
    'chromium', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--no-first-run', '--no-default-browser-check', '--disable-session-crashed-bubble',
    '--password-store=basic', '--user-data-dir=/profile', '--remote-debugging-port=9222',
    '--remote-debugging-address=127.0.0.1', '--window-size=1280,900', '--window-position=0,0',
    'about:blank',
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
# RFB is private on the container network; only the application gateway can expose it.
children.append(subprocess.Popen(['x11vnc', '-display', ':99', '-rfbport', '5900', '-forever', '-shared', '-nopw', '-viewonly', '-quiet'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
while all(child.poll() is None for child in children):
    time.sleep(0.5)
stop()
