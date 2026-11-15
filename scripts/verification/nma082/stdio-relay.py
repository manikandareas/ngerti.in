"""Disposable lab transport: relay an operator stdio channel to the VM's declared HTTPS interface."""

import os
import select
import socket


with socket.create_connection(("192.168.139.179", 443), timeout=5) as peer:
    peer.settimeout(10)
    while True:
        readable, _, _ = select.select([0, peer], [], [], 15)
        if not readable:
            break
        if 0 in readable:
            data = os.read(0, 65536)
            if not data:
                break
            peer.sendall(data)
        if peer in readable:
            data = peer.recv(65536)
            if not data:
                break
            remaining = memoryview(data)
            while remaining:
                remaining = remaining[os.write(1, remaining):]
