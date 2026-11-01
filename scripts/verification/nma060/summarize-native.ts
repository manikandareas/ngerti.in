import assert from "node:assert/strict";
const {token}=await Bun.file(".dev/nma049-native/installation.json").json();
const headers={Authorization:`Bearer ${token}`};
async function get(path:string){const r=await fetch(`http://127.0.0.1:49959${path}`,{headers});assert.equal(r.status,200);return r.json();}
const gate=await Bun.file(".dev/nma060-gate-proof.json").json();
const goals=await Bun.file(".dev/nma060-goals-proof.json").json();
const browser=await Bun.file(".dev/nma060-browser-proof.json").json();
const cancellation=await Bun.file(".dev/nma060-cancel-proof.json").json();
const modalities=await Bun.file(".dev/nma060-modalities-final-proof.json").json();
const agentIds=new Set([
 ...Object.values(gate.lanes).map((a:any)=>a.receipt.agent.id),
 ...goals.agents.map((a:any)=>a.id),...browser.agents.map((a:any)=>a.id),
 ...Object.values(cancellation.lanes).map((a:any)=>a.agent.id),modalities.agent.id,
]);
const all=await get("/v1/entities/run");
const selected=all.filter((r:any)=>agentIds.has(r.agent_id));
const native=selected.filter((r:any)=>r.native_run_id!==null);
assert(native.every((r:any)=>r.status==="succeeded"||(r.status==="cancelled"&&r.cancellation==="confirmed")));
const rejected=selected.filter((r:any)=>r.native_run_id===null);
assert.equal(rejected.length,1);assert.equal(rejected[0].diagnostic.code,"CAPABILITY_UNSUPPORTED");
const tasks=await get("/v1/entities/goal"),routines=await get("/v1/entities/routine");
assert(!tasks.some((g:any)=>agentIds.has(g.agent_id)&&g.state==="active"));
assert(!routines.some((r:any)=>agentIds.has(r.agent_id)&&r.state==="active"));
const old=await Bun.file(".dev/nma060-modalities-proof.json").json();
const setup=all.find((r:any)=>r.id===old.runs.application.run_id);
assert.equal(setup.status,"cancelled");
const summary={native_runs:native.length,succeeded:native.filter((r:any)=>r.status==="succeeded").length,cancelled_confirmed:native.filter((r:any)=>r.status==="cancelled").length,failed:0,unknown:0,unsupported_rejected_before_dispatch:rejected,retained_failed_setup:setup,runs:native.map((r:any)=>({id:r.id,agent_id:r.agent_id,status:r.status,cancellation:r.cancellation,diagnostic:r.diagnostic,native_run_id:r.native_run_id,product_tools:r.product_tools})),goals_stopped_or_completed:true,routines_inactive:true};
await Bun.write("docs/verification/nma-060/final-cohort/native-summary.json",JSON.stringify(summary,null,2));console.log({native:summary.native_runs,succeeded:summary.succeeded,cancelled:summary.cancelled_confirmed,rejected_before_dispatch:1});
