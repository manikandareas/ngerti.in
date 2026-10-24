import json, sys, threading
from pathlib import Path
sys.path.insert(0, str(Path('apps/engine/tests').resolve()))
from test_runtime import runtime, command
from test_direct_messages import public_api
from test_discussions import group
r = runtime.__wrapped__(None)
state = next(r)
api = public_api.__wrapped__(state)
request = next(api)
root, provider, call, *_ = state
thread = group(call)
a = thread['agents'][0]
dm = call(command('thread.create', {'kind':'dm','title':'Private Researcher','agent_ids':[a['agent_id']]}))['result']['thread']
def respond(body, text):
    if not body.get('messages'): return None
    prompt = next((m['content'] for m in reversed(body['messages']) if m['role']=='user'), '')
    if 'slow-check' in prompt:
        threading.Event().wait(12)
    if 'You are @researcher' in prompt:
        result = 'Research: 45 litres / 360 km × 100 = **12.5 L/100 km**. @writer turn this into a short report.'
    elif 'You are @writer' in prompt:
        result = '## Fuel report\nThe vehicle consumed **12.5 L/100 km** over 360 km. @reviewer verify the calculation.'
    elif 'You are @reviewer' in prompt:
        result = 'Review complete: **12.5 L/100 km** is correct. The report is ready.'
    else: result = 'Private DM response.'
    return {'role':'assistant','content':result}
provider.goal_script = respond
with request('/agents') as response: base=response.url.split('/api/')[0]
Path('.dev/nma-018/browser.json').write_text(json.dumps({'base':base,'thread':thread['thread_id'],'dm':dm['thread_id'],'root':str(root)}))
print('Browser acceptance API ready', flush=True)
try: threading.Event().wait()
finally:
    api.close(); r.close()
