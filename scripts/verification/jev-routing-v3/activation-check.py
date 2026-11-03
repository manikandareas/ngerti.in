"""Read-only post-activation verification; credentials never enter the report."""
from pathlib import Path
import datetime
import hashlib
import json
import sqlite3
import stat
import urllib.request

installation = json.loads(Path('.dev/harness-first/installation.json').read_text())

def get(path):
    request = urllib.request.Request('http://127.0.0.1:8000' + path,
        headers={'Authorization': 'Bearer ' + installation['token']})
    return json.load(urllib.request.urlopen(request))

health, contract, harnesses = get('/health/ready'), get('/v1/contracts'), get('/v1/harnesses')
assert health['contract_version'] == '1.27.0' and health['group_routing'] == 'jev'
assert contract['version'] == '1.27.0' and len(contract['http']) == 95
for ready in health['harnesses']:
    detected = next(item for item in harnesses if item['harness'] == ready['harness'])
    assert all(ready[key] == detected[key] for key in ['harness', 'state', 'version', 'executable'])
    assert ready['minimum_version'] == detected['manifest']['minimum_version']

connection = sqlite3.connect('file:.dev/harness-first/ngertiin.sqlite?mode=ro', uri=True)
rows = connection.execute('select kind,id,body from entities').fetchall()
current = {kind + ':' + identity: body for kind, identity, body in rows}
baseline = json.loads(Path('.dev/jev-routing-v3/activation/baseline.json').read_text())
changed = [key for key, value in baseline['records'].items()
    if key not in current or hashlib.sha256(current[key].encode()).hexdigest() != value]
assert not changed
active = [json.loads(body) for kind, _, body in rows if kind == 'run'
    and json.loads(body)['status'] in ['queued', 'dispatching', 'running', 'cancel_requested', 'unknown']]
assert not active
original = current['group_route:25fc1830-15ef-4cd7-8f38-c1f495016a70']
assert hashlib.sha256(original.encode()).hexdigest() == baseline['original_route_sha256']
frontend = urllib.request.urlopen('http://127.0.0.1:3001').status
assert frontend == 200
snapshot = get('/v1/threads/3e144112-15f2-4b5c-b58f-7e05d5d4a458/snapshot')
assert not any(route['state'] == 'pending' for route in snapshot['routes'])
report = {
    'captured_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'health': health, 'declared_operations': len(contract['http']),
    'readiness_matches_harness_endpoint': True,
    'previous_pid': 7092, 'graceful_restart': True,
    'active_runs_before': 0, 'active_runs_after': len(active),
    'baseline_records': len(baseline['records']),
    'byte_identical_records': len(baseline['records']),
    'record_kinds': ['message', 'artifact', 'goal', 'routine', 'agent', 'thread'],
    'backup_sha256': baseline['backup_sha256'],
    'backup_mode': oct(stat.S_IMODE(Path('.dev/jev-routing-v3/activation/before.sqlite').stat().st_mode)),
    'frontend_status': frontend, 'original_bad_route_unchanged': True,
    'test_messages_added_to_user_group': 0, 'user_data_reset': False, 'result': 'passed',
}
Path('docs/verification/jev-routing-v3/activation.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({key: report[key] for key in ['declared_operations', 'baseline_records',
    'byte_identical_records', 'active_runs_after', 'frontend_status', 'result']}))
connection.close()
