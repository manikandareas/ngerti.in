import asyncio,json
from pathlib import Path
from uuid import uuid4
from ngertiin.agent_engine.computer_bridge import execute
from ngertiin.computer.e2b import running,resource

async def main():
    identity=str(uuid4())
    workspace={'id':identity,'resource_name':'nma-'+identity,'resource_id':None,'control_version':1,'control':'agent'}
    proof={'scope':'Disposable E2B filesystem restore and private ingress, not RAM/CDP persistence'}
    try:
        first=await execute({'operation':'observe','workspace':workspace})
        workspace['resource_id']=first['resource_id']
        sandbox=await running(workspace)
        await sandbox.files.write('/home/user/nma-restore-proof.txt','durable-file-proof')
        info=await resource(workspace)
        proof['private_ingress']=info.network.get('allow_public_traffic') is False
        await execute({'operation':'pause','workspace':workspace})
        proof['paused_state']=str((await resource(workspace)).state)
        second=await execute({'operation':'observe','workspace':workspace})
        sandbox=await running(workspace)
        proof['filesystem_restored']=await sandbox.files.read('/home/user/nma-restore-proof.txt')=='durable-file-proof'
        proof['same_resource']=second['resource_id']==first['resource_id']
        assert proof['private_ingress'] and proof['filesystem_restored'] and proof['same_resource']
        assert proof['paused_state']=='paused'
    finally:
        proof['cleanup']=await execute({'operation':'delete','workspace':workspace})
        proof['resource_absent']=await resource(workspace) is None
        Path('docs/research/evidence/nma-021-024/restore.json').write_text(json.dumps(proof,indent=2)+'\n')
    assert proof['resource_absent']
asyncio.run(main())
