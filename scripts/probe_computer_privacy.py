"""Run the real privacy JavaScript against synthetic DOMs in isolated Chromium."""

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SESSION = ["agent-browser", "--session", "ngertiin-privacy-probe"]
CASES = [
    ("ordinary_search", '<input type="search" name="q">', False),
    ("password", '<input type="password" value="synthetic-canary">', True),
    ("otp", '<input autocomplete="one-time-code" value="123456">', True),
    (
        "callback_link",
        '<a href="https://example.org/?access_token=synthetic-canary">Open</a>',
        True,
    ),
    ("file", '<input type="file">', True),
    ("loading_frame", '<iframe src="https://example.org"></iframe>', True),
]


def main():
    gate = (
        ROOT / "apps/backend/src/ngertiin/computer/jev_assets/privacy.js"
    ).read_text()
    script = "(() => { const gate = () => " + gate + "; const results=[];"
    script += "for (const [name,html,expected] of " + json.dumps(CASES) + ") {"
    script += "document.body.innerHTML=html; const result=gate();"
    script += "if(result.private!==expected) throw Error(name);"
    script += (
        "if(JSON.stringify(result).includes('synthetic-canary')) throw Error('secret');"
    )
    script += "results.push({name,passed:true});}"
    script += "document.body.innerHTML='<div id=host></div>';"
    script += "document.querySelector('#host').attachShadow({mode:'open'}).innerHTML="
    script += "'<input type=password>'; if(!gate().private) throw Error('shadow');"
    script += "results.push({name:'shadow',passed:true});"
    assets = ROOT / "apps/backend/src/ngertiin/computer/jev_assets"
    script += "document.body.innerHTML='<article>Original fixture source</article>';"
    script += (
        "window.__ngertiinContext=" + (assets / "target_context.js").read_text() + ";"
    )
    script += "const page = (() => {const privacy=" + gate
    script += ";if(!privacy||privacy.private)return {private:true};return ("
    script += (assets / "snapshot.js").read_text() + ");})();"
    script += (
        "if(!page?.text?.includes('Original fixture source')) throw Error('snapshot');"
    )
    script += "results.push({name:'gated_snapshot',passed:true});"
    script += "const snapshot=()=> (" + (assets / "snapshot.js").read_text() + ");"
    script += "document.body.innerHTML='<a id=link href=https://example.org/article>Read</a><p id=status>Before</p>';"
    script += (
        "const before=snapshot();document.getElementById('status').textContent='After';"
    )
    script += "const after=snapshot();"
    script += "if(JSON.stringify(before.guards)!==JSON.stringify(after.guards)) throw Error('unrelated link stale');"
    script += "if(JSON.stringify(before.page_key)===JSON.stringify(after.page_key)) throw Error('document freshness');"
    script += (
        "results.push({name:'routine_link_ignores_unrelated_updates',passed:true});"
    )
    script += "document.getElementById('link').href='https://example.org/logout';"
    script += "if(JSON.stringify(snapshot().guards)===JSON.stringify(after.guards)) throw Error('changed link accepted');"
    script += "results.push({name:'changed_link_still_invalidated',passed:true});return results;})()"
    try:
        subprocess.run(
            [*SESSION, "open", "about:blank"], check=True, capture_output=True
        )
        result = subprocess.run(
            [*SESSION, "eval", "--stdin"],
            input=script,
            text=True,
            capture_output=True,
            check=True,
        )
        print(result.stdout)
    finally:
        subprocess.run([*SESSION, "close"], check=False, capture_output=True)


if __name__ == "__main__":
    main()
