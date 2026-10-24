(async () => {
 const token = await window.Clerk.session.getToken();
 const read = async path => {
   const response = await fetch('http://localhost:8000/api/agent-engine/v1'+path,{headers:{Authorization:'Bearer '+token}});
   if (!response.ok) throw Error('HTTP '+response.status);
   return response.json();
 };
 const agents = await read('/agents');
 const threads = await read('/threads');
 const snapshots = await Promise.all(threads.items.filter(t=>t.kind==='dm').map(t=>read('/threads/'+t.thread_id+'/snapshot')));
 const researcher=snapshots.find(s=>s.thread.agents[0].handle==='researcher');
 const writer=snapshots.find(s=>s.thread.agents[0].handle==='writer');
 const uncertain=researcher.messages.filter(m=>m.author_kind==='user' && m.content==='Periksa pengiriman tunggal saat respons hilang.');
 const interrupted=writer.messages.find(m=>m.content==='LAMBAT: buat draf awal.');
 const result={agents:agents.items.map(a=>({id:a.agent_id,name:a.display_name,configRevision:a.config_revision})),dmCount:threads.items.filter(t=>t.kind==='dm').length,snapshots:snapshots.map(s=>({threadId:s.thread.thread_id,agent:s.thread.agents[0].display_name,messageIds:s.messages.map(m=>m.message_id),authors:s.messages.map(m=>({kind:m.author_kind,agent:m.author_agent_id})),statuses:s.runs.map(r=>({id:r.run_id,status:r.status}))})),uncertainSend:{userMessages:uncertain.length,runs:new Set(uncertain.map(m=>m.run_id)).size},interruptedStatus:writer.runs.find(r=>r.run_id===interrupted.run_id).status,writerContainsResearcherPrompt:writer.messages.some(m=>m.content==='Bantu saya menyusun laporan riset.'),viewport:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth}};
 if(result.uncertainSend.userMessages!==1 || result.uncertainSend.runs!==1 || result.interruptedStatus!=='cancelled' || result.writerContainsResearcherPrompt || result.dmCount!==2) throw Error(JSON.stringify(result));
 return result;
})()
