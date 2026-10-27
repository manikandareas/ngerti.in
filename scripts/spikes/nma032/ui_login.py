"""Drive the actual conversation screen and verify same-agent login continuation.

Requires the disposable hashed login fixture and renewable Clerk browser session.
Private text crosses the browser CLI's stdin, never its argv or this report.
"""

import argparse
import json
import sqlite3
import subprocess
import time
from pathlib import Path

from ngertiin_engine.native_executor import IsolatedTools, Scope


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--private", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--session", default="nma032-repair-ui")
    args = parser.parse_args()
    metadata = json.loads(args.metadata.read_text())
    broker = IsolatedTools(
        Path(metadata["journal"]).parent, metadata["owner"], image=metadata["image"]
    )
    scope = Scope(**metadata["scope"])

    def browser(*command, stdin=None):
        return subprocess.run(
            ["agent-browser", "--session", args.session, *command],
            input=stdin,
            text=True,
            capture_output=True,
            check=True,
        ).stdout

    def evaluate(code):
        return browser("eval", "--stdin", stdin=code)

    def click(label):
        evaluate(
            "(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(x=>x.textContent==="
            + json.dumps(label)
            + ");if(!b||b.disabled)throw Error('Control unavailable');b.click();return 'Action requested'})()"
        )

    def settled():
        browser("wait", "500")
        browser(
            "wait",
            "--fn",
            "[...document.querySelectorAll('[role=dialog] button')].some(x=>x.textContent==='Periksa koneksi'&&!x.disabled)",
        )

    def point(x, y):
        evaluate(
            f"(()=>{{const v=document.querySelector('button[aria-label^=\"Layar komputer\"]'),b=v.getBoundingClientRect();if(v.disabled)throw Error('Input unavailable');v.dispatchEvent(new MouseEvent('click',{{bubbles:true,clientX:b.left+b.width*{x}/1280,clientY:b.top+b.height*{y}/800}}));return 'Target selected'}})()"
        )
        settled()

    def private_text(value):
        evaluate(
            "(()=>{const input=document.querySelector('input[aria-label=\"Teks privat ke layar\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,"
            + json.dumps(value)
            + ");input.dispatchEvent(new Event('input',{bubbles:true}));return 'Private input filled'})()"
        )
        browser("wait", "200")
        click("Kirim teks")
        settled()

    def focus_is(name, kind):
        container = broker.ensure(scope)["container"]
        expression = f"document.activeElement.name==={json.dumps(name)} && document.activeElement.type==={json.dumps(kind)}"
        program = (
            "import json;from urllib.request import urlopen;from websockets.sync.client import connect;t=next(t for t in json.load(urlopen('http://127.0.0.1:9222/json/list')) if '8766' in t.get('url',''));w=connect(t['webSocketDebuggerUrl']);w.send(json.dumps({'id':1,'method':'Runtime.evaluate','params':{'expression':"
            + repr(expression)
            + ",'returnByValue':True}}));print(json.loads(w.recv())['result']['result']['value'])"
        )
        assert (
            broker._docker(
                "exec", container, "/opt/native/bin/python", "-c", program
            ).strip()
            == "True"
        ), "Native input target did not match the expected field"

    args.evidence.mkdir(parents=True, exist_ok=True)
    evaluate(
        "(()=>{[...document.querySelectorAll('button')].find(x=>x.textContent==='Layar dan bantuan login').click();return 'Screen opened'})()"
    )
    browser("wait", "300")
    click("Hubungkan layar")
    settled()
    click("Ambil kontrol")
    settled()
    browser(
        "wait",
        "--fn",
        "[...document.querySelectorAll('[role=status]')].some(x=>x.textContent==='Anda memegang kontrol')",
    )
    click("ctrl+l")
    settled()
    private_text("http://127.0.0.1:8766/")
    click("Return")
    settled()
    browser("wait", "1500")
    browser("screenshot", str(args.evidence / "login-page.png"))
    point(150, 207)
    focus_is("name", "text")
    private_text("fixture@example.invalid")
    point(180, 227)
    focus_is("password", "password")
    private_text(json.loads(args.private.read_text())["password"])
    browser("wait", "1500")
    browser("screenshot", str(args.evidence / "login-masked.png"))
    point(45, 249)
    assert broker.file_bytes(scope, "login-verified") == b"LOGIN_VERIFIED"
    click("Kembalikan ke agent")
    settled()
    browser(
        "wait",
        "--fn",
        "[...document.querySelectorAll('[role=status]')].some(x=>x.textContent==='Agent memegang kontrol')",
    )
    browser("screenshot", str(args.evidence / "login-returned.png"))
    click("Tutup")
    with sqlite3.connect(Path(metadata["root"]) / "state/state.db") as db:
        watermark = db.execute(
            "SELECT COALESCE(MAX(sequence),0) FROM nma_events"
        ).fetchone()[0]
    prompt = "I completed the disposable login through the conversation screen and returned control to you. Re-observe the native browser and confirm LOGIN_VERIFIED. Then create /work/login-result.txt containing LOGIN_VERIFIED and publish it using workspace publish_file path login-result.txt. Continue as the same agent; do not read or ask for passwords."
    browser("fill", "textarea[placeholder]", prompt)
    evaluate(
        "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='Kirim pesan');if(b.disabled)throw Error('Composer unavailable');b.click();return 'Continuation sent'})()"
    )
    deadline = time.monotonic() + 180
    artifact = None
    while time.monotonic() < deadline:
        with sqlite3.connect(Path(metadata["root"]) / "state/state.db") as db:
            events = [
                json.loads(row[0])
                for row in db.execute(
                    "SELECT payload FROM nma_events WHERE sequence>? ORDER BY sequence DESC LIMIT 500",
                    (watermark,),
                )
            ]
        candidates = [
            event["payload"]
            for event in events
            if event.get("type") == "artifact.ready"
            and event.get("payload", {}).get("filename") == "login-result.txt"
        ]
        if candidates:
            item = candidates[0]
            if any(
                event.get("type") == "run.succeeded"
                and event.get("run_id") == item["producing_run_id"]
                for event in events
            ):
                artifact = item
                break
        time.sleep(0.5)
    assert artifact is not None, (
        "Same-agent continuation did not publish a successful result"
    )
    data = (
        Path(metadata["root"])
        / "state/files/objects"
        / artifact["sha256"][:2]
        / artifact["sha256"]
    ).read_bytes()
    assert (
        data == b"LOGIN_VERIFIED"
        and artifact["producing_agent_id"] == metadata["agent"]
        and artifact["thread_id"] == metadata["thread"]
    )
    evaluate(
        "(()=>{[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Pesan terbaru')?.click();return 'Latest message selected'})()"
    )
    browser("wait", "300")
    browser("screenshot", str(args.evidence / "conversation-result.png"))
    (args.evidence / "login-proof.json").write_text(
        json.dumps(
            {
                "same_agent": True,
                "same_thread": True,
                "exact_file_bytes": True,
                "native_password_field_verified_before_input": True,
                "input_returned_explicitly": True,
                "artifact": artifact,
            },
            indent=2,
        )
        + "\n"
    )
    print("Actual web login and same-agent continuation passed.")


if __name__ == "__main__":
    main()
