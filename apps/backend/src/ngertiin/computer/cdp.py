"""Sandbox-local CDP transport for fixed app operations, never model-generated code."""

import base64
import json
import os
import socket
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, build_opener


def call(method, params=None, *, page=True):
    opener = build_opener(ProxyHandler({}))
    path = "/json/list" if page else "/json/version"
    with opener.open("http://127.0.0.1:9222" + path, timeout=3) as reply:
        values = json.load(reply)
    if page:
        values = next(v for v in values if v.get("type") == "page")
    target = urlsplit(values["webSocketDebuggerUrl"])
    with socket.create_connection(("127.0.0.1", 9222), timeout=3) as connection:
        key = base64.b64encode(os.urandom(16)).decode()
        connection.sendall(
            (
                f"GET {target.path} HTTP/1.1\r\nHost: localhost:9222\r\n"
                f"Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
                "Sec-WebSocket-Version: 13\r\n\r\n"
            ).encode()
        )
        buffered = bytearray()
        while b"\r\n\r\n" not in buffered:
            data = connection.recv(4096)
            if not data or len(buffered) > 16384:
                raise ValueError("Invalid local CDP handshake")
            buffered.extend(data)
        header, _, rest = bytes(buffered).partition(b"\r\n\r\n")
        if b" 101 " not in header.split(b"\r\n", 1)[0]:
            raise ValueError("CDP upgrade rejected")
        payload = json.dumps({"id": 1, "method": method, "params": params or {}}).encode()
        size = len(payload)
        length = (
            bytes([0x80 | size]) if size < 126 else bytes([0x80 | 126]) + size.to_bytes(2, "big")
        )
        mask = os.urandom(4)
        connection.sendall(
            b"\x81" + length + mask + bytes(v ^ mask[i % 4] for i, v in enumerate(payload))
        )
        buffered = bytearray(rest)

        def read(count):
            while len(buffered) < count:
                block = connection.recv(min(65536, count - len(buffered)))
                if not block:
                    raise OSError("CDP closed")
                buffered.extend(block)
            value = bytes(buffered[:count])
            del buffered[:count]
            return value

        for _ in range(20):
            first, second = read(2)
            size = second & 127
            if size == 126:
                size = int.from_bytes(read(2), "big")
            elif size == 127:
                size = int.from_bytes(read(8), "big")
            if size > 2 * 1024 * 1024 or second & 128:
                raise ValueError("Invalid CDP frame")
            data = read(size)
            if first & 15 == 8:
                raise OSError("CDP closed")
            value = json.loads(data)
            if value.get("id") == 1:
                if value.get("error"):
                    raise ValueError("CDP command rejected")
                return value["result"]
        raise ValueError("CDP response missing")


def target_fingerprint(action):
    # Context and form values are hashed INSIDE Chromium. No raw form values,
    # DOM text or authentication material leave the browser.
    expression = """(async () => {
      const a = ACTION;
      const top = window.screenY + window.outerHeight - window.innerHeight;
      let e = a.kind === 'click' ? document.elementFromPoint(a.x-window.screenX,a.y-top)
                              : document.activeElement;
      while (e?.shadowRoot) { const child=e.shadowRoot.elementFromPoint(a.x,a.y-top);
        if (!child || child===e) break; e=child; }
      const form=e?.form || e?.closest('form');
      const privateInput = e?.tagName === 'IFRAME' ||
        ['password','file'].includes(e?.type) ||
        /password|one-time-code|cc-number|cc-csc/.test(e?.autocomplete || '') ||
        !!form?.querySelector('input[type=password]');
      const fields=form ? Array.from(form.elements).map(x=>[x.name,x.type,x.value,x.checked]) : [];
      const context = {url:location.href,kind:a.kind,x:a.x,y:a.y,
        scroll:[scrollX,scrollY],window:[screenX,screenY,outerWidth,outerHeight,innerWidth,innerHeight],
        focused:document.hasFocus(),target:e ? [e.tagName,e.id,e.name,e.type,e.getAttribute('role'),
          e.getAttribute('aria-label'),e.getAttribute('href'),
          e.textContent?.slice(0,300),e.disabled] : null,
        form:form ? [form.action,form.method,fields] : null};
      const bytes=new TextEncoder().encode(JSON.stringify(context));
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const hex=x=>x.toString(16).padStart(2,'0');
      const fingerprint=Array.from(new Uint8Array(digest),hex).join('');
      return {fingerprint,
        private: !e || privateInput || !document.hasFocus()};
    })()""".replace("ACTION", json.dumps({k: action[k] for k in ("kind", "x", "y")}))
    result = call(
        "Runtime.evaluate", {"expression": expression, "awaitPromise": True, "returnByValue": True}
    )
    if result.get("exceptionDetails"):
        raise ValueError("Target could not be inspected")
    return result["result"]["value"]
