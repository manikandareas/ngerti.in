"""Trusted sandbox-side HTTP proxy: public IPs only, pinned DNS and finite transfer.

No application credentials or request/header logging. Chromium is forced through
this proxy, including loopback; QUIC and non-proxied WebRTC are disabled.
"""

import ipaddress
import json
import select
import socket
import socketserver
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit

LIMIT = 200 * 1024 * 1024
TOTAL = 0
LOCK = threading.Lock()
SLOTS = threading.BoundedSemaphore(16)


def public_connection(host, port):
    if port not in (80, 443):
        raise ValueError("port")
    addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError("private destination")
    family, kind, proto, _, address = addresses[0]
    sock = socket.socket(family, kind, proto)
    sock.settimeout(8)
    sock.connect(address)  # Pin the resolved address; do not resolve again.
    return sock


class Proxy(socketserver.BaseRequestHandler):
    def handle(self):
        global TOTAL
        if not SLOTS.acquire(blocking=False):
            return
        remote = None
        try:
            self.request.settimeout(8)
            header = b""
            while b"\r\n\r\n" not in header:
                block = self.request.recv(4096)
                if not block or len(header) + len(block) > 32768:
                    return
                header += block
            first = header.split(b"\r\n", 1)[0].decode("ascii")
            method, target, _ = first.split(" ", 2)
            if method == "CONNECT":
                parsed = urlsplit("//" + target)
                remote = public_connection(parsed.hostname, parsed.port or 443)
                self.request.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            else:
                parsed = urlsplit(target)
                if parsed.scheme != "http" or parsed.username or parsed.password:
                    return
                remote = public_connection(parsed.hostname, parsed.port or 80)
                path = (parsed.path or "/") + ("?" + parsed.query if parsed.query else "")
                header = header.replace(target.encode(), path.encode(), 1)
                remote.sendall(header)
            started, transferred = time.monotonic(), 0
            while time.monotonic() - started < 90:
                readable, _, _ = select.select([self.request, remote], [], [], 10)
                if not readable:
                    return
                for source in readable:
                    data = source.recv(65536)
                    if not data:
                        return
                    with LOCK:
                        TOTAL += len(data)
                        transferred += len(data)
                        if TOTAL > LIMIT or transferred > 25 * 1024 * 1024:
                            return
                        Path("/tmp/ng036/egress.json").write_text(json.dumps({"bytes": TOTAL}))
                    (remote if source is self.request else self.request).sendall(data)
        except (OSError, ValueError, UnicodeError):
            pass
        finally:
            if remote:
                remote.close()
            SLOTS.release()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Server(("127.0.0.1", 8899), Proxy) as server:
        server.serve_forever()
