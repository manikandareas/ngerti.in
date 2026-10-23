"""Probe actual retained runtime; configuration is never capability evidence."""

import json
import shlex

from ngertiin import e2b

PYTHON = "/opt/ngertiin-jev/bin/python"
PROBE = """
import hashlib,json,sys,importlib.metadata
import browser_harness.helpers
from urllib.request import build_opener,ProxyHandler
opener=build_opener(ProxyHandler({}))
with opener.open('http://127.0.0.1:9222/json/version',timeout=3) as response:
    browser=json.load(response)
print(json.dumps({'schema':2,'python':sys.version.split()[0],
 'harness':importlib.metadata.version('browser-harness'),
 'chrome':browser['Browser'],
 'generation':hashlib.sha256(browser['webSocketDebuggerUrl'].encode()).hexdigest(),
 'dom':True,'interpreter':sys.executable}))
"""


async def inspect(sandbox):
    result = await e2b.run(sandbox, PYTHON + " -c " + shlex.quote(PROBE), seconds=10)
    if result.exit_code:
        return {"schema": 2, "dom": False, "reason": "runtime_upgrade_required"}
    value = json.loads(result.stdout)
    if value.get("harness") != "0.1.13" or not value.get("python", "").startswith("3.12."):
        return {"schema": 2, "dom": False, "reason": "runtime_version_mismatch"}
    value["template_id"] = (await sandbox.get_info(request_timeout=15)).template_id
    return value
