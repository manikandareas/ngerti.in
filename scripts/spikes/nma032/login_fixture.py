"""Prepare an independent hashed-password login oracle in a disposable capsule."""

import argparse
import hashlib
import json
import secrets
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--metadata", type=Path, required=True)
parser.add_argument("--private", type=Path, required=True)
args = parser.parse_args()
m = json.loads(args.metadata.read_text())
password = secrets.token_urlsafe(18)
p = args.private
p.write_text(json.dumps({"password": password}))
p.chmod(0o600)
server = """from http.server import BaseHTTPRequestHandler,HTTPServer
from urllib.parse import parse_qs
from pathlib import Path
import hashlib
class H(BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_GET(self):
  data=b'<title>Disposable login challenge</title><h1>Sign in</h1><form method="post"><label>Email<input name="name" autocomplete="username"></label><br><label>Password<input name="password" type="password" autocomplete="current-password"></label><br><button>Sign in</button></form>';self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_POST(self):
  fields=parse_qs(self.rfile.read(int(self.headers['Content-Length'])).decode());ok=fields.get('name')==['fixture@example.invalid'] and hashlib.sha256(fields.get('password',[''])[0].encode()).hexdigest()==HASH
  if ok:Path('/work/login-verified').write_text('LOGIN_VERIFIED')
  data=b'<title>Authenticated</title>LOGIN_VERIFIED' if ok else b'LOGIN_FAILED';self.send_response(200 if ok else 403);self.send_header('Content-Length',str(len(data)))
  if ok:self.send_header('Set-Cookie','verified=1; HttpOnly; Max-Age=86400; Path=/')
  self.end_headers();self.wfile.write(data)
HTTPServer(('127.0.0.1',8766),H).serve_forever()
""".replace("HASH", repr(hashlib.sha256(password.encode()).hexdigest()))
from ngertiin_engine.native_executor import IsolatedTools, Scope

b = IsolatedTools(Path(m["journal"]).parent, m["owner"], image=m["image"])
scope = Scope(**m["scope"])
b.screen.suspend(scope)
with b._db() as db:
    c = db.execute(
        "SELECT container FROM scopes WHERE scope_key=?", (scope.key,)
    ).fetchone()[0]
program = (
    "from pathlib import Path;import subprocess;Path('/work/login-fixture.py').write_text("
    + repr(server)
    + ");subprocess.Popen(['/opt/native/bin/python','/work/login-fixture.py'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)"
)
b._docker("exec", "-i", c, "/opt/native/bin/python", "-", input=program)
print(
    "Disposable hashed-password login fixture ready; earlier development grants revoked."
)
