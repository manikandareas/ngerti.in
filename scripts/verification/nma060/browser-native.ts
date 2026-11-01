import assert from "node:assert/strict";
import { Database } from "bun:sqlite";
import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { captureRfb } from "./rfb";

const base="http://127.0.0.1:49959",directory=resolve(".dev/nma049-native"),phase=process.argv[2];
const proofPath=resolve(".dev/nma060-browser-proof.json"),out=`docs/verification/nma-060/final-cohort/browser-${phase}.json`;
const proof:any=await Bun.file(proofPath).exists()?await Bun.file(proofPath).json():{agents:[],runs:{}};
const {token}=await Bun.file(join(directory,"installation.json")).json();
const report:any={phase,started_at:new Date().toISOString(),checks:[],observations:{}};
const save=async()=>{await Bun.write(proofPath,JSON.stringify(proof,null,2));await Bun.write(out,JSON.stringify(report,null,2));};
async function api(path:string,body?:unknown,key=crypto.randomUUID()) {
 const response=await fetch(base+path,{method:body===undefined?"GET":"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","Idempotency-Key":key},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const value=await response.json();assert.equal(response.status,200,`${path}: ${value.error?.code}`);return value;
}
async function approvals(run:any,a:any) {
 if(a.harness!=="muse"||run.status!=="running")return;
 const r=await fetch(`${base}/v1/runs/${run.id}/interactions`,{headers:{Authorization:`Bearer ${token}`}});if(r.status===409)return;assert.equal(r.status,200);
 const pending=await r.json();for(const p of pending.approvals??[]) {const response=await fetch(`${base}/v1/runs/${run.id}/interactions`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({type:"approval",request_id:p.approvalId,source_index:p.currentRequirementId.sourceIndex,choice_id:"allow_once"})});if(response.status===409)continue;assert.equal(response.status,200);report.approvals??=[];report.approvals.push({run_id:run.id,approval_id:p.approvalId});}
}
async function wait(a:any,runId:string) {
 const started=performance.now();
 while(performance.now()-started<600000) {
  const snap=await api(`/v1/threads/${a.thread_id}/snapshot`),run=snap.runs.find((r:any)=>r.id===runId);
  report.observations[a.harness]=snap;await save();
  if(["succeeded","failed","cancelled","unknown"].includes(run.status)){report[`${a.harness}_task_ms`]=performance.now()-started;return snap;}
  await approvals(run,a);await Bun.sleep(1000);
 }throw new Error("Native task deadline");
}
const url="http://host.docker.internal:49958";
try {
 if(phase==="provision") {
  assert.equal(proof.agents.length,0);
  const agents=await api("/v1/entities/agent"),connections=await api("/v1/entities/connection");
  const codex=agents.find((a:any)=>a.harness==="codex"&&a.model_id&&connections.some((c:any)=>c.id===a.connection_id&&c.state==="active"&&c.authentication.method==="native_login"));assert(codex);
  const cohort = await Bun.file(".dev/nma060-gate-proof.json").json();
  const muse = cohort.connection; proof.muse_connection=muse.id;await save();
  for(const harness of ["codex","muse"]) {
   const agent=await api("/v1/agents",{name:`Browser proof ${harness}`,handle:`browser_${harness}_${crypto.randomUUID().slice(0,8)}`,harness,connection_id:harness==="codex"?codex.connection_id:muse.id,model_id:harness==="codex"?codex.model_id:"muse-spark-1.3",reasoning:"medium",instructions:"Use only Ngertiin scoped browser product tools for these local browser tests. Do not use native shell/network or another browser. Get exact schemas from ngertiin.describe_tools. Never repeat an unknown browser action using a new command ID. This is a one-time local test, not a persistent goal or Routine."});
   const dm=await api(`/v1/agents/${agent.id}/dm`,{}),scope={agent_id:agent.id,thread_id:dm.id};
   const profile=await api("/v1/browser/profiles",{name:`Browser proof ${harness}`,grants:[{...scope,actions:true}]});
   proof.agents.push({...agent,thread_id:dm.id,profile_id:profile.id});await save();
   report[`${harness}_account`]=await api(`/v1/connections/${agent.connection_id}/inspect`,{});await save();
  }
  assert.equal(report.codex_account.effective_billing_source,"subscription");assert.equal(report.muse_account.effective_billing_source,"api_key");report.checks.push("explicit_billing_selection");
 } else if(phase==="start"||phase==="resume"||phase==="expiry") {
  const selected=process.argv[3]?proof.agents.filter((a:any)=>a.harness===process.argv[3]):proof.agents;
  for(const a of selected) {
   const key=`${phase}:${a.harness}`;
   const prompt=phase==="start" ? `Use the granted Browser proof ${a.harness} browser profile. Navigate to ${url}/login, enter the ordinary proof name '${a.harness}-browser-proof', and submit the LOCAL fixture sign-in form. This is a fake account with no password or real service. On the account page fill the Persistent note field with '${a.harness}-note-84012' and save it. Inspect fresh state before each input. Open the second managed tab with browser_navigate new_tab=true at ${url}/second, then inspect its DOM and take a screenshot. Report the account and saved note you actually observe.` : phase==="resume" ? `After the browser/backend restart, use the SAME Browser proof ${a.harness} profile. Navigate to ${url}/account without signing in or retyping the note. Read the existing account name and saved note from the page, take a screenshot, then open a second managed tab at ${url}/second and verify its state. Do not sign in again or fabricate prior values.` : `The local fixture session has been revoked. Use the same profile, navigate to ${url}/account and inspect state. Report that sign-in is required; do not log in or submit the form.`;
   if(!proof.runs[key]) {proof.runs[key]={command_id:crypto.randomUUID(),prompt};await save();}
   const input=proof.runs[key];const receipt=await api("/v1/runs",{thread_id:a.thread_id,agent_id:a.id,text:input.prompt},input.command_id);input.run_id=receipt.run.id;await save();
   const snap=await wait(a,input.run_id);const run=snap.runs.find((r:any)=>r.id===input.run_id);assert.equal(run.status,"succeeded",`${a.harness} ${run.status}`);
   assert(run.product_tools.includes("ngertiin.browser_action"));
   const profiles=await api(`/v1/browser/profiles?agent_id=${a.id}&thread_id=${a.thread_id}`);const session=profiles.find((p:any)=>p.profile.id===a.profile_id).sessions.find((s:any)=>s.state==="ready");assert(session);a.session_id=session.id;await save();
   report[`${a.harness}_browser_receipts`]=await api(`/v1/browser/sessions/${session.id}/receipts?agent_id=${a.id}&thread_id=${a.thread_id}`);
   const observation=await api(`/v1/browser/sessions/${session.id}?agent_id=${a.id}&thread_id=${a.thread_id}`);
   const state=JSON.parse(observation.content.find((c:any)=>c.type==="text").text);
   const ownReceipts=report[`${a.harness}_browser_receipts`].filter((r:any)=>r.run_id===run.id);
   assert(ownReceipts.length>0 && ownReceipts.every((r:any)=>r.state==="succeeded"));
   if(phase!=="expiry") {
     assert(state.interactive_elements.some((e:any)=>e.text===`Verified account ${a.harness}-browser-proof`));
     assert(state.interactive_elements.some((e:any)=>e.text===`Saved note: ${a.harness}-note-84012`));
     if(phase==="resume") assert(!ownReceipts.some((r:any)=>["browser_type","browser_click"].includes(r.tool)), "Restart proof must not reenter credentials or the note");
   } else { assert.equal(observation.auth,"required"); assert(state.url.endsWith("/login")); }
   report[`${a.harness}_admission_to_settlement_ms`]=Date.parse(run.updated_at)-Date.parse(run.created_at);
   report[`${a.harness}_task_success`]=true;
   for(const c of observation.content)if(c.type==="image"){await Bun.write(`docs/verification/nma-060/final-cohort/${phase}-${a.harness}-dom.png`,Buffer.from(c.data,"base64"));c.data="[retained as adjacent PNG]";}
   report[`${a.harness}_browser_observation`]=observation;
   const view=await api(`/v1/browser/sessions/${session.id}/view`,{agent_id:a.id,thread_id:a.thread_id});const rfb=await captureRfb(view.url);await Bun.write(`docs/verification/nma-060/final-cohort/${phase}-${a.harness}-vnc.png`,rfb.png);report[`${a.harness}_vnc`]={width:rfb.width,height:rfb.height,rectangles:rfb.rectangles,mode:view.mode,session_id:view.session_id,generation:view.generation};
   report.checks.push(`${a.harness}_native_browser_and_rfb`);await save();
  }
 } else if(phase==="close") {
  for(const a of proof.agents){const scope={agent_id:a.id,thread_id:a.thread_id};const profiles=await api(`/v1/browser/profiles?agent_id=${a.id}&thread_id=${a.thread_id}`);const session=profiles.find((p:any)=>p.profile.id===a.profile_id).sessions.find((s:any)=>s.state!=="closed");if(session)await api(`/v1/browser/sessions/${session.id}/control`,{...scope,operation:"close"});}
  report.checks.push("managed_browser_closed_profiles_retained");
 } else throw new Error("Unknown phase");
} catch(error){report.error=String(error);process.exitCode=1;}
finally{await save();}
