import assert from "node:assert/strict";
const {token}=await Bun.file(".dev/nma049-native/installation.json").json();
const source=await Bun.file(".dev/nma060-cancel-proof.json").json();
const file=".dev/nma060-publication-proof.json";
const proof:any=await Bun.file(file).exists()?await Bun.file(file).json():{lanes:{}};
const save=()=>Bun.write(file,JSON.stringify(proof,null,2));
async function api(path:string,body?:unknown,key=crypto.randomUUID()) {const r=await fetch(`http://127.0.0.1:49959${path}`,{method:body===undefined?"GET":"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","Idempotency-Key":key},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();assert.equal(r.status,200);return v;}
try{
 proof.health=await api("/health/ready");assert.equal(proof.health.api_readiness_gate,"ready");assert.equal(proof.health.contract_version,"1.16.0");
 const contract=await api("/v1/contracts");assert.equal(contract.readiness.state,"ready");
 for(const family of ["codex","muse"]){const a=source.lanes[family];const lane=proof.lanes[family]??={key:crypto.randomUUID()};await save();
  const before=await api(`/v1/threads/${a.thread.id}/snapshot`);
  lane.binding_before??=before.bindings.find((b:any)=>b.active&&b.agent_id===a.agent.id);assert(lane.binding_before);await save();
  lane.receipt??=await api("/v1/runs",{agent_id:a.agent.id,thread_id:a.thread.id,text:"Call ngertiin.read_run_context once to read your current run context, then calculate 2+3 and reply with the result. This is a one-time verification after the earlier cancellation, not a goal or Routine. Do not modify files, profiles, memory or external apps."},lane.key);await save();
  const deadline=Date.now()+180000;let after;
  while(Date.now()<deadline){after=await api(`/v1/threads/${a.thread.id}/snapshot`);lane.run=after.runs.find((r:any)=>r.id===lane.receipt.run.id);if(["succeeded","cancelled","failed","unknown"].includes(lane.run.status))break;await Bun.sleep(500);}
  assert.equal(lane.run.status,"succeeded");assert(lane.run.product_tools.includes("ngertiin.read_run_context"));
  lane.binding_after=after.bindings.find((b:any)=>b.active&&b.agent_id===a.agent.id);assert.equal(lane.binding_after.native_session_id,lane.binding_before.native_session_id);assert.equal(after.goals.length+after.routines.length,0);lane.pass=true;await save();
 }
 proof.pass=true;
}catch(error){proof.error=String(error);process.exitCode=1;}
finally{await save();await Bun.write("docs/verification/nma-060/final-cohort/publication-native.json",JSON.stringify(proof,null,2));console.log({pass:proof.pass??false,error:proof.error??null});}
