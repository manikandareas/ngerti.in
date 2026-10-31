import assert from "node:assert/strict";
import { unlinkSync } from "node:fs";
import { join,resolve } from "node:path";
const base="http://127.0.0.1:49959",root=resolve(".dev/nma049-native"),mode=process.argv[2]??"verify";
const {token}=await Bun.file(join(root,"installation.json")).json(),proof=await Bun.file(".dev/nma058/native-proof.json").json();
async function api(path:string,body?:unknown,key=crypto.randomUUID()) {const response=await fetch(base+path,{method:body===undefined?"GET":"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","Idempotency-Key":key},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json();assert.equal(response.status,200,`${path}: ${value.error?.code}`);return value;}
const report:any={mode,started_at:new Date().toISOString(),checks:[],runs:[],actions:[]};
try {
 const allActions=await api("/v1/entities/browser_action");
 for(const a of proof.agents) {
  const scope={agent_id:a.id,thread_id:a.thread_id},snap=await api(`/v1/threads/${a.thread_id}/snapshot`);
  for(const phase of ["start","resume","expiry"]) {
   const original=proof.runs[`${phase}:${a.harness}`];assert(original);
   const run=snap.runs.find((r:any)=>r.id===original.run_id);assert.equal(run.status,"succeeded");
   const actions=allActions.filter((r:any)=>r.run_id===run.id);assert(actions.length>0);assert(actions.every((r:any)=>r.state==="succeeded"));
   if(phase==="resume")assert(!actions.some((r:any)=>["browser_type","browser_click"].includes(r.tool)));
   report.runs.push({phase,harness:a.harness,run_id:run.id,status:run.status,admission_to_settlement_ms:Date.parse(run.updated_at)-Date.parse(run.created_at),actions:actions.length,native_binding_id:run.binding_id});
   report.actions.push(...actions);
  }
  if(mode==="verify") {
   const before=snap.cursor;
   for(const phase of ["start","resume","expiry"]) {const original=proof.runs[`${phase}:${a.harness}`];const receipt=await api("/v1/runs",{...scope,text:original.prompt},original.command_id);assert.equal(receipt.run.id,original.run_id);}
   const after=await api(`/v1/threads/${a.thread_id}/snapshot`);assert.equal(after.cursor,before);assert.equal(after.runs.length,snap.runs.length);
   const own=await api(`/v1/browser/profiles?agent_id=${a.id}&thread_id=${a.thread_id}`);const session=own.find((p:any)=>p.profile.id===a.profile_id).sessions.find((s:any)=>s.state==="ready");assert(session);a.session_id=session.id;
   const other=proof.agents.find((p:any)=>p.id!==a.id);
   for(const suffix of ["", "/view"]){const r=await fetch(`${base}/v1/browser/sessions/${session.id}${suffix}${suffix?"":`?agent_id=${other.id}&thread_id=${other.thread_id}`}`,{method:suffix?"POST":"GET",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},...(suffix?{body:JSON.stringify({agent_id:other.id,thread_id:other.thread_id})}:{})});assert.equal(r.status,403);}
   report.checks.push(`${a.harness}_original_http_receipts_replayed_without_events_or_inference`,`${a.harness}_foreign_browser_and_view_denied`);
  } else if(mode==="cleanup") {
   assert(snap.runs.every((r:any)=>r.status==="succeeded"));assert.equal(snap.goals.filter((g:any)=>g.state==="active").length,0);assert.equal(snap.routines.filter((r:any)=>r.state==="active").length,0);
   const profiles=await api(`/v1/browser/profiles?agent_id=${a.id}&thread_id=${a.thread_id}`);const current=profiles.find((p:any)=>p.profile.id===a.profile_id).profile;
   const session=await api(`/v1/browser/profiles/${a.profile_id}/open`,scope);
   await api(`/v1/browser/sessions/${session.id}/control`,{...scope,operation:"close"});
   await api(`/v1/browser/profiles/${a.profile_id}/grants`,{expected_revision:current.revision+1,profile:{name:current.name,grants:[{...scope,actions:false}],auth_policy:current.auth_policy}});
   report.checks.push(`${a.harness}_browser_stopped_profile_retained_and_action_grant_removed`);
  }
 }
 if(mode==="cleanup") {await api(`/v1/connections/${proof.muse_connection}/revoke`,{});unlinkSync(join(root,"credentials",proof.credential_copy));report.checks.push("only_task_owned_muse_credential_copy_removed");}
 const sorted=report.actions.map((a:any)=>a.elapsed_ms).sort((a:number,b:number)=>a-b);report.action_latency_ms={count:sorted.length,min:sorted[0],p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))],max:sorted.at(-1)};
 report.native_runs=report.runs.length;report.succeeded=report.runs.filter((r:any)=>r.status==="succeeded").length;report.failed=0;report.unknown=0;
} catch(error){report.error=String(error);process.exitCode=1;}
finally {await Bun.write(".dev/nma058/native-proof.json",JSON.stringify(proof,null,2));await Bun.write(`docs/verification/nma-058/receipts-${mode}.json`,JSON.stringify(report,null,2));}
