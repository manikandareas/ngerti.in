"""Public HTTP(S) egress relay, deployed apart from model-written code.

The capsule has only an internal network. This volume-free relay resolves and
pins public destinations before connecting; it cannot reach private services,
host ports, another capsule, or cloud metadata through client-selected URLs.
"""

import ipaddress
import select
import socket
import socketserver
from urllib.parse import urlsplit


def destination(host, port):
    if port not in {80, 443}:
        raise ValueError("Unsupported destination port")
    addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    if not addresses or any(
        not ipaddress.ip_address(item[4][0]).is_global for item in addresses
    ):
        raise ValueError("Public destination required")
    return addresses[0][4][0], port


class Relay(socketserver.StreamRequestHandler):
    timeout = 30

    def handle(self):
        remote = None
        try:
            line = self.rfile.readline(8193)
            if len(line) > 8192:
                raise ValueError("Request line too long")
            method, target, version = line.decode("ascii").strip().split(" ")
            headers, size = [], 0
            while True:
                line = self.rfile.readline(8193)
                size += len(line)
                if len(line) > 8192 or size > 65536 or not line:
                    raise ValueError("Invalid headers")
                if line == b"\r\n":
                    break
                key, value = line.split(b":", 1)
                if key.lower() not in {b"proxy-authorization", b"proxy-connection"}:
                    headers.append((key, value.strip()))
            parsed = urlsplit("https://" + target if method == "CONNECT" else target)
            if (
                not parsed.hostname
                or parsed.username
                or parsed.password
                or parsed.scheme not in {"http", "https"}
            ):
                raise ValueError("Invalid destination")
            remote = socket.create_connection(
                destination(
                    parsed.hostname,
                    parsed.port or (443 if parsed.scheme == "https" else 80),
                ),
                timeout=20,
            )
            if method == "CONNECT":
                self.wfile.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                self.wfile.flush()
            else:
                path = parsed.path or "/"
                if parsed.query:
                    path += "?" + parsed.query
                remote.sendall(
                    f"{method} {path} {version}\r\n".encode("ascii")
                    + b"".join(key + b": " + value + b"\r\n" for key, value in headers)
                    + b"\r\n"
                )
            # Unbuffered request reads avoid trapping bytes from TLS/POST in the
            # file object's read-ahead buffer before the socket relay starts.
            while True:
                ready, _, _ = select.select([self.connection, remote], [], [], 60)
                if not ready:
                    break
                for source in ready:
                    chunk = source.recv(65536)
                    if not chunk:
                        return
                    (remote if source is self.connection else self.connection).sendall(
                        chunk
                    )
        except (OSError, ValueError, UnicodeError):
            if remote is None:
                self.wfile.write(
                    b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                )
        finally:
            if remote is not None:
                remote.close()

    rbufsize = 0


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Server(("0.0.0.0", 8080), Relay) as server:
        server.serve_forever()


def ensure_network(broker, scope):
    """One internal network and one disposable relay per authenticated scope."""
    name = "nma-egress-" + broker.controller[:8] + "-" + scope.key[:16]
    inspected = broker._docker("network", "inspect", name, check=False)
    if inspected.returncode:
        broker._docker("network", "create", "--internal", "--label", broker.label, name)
    else:
        import json

        info = json.loads(inspected.stdout)[0]
        if (
            not info["Internal"]
            or info.get("Labels", {}).get("nma-native.controller") != broker.controller
        ):
            raise ValueError("Unowned egress network")
    proxy = name + "-proxy"
    existing = broker._docker("inspect", proxy, check=False)
    if existing.returncode:
        broker._docker(
            "create",
            "--name",
            proxy,
            "--label",
            broker.label,
            "--network",
            "bridge",
            "--read-only",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--pids-limit",
            "128",
            "--memory",
            "128m",
            "--entrypoint",
            "/opt/native/bin/python",
            broker.image,
            "/opt/engine/ngertiin_engine/browser_egress.py",
        )
        broker._docker("network", "connect", "--alias", "egress", name, proxy)
    else:
        import json

        info = json.loads(existing.stdout)[0]
        if (
            info["Image"] != broker.image
            or info["Config"].get("Labels", {}).get("nma-native.controller")
            != broker.controller
            or info["Mounts"]
        ):
            raise ValueError("Unowned egress proxy")
    broker._docker("start", proxy)
    return name


def cleanup(broker):
    names = broker._docker(
        "ps", "-a", "--filter", "label=" + broker.label, "--format", "{{.Names}}"
    ).splitlines()
    for name in names:
        if name.startswith("nma-egress-"):
            broker._docker("rm", "--force", name, check=False)
    networks = broker._docker(
        "network", "ls", "--filter", "label=" + broker.label, "--format", "{{.Name}}"
    ).splitlines()
    for name in networks:
        broker._docker("network", "rm", name, check=False)
