import assert from "node:assert/strict";
const {token}=await Bun.file(".dev/nma049-native/installation.json").json();
const cohort=await Bun.file(".dev/nma060-gate-proof.json").json();
const file=".dev/nma060-cancel-proof.json";
const proof:any=await Bun.file(file).exists()?await Bun.file(file).json():{lanes:{}};
const save=()=>Bun.write(file,JSON.stringify(proof,null,2));
async function api(path:string,body?:unknown,key=crypto.randomUUID()) {
 const r=await fetch(`http://127.0.0.1:49959${path}`,{method:body===undefined?"GET":"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","Idempotency-Key":key},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();assert.equal(r.status,200,`${path}: ${v.error?.code}`);return v;
}
try {
 for(const family of ["codex","muse"]){
  const reference=cohort.lanes[family].receipt.agent;
  let lane=proof.lanes[family];
  if(!lane){lane=proof.lanes[family]={key:crypto.randomUUID()};await save();
   lane.agent=await api("/v1/agents",{name:`Cancellation proof ${family}`,handle:`cancel_${crypto.randomUUID().slice(0,8)}`,harness:family,connection_id:reference.connection_id,model_id:reference.model_id,reasoning:"medium",instructions:"This is a one-time cancellation verification. Do not create goals or Routines or call external applications."});
   lane.thread=await api(`/v1/agents/${lane.agent.id}/dm`,{});await save();
  }
  const text=family==="codex"?"Run the harmless command sleep 30 once in the assigned workspace, wait for it, then say finished. Do not change files or use external services.":"Use the native request_user_input tool to ask whether to calculate 2+3 or 4+5. Wait for the answer before calculating. Do not answer in prose instead of asking the native question.";
  lane.receipt??=await api("/v1/runs",{agent_id:lane.agent.id,thread_id:lane.thread.id,text},lane.key);await save();
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
   lane.run=await api(`/v1/entities/run/${lane.receipt.run.id}`);
   if(lane.run.native_run_id && !lane.cancel){
    await Bun.sleep(1500);lane.cancel=await api(`/v1/runs/${lane.run.id}/cancel`,{});await save();
   }
   if(["succeeded","failed","cancelled","unknown"].includes(lane.run.status))break;
   await Bun.sleep(250);
  }
  assert.equal(lane.run.status,"cancelled");assert.equal(lane.run.cancellation,"confirmed");
  const snapshot=await api(`/v1/threads/${lane.thread.id}/snapshot`);assert.equal(snapshot.goals.length+snapshot.routines.length,0);lane.pass=true;await save();
 }
 proof.pass=true;
}catch(error){proof.error=String(error);process.exitCode=1;}
finally{await save();await Bun.write("docs/verification/nma-060/final-cohort/cancel-native.json",JSON.stringify(proof,null,2));console.log(JSON.stringify({pass:proof.pass??false,error:proof.error??null}));}
