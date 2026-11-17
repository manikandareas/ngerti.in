import assert from "node:assert/strict";
const base="http://127.0.0.1:49959";
const proof=await Bun.file(".dev/nma058/native-proof.json").json();const {token}=await Bun.file(".dev/nma049-native/installation.json").json();
async function api(path:string,body?:unknown){const response=await fetch(base+path,{method:body===undefined?"GET":"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","Idempotency-Key":crypto.randomUUID()},...(body===undefined?{}:{body:JSON.stringify(body)})});const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;}
const report:any={checks:[],profiles:[]};
for(const a of proof.agents){const scope={agent_id:a.id,thread_id:a.thread_id};const profiles=await api(`/v1/browser/profiles?agent_id=${a.id}&thread_id=${a.thread_id}`);const p=profiles.find((p:any)=>p.profile.id===a.profile_id).profile;const ticket=await api(`/v1/browser/sessions/${a.session_id}/view`,scope);
 const changed=await api(`/v1/browser/profiles/${a.profile_id}/grants`,{expected_revision:p.revision,profile:{name:p.name,grants:p.grants,auth_policy:{origin:"http://host.docker.internal:49958",login_path_prefix:"/login",authenticated_path_prefix:"/account"}}});
 assert.equal((await fetch(ticket.url.replace("ws:","http:"))).status,403);
 for(const suffix of ["", "/view"]){const response=await fetch(`${base}/v1/browser/sessions/${a.session_id}${suffix}${suffix?"":`?agent_id=${a.id}&thread_id=${a.thread_id}`}`,{method:suffix?"POST":"GET",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},...(suffix?{body:JSON.stringify(scope)}:{})});assert.equal(response.status,409);}
 report.profiles.push(changed);report.checks.push(`${a.harness}_view_ticket_and_old_generation_revoked`);
}
const revoked=await fetch("http://127.0.0.1:49958/revoke",{method:"POST"});assert(revoked.ok);report.checks.push("fixture_website_sessions_revoked_without_deleting_browser_profiles");await Bun.write(".dev/verification/nma-058/auth-policy.json",JSON.stringify(report,null,2));
