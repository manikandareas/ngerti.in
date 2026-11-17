import subprocess,json
from pathlib import Path
p=json.loads(Path('.dev/nma058/host-proof/identity.json').read_text());name=f"ngertiin-browser-{p['owner']}-{p['profile']}"
code='''import importlib.metadata as m,platform,json,base64
from pathlib import Path
server=next(p for p in m.files('browser-use') if str(p)=='browser_use/mcp/server.py')
print(json.dumps({'python':platform.python_version(),'packages':{p:m.version(p) for p in ['browser-use','browser-harness','mcp','cdp-use']},'original_mcp_server_wheel_record_sha256':base64.urlsafe_b64decode(server.hash.value+'===').hex()}))'''
out=json.loads(subprocess.check_output(['docker','exec',name,'python','-c',code],text=True))
image=json.loads(subprocess.check_output(['docker','image','inspect','ngertiin-browser:nma058'],text=True))[0]
out.update({'image_id':image['Id'],'image_repo_digests':image['RepoDigests'],'architecture':image['Architecture'],'base_image':'python:3.12.12-slim-bookworm@sha256:593bd06efe90efa80dc4eee3948be7c0fde4134606dd40d8dd8dbcade98e669c','system_packages':subprocess.check_output(['docker','exec',name,'dpkg-query','-W','chromium','xvfb','x11vnc'],text=True).strip().splitlines()})
assert out['original_mcp_server_wheel_record_sha256']=='696aee232f331ca215bb6e5ed21d5400dda1e4e530a6af6ade923e928acb2bd3'
Path('.dev/verification/nma-058/browser-image.json').write_text(json.dumps(out,indent=2)+'\n')
subprocess.run(['docker','stop','--time=15',name],check=True,stdout=subprocess.DEVNULL)
print(json.dumps(out,indent=2))
