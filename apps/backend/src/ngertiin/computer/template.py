"""Pinned browser-harness installation for the trusted E2B actuator."""

INSTALL = r"""set -eu
python3 -m pip install --no-cache-dir uv==0.10.7
export UV_PYTHON_INSTALL_DIR=/opt/ngertiin-python
uv python install 3.12.12
JEV_RUNTIME=$(mktemp -d /opt/ngertiin-jev-v2.XXXXXXXX)
uv venv --python 3.12.12 "$JEV_RUNTIME"
chmod 755 "$JEV_RUNTIME"
python3 - <<'PY'
import hashlib,json,urllib.request
with urllib.request.urlopen('https://pypi.org/pypi/browser-harness/0.1.13/json',timeout=20) as r:
    release=json.load(r)
wheel=next(f for f in release['urls'] if f['filename'].endswith('py3-none-any.whl'))
with urllib.request.urlopen(wheel['url'],timeout=20) as r:
    data=r.read()
expected='2491459e4bfc0ee8aea22dc6c4680fc0f791b7ba553446323c50d2883449d769'
assert hashlib.sha256(data).hexdigest() == expected
open('/tmp/browser_harness-0.1.13-py3-none-any.whl','wb').write(data)
PY
uv pip install --python "$JEV_RUNTIME/bin/python" /tmp/browser_harness-0.1.13-py3-none-any.whl
"$JEV_RUNTIME/bin/python" -c 'import browser_harness.helpers'
if test -L /opt/ngertiin-jev; then
  readlink -f /opt/ngertiin-jev > /opt/ngertiin-jev.rollback
fi
if test -d /opt/ngertiin-jev && ! test -L /opt/ngertiin-jev; then
  mv /opt/ngertiin-jev /opt/ngertiin-jev-before-v2
  echo /opt/ngertiin-jev-before-v2 > /opt/ngertiin-jev.rollback
fi
ln -sfn "$JEV_RUNTIME" /opt/ngertiin-jev.next
mv -Tf /opt/ngertiin-jev.next /opt/ngertiin-jev
sync
"""
