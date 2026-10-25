"""Real native browser/terminal probe inside a secret-free disposable container."""

import hashlib
import importlib.metadata
import json
import os
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs

CSV = b"name,total\nsynthetic,42\n"
ledger = []


class Fixture(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        ledger.append({"method": "GET", "path": self.path})
        if self.path == "/download.csv":
            value, kind = CSV, "text/csv"
        else:
            value = b"""<html><title>NMA028 fixture</title><a href="/form">Continue</a>
<form method="POST" action="/submit"><input name="name"><input name="note"><button>Submit</button></form>
<a href="/download.csv" download="report.csv">Download</a></html>"""
            kind = "text/html"
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(value)))
        self.end_headers()
        self.wfile.write(value)

    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"])).decode()
        ledger.append({"method": "POST", "path": self.path, "fields": parse_qs(body)})
        self.send_response(200)
        self.end_headers()
        self.wfile.write(
            b"<html><title>Saved</title><p id='receipt'>NMA028_SAVED</p></html>"
        )


def main():
    state = Path(os.environ["HERMES_HOME"])
    state.mkdir(mode=0o700, exist_ok=True)
    (state / "config.yaml").write_text(
        json.dumps(
            {
                "terminal": {"backend": "local", "cwd": "/work"},
                "browser": {"engine": "chromium", "allow_private_urls": True},
            }
        )
    )
    # Synthetic negative control: same-UID runtime files are not secret-isolated.
    (state / "dummy-control-secret").write_text("synthetic-control-canary")
    server = ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    with Path("/work/chromium.log").open("w+") as browser_log:
        browser = subprocess.Popen(
            [
                "chromium",
                "--headless",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--remote-debugging-port=9222",
                "--user-data-dir=/work/chromium",
                "about:blank",
            ],
            stdout=browser_log,
            stderr=browser_log,
        )
        os.environ["BU_CDP_URL"] = "http://127.0.0.1:9222"
        os.environ["BH_HOME"] = "/work/harness"
        from tools.browser_use_cli import browser_exec, stop_harness_daemons
        from tools.terminal_tool import terminal_tool

        result = {
            "research_only": True,
            "model": None,
            "attempts": [],
            "pid": os.getpid(),
            "uid": os.getuid(),
        }
        try:
            # CDP readiness is observed, not assumed from process creation.
            from urllib.request import urlopen

            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                try:
                    with urlopen(
                        "http://127.0.0.1:9222/json/version", timeout=1
                    ) as response:
                        result["chromium"] = json.load(response)["Browser"]
                    break
                except OSError:
                    time.sleep(0.1)
            if "chromium" not in result:
                browser_log.flush()
                raise RuntimeError(
                    "CDP failed readiness: " + Path("/work/chromium.log").read_text()
                )
            for repeat in range(1, 4):
                session = f"nma028-{repeat}"
                base = f"http://127.0.0.1:{server.server_port}"
                steps = [
                    (
                        "navigation",
                        f'new_tab("{base}/"); wait_for_load(); js("document.querySelector(\'a\').click()"); wait_for_load(); print(page_info())',
                    ),
                    (
                        "form_action",
                        'fill_input("input[name=name]", "Synthetic"); fill_input("input[name=note]", "NMA028"); js("document.querySelector(\'button\').click()"); wait_for_load(); print(page_info())',
                    ),
                    (
                        "form_observation",
                        "print(js(\"document.querySelector('#receipt').textContent\"))",
                    ),
                    (
                        "download",
                        f'from pathlib import Path; import urllib.request; data=urllib.request.urlopen("{base}/download.csv").read(); Path("/work/report.csv").write_bytes(data); print(len(data))',
                    ),
                    (
                        "execution_boundary",
                        'import os, hashlib; from pathlib import Path; print({"uid":os.getuid(), "pid":os.getpid(), "cwd":os.getcwd(), "docker_socket":Path("/var/run/docker.sock").exists(), "other_account":Path("/other-account/canary").exists(), "runtime_secret":os.environ.get("NMA_CONTROL_CANARY"), "same_uid_control_canary_readable":hashlib.sha256(Path("/work/state/dummy-control-secret").read_bytes()).hexdigest()})',
                    ),
                ]
                for phase, code in steps:
                    started = time.monotonic()
                    value = browser_exec(
                        code, session=session, task_id=session, timeout_s=45
                    )
                    result["attempts"].append(
                        {
                            "repeat": repeat,
                            "phase": phase,
                            "duration_s": time.monotonic() - started,
                            "result": value,
                        }
                    )
                terminal = terminal_tool(
                    "sha256sum /work/report.csv && id && test ! -S /var/run/docker.sock && test ! -e /other-account/canary",
                    task_id=session,
                )
                result["attempts"].append(
                    {"repeat": repeat, "phase": "terminal_verify", "result": terminal}
                )
            posts = [r for r in ledger if r["method"] == "POST"]
            result.update(
                ledger=ledger,
                expected_csv_sha256=hashlib.sha256(CSV).hexdigest(),
                observed_csv_sha256=hashlib.sha256(
                    Path("/work/report.csv").read_bytes()
                ).hexdigest()
                if Path("/work/report.csv").exists()
                else None,
                form_oracle=len(posts) == 3
                and all(
                    r["fields"] == {"name": ["Synthetic"], "note": ["NMA028"]}
                    for r in posts
                ),
                browser_harness=importlib.metadata.version("browser-harness"),
                fetch_use=importlib.metadata.version("fetch-use"),
                limitations=[
                    "Fixed Python drives real native tools; this is not a real-model or authenticated Ngertiin task.",
                    "Chromium --no-sandbox uses outer disposable container; no host mount/socket or model credentials.",
                    "urllib download runs in browser_exec Python; browser-managed download semantics remain unverified.",
                    "No claim of within-runtime secret isolation: same-container model Python can read files available to its UID.",
                ],
            )
        finally:
            stop_harness_daemons()
            browser.terminate()
            browser.wait(timeout=10)
            server.shutdown()
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
