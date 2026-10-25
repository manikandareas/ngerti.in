"""ClerkJS ticket authentication for recorded disposable acceptance identities.

The loopback-only server passes short-lived tickets to ClerkJS and saves signed
session tokens privately. No production authentication dependency is overridden.
"""

import argparse
import base64
import hashlib
import json
import os
import signal
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen

from clerk_backend_api import Clerk
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[3]


def private_save(path, value):
    temporary = path.with_suffix(".next.json")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.chmod(0o600)
    os.replace(temporary, path)


PAGE = """<!doctype html><meta charset="utf-8"><title>Disposable Clerk acceptance</title>
<main><h1>Disposable Clerk authentication</h1><p id="status">Loading ClerkJS…</p></main>
<script>
window.acceptanceStatus = {ready:false};
async function start() {
  const config = await fetch('/config/'+location.pathname.split('/').pop()).then(r=>r.json());
  const script = document.createElement('script');
  script.crossOrigin = 'anonymous';
  script.dataset.clerkPublishableKey = config.publishable_key;
  script.src = config.script_url;
  document.head.append(script);
  await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=reject;});
  await Clerk.load();
  if (!Clerk.session || Clerk.user?.id !== config.user_id) {
    const attempt = await Clerk.client.signIn.create({strategy:'ticket',ticket:config.ticket});
    if (attempt.status !== 'complete') throw Error('Ticket sign-in status '+attempt.status);
    await Clerk.setActive({session:attempt.createdSessionId});
  }
  async function refresh() {
    const token = await Clerk.session.getToken({skipCache:true});
    const result = await fetch('/capture/'+config.index, {method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({token,session_id:Clerk.session.id})}).then(r=>r.json());
    if (!result.verified) throw Error('Production API rejected the signed browser session');
    window.acceptanceStatus = {ready:true,index:config.index,verified:true};
    document.querySelector('#status').textContent = 'Real Clerk session verified by production current_account.';
  }
  await refresh();
  setInterval(()=>refresh().catch(()=>{window.acceptanceStatus.ready=false;}),15000);
}
start().catch(error=>{window.acceptanceStatus={ready:false,error:String(error)};
  document.querySelector('#status').textContent='Authentication failed: '+String(error);});
</script>"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--port", type=int, default=3028)
    parser.add_argument("--origin", default="http://127.0.0.1:3028")
    parser.add_argument("--clerk-js-version", default="4.73.14")
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    values = dotenv_values(ROOT / ".env")
    secret = values.get("CLERK_SECRET_KEY", "")
    publishable = values.get("VITE_CLERK_PUBLISHABLE_KEY", "")
    if not secret.startswith("sk_test_") or not publishable.startswith("pk_test_"):
        raise ValueError("This fixture requires Clerk development keys")
    domain = base64.b64decode(publishable.split("_", 2)[2] + "===").decode().rstrip("$")
    client = Clerk(bearer_auth=secret)
    lock = threading.Lock()
    tickets = {}
    evidence = (
        json.loads(args.evidence.read_text())
        if args.evidence.exists()
        else {
            "authentication": "Production current_account, actual ClerkJS session tokens",
            "identities": {},
            "denials": {},
        }
    )
    script_url = f"https://{domain}/npm/@clerk/clerk-js@{args.clerk_js_version}/dist/clerk.browser.js"
    with urlopen(script_url, timeout=20) as response:
        script = response.read()
    evidence["clerk_js"] = {
        "version": args.clerk_js_version,
        "source_url": script_url,
        "sha256": hashlib.sha256(script).hexdigest(),
        "bytes": len(script),
    }
    evidence["origin"] = args.origin

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def reply(self, value, status=200, content_type="application/json"):
            data = (
                value.encode() if isinstance(value, str) else json.dumps(value).encode()
            )
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path.startswith("/user/"):
                return self.reply(PAGE, content_type="text/html; charset=utf-8")
            if self.path == "/status":
                return self.reply(evidence)
            if self.path.startswith("/session?"):
                index = int(
                    parse_qs(urlsplit(self.path).query).get("identity", ["0"])[0]
                )
                if index not in (0, 1):
                    return self.reply({"error": "Unknown disposable identity"}, 404)
                state = json.loads(args.state.read_text())
                identity = state["identities"][index]
                return self.reply(
                    {
                        "token": identity.get("jwt"),
                        "user_id": identity["user_id"],
                        "session_id": identity["session_id"],
                        "owner_id": identity.get("owner_id"),
                    }
                )
            if self.path.startswith("/config/"):
                index = int(self.path.split("/")[-1])
                if index not in (0, 1):
                    return self.reply({"error": "Unknown disposable identity"}, 404)
                with lock:
                    state = json.loads(args.state.read_text())
                    if index not in tickets:
                        created = client.sign_in_tokens.create(
                            request={
                                "user_id": state["identities"][index]["user_id"],
                                "expires_in_seconds": 600,
                            },
                            retries=None,
                            timeout_ms=15000,
                        )
                        tickets[index] = created.token
                    return self.reply(
                        {
                            "index": index,
                            "user_id": state["identities"][index]["user_id"],
                            "publishable_key": publishable,
                            "script_url": script_url,
                            "ticket": tickets[index],
                        }
                    )
            self.reply({"error": "Not found"}, 404)

        def do_POST(self):
            if not self.path.startswith("/capture/"):
                return self.reply({"error": "Not found"}, 404)
            index = int(self.path.split("/")[-1])
            if index not in (0, 1):
                return self.reply({"error": "Unknown identity"}, 404)
            raw = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            bearer = raw["token"]
            claims = json.loads(base64.urlsafe_b64decode(bearer.split(".")[1] + "==="))
            with lock:
                state = json.loads(args.state.read_text())
                identity = state["identities"][index]
                if (
                    claims.get("sub") != identity["user_id"]
                    or claims.get("azp") != args.origin
                ):
                    return self.reply({"verified": False}, 403)
                try:
                    with urlopen(
                        Request(
                            state["base"] + "/me",
                            headers={"Authorization": "Bearer " + bearer},
                        ),
                        timeout=20,
                    ) as response:
                        account = json.load(response)
                except HTTPError as error:
                    evidence["identities"][str(index)] = {
                        "verified": False,
                        "http_status": error.code,
                    }
                    return self.reply({"verified": False}, 401)
                if account["clerk_user_id"] != identity["user_id"]:
                    return self.reply({"verified": False}, 403)
                identity.setdefault("backend_session_id", identity.get("session_id"))
                identity.update(
                    jwt=bearer,
                    session_id=raw["session_id"],
                    owner_id=account["id"],
                    token_updated_at=time.time(),
                )
                private_save(args.state, state)
                evidence["identities"][str(index)] = {
                    "verified": True,
                    "http_status": 200,
                    "owner_id": account["id"],
                    "clerk_subject": identity["user_id"],
                    "issuer": claims["iss"],
                    "azp": claims["azp"],
                    "token_expiry": claims["exp"],
                    "verified_at": time.time(),
                }
                for label, authorization in (
                    ("missing", None),
                    ("invalid", "Bearer invalid-session-token"),
                ):
                    try:
                        headers = (
                            {"Authorization": authorization} if authorization else {}
                        )
                        urlopen(
                            Request(state["base"] + "/me", headers=headers), timeout=10
                        )
                    except HTTPError as error:
                        evidence["denials"][label] = error.code
                args.evidence.parent.mkdir(parents=True, exist_ok=True)
                args.evidence.write_text(json.dumps(evidence, indent=2) + "\n")
            self.reply({"verified": True})

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    pid_path = args.state.with_name("browser-auth.pid")
    pid_path.write_text(str(os.getpid()) + "\n")
    pid_path.chmod(0o600)
    print("Loopback ClerkJS ticket fixture ready; tokens remain private.", flush=True)
    stop.wait()
    server.shutdown()


if __name__ == "__main__":
    main()
