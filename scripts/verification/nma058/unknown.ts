import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Store } from "../../../apps/server/src/store";
import { Lifecycle } from "../../../apps/server/src/lifecycle";
import { Connections } from "../../../apps/server/src/harness/connections";
import { ProductTools } from "../../../apps/server/src/harness/tools";
import { DockerBrowserHost, type BrowserHost } from "../../../apps/server/src/browser/host";
import type { Entity } from "../../../apps/server/src/contracts";

const root=resolve(".dev/nma058/unknown-proof");
mkdirSync(root,{recursive:true,mode:0o700});
assert(!await Bun.file(`${root}/proof.json`).exists(),"This one-shot proof must not replay an unknown action.");
const owner=crypto.randomUUID();let store=new Store(`${root}/state.sqlite`,owner),lifecycle=new Lifecycle(store);
const host=new DockerBrowserHost(root,owner);let clicks=0;
const wrapper:BrowserHost={
 connect:(id,authorize)=>host.connect(id,authorize),detach:id=>host.detach(id),close:(id,authorize)=>host.close(id,authorize),reset:(id,authorize)=>host.reset(id,authorize),vncPort:id=>host.vncPort(id),
 async call(id,name,args){const result=await host.call(id,name,args);if(name==="browser_click"){clicks++;throw new Error("Injected lost acknowledgement after the native click");}return result;}
};
let tools=new ProductTools(lifecycle,undefined,wrapper);
const report:any={started_at:new Date().toISOString(),checks:[],fault:"Injected acknowledgement loss after a real native browser click; not a provider crash"};
let profile:any;
try {
 const connections=new Connections(lifecycle),c=connections.create({harness:"codex",authentication:{method:"native_login",billing_source:"subscription"}});connections.update(c,{capabilities:{...c.capabilities,product_tools:"supported"}});
 const agent=lifecycle.createAgent({name:"Unknown browser probe",harness:"codex",connection_id:c.id});const thread=lifecycle.create("thread",{type:"dm",member_agent_ids:[agent.id]});const scope={agent_id:agent.id,thread_id:thread.id};
 profile=tools.browsers.create({name:"Acknowledgement probe",grants:[{...scope,actions:true}]});
 lifecycle.bind(thread.id,agent.id,"protocol-fixture-session");lifecycle.admit({...scope,text:"Local acknowledgement-loss fixture"});const run=lifecycle.claimNext(thread.id,agent.id) as Entity<"run">,lease=tools.issue(run);
 const session=await tools.browsers.open(profile.id,scope);
 const call=(tool:string,args:unknown,fields:any={})=>tools.call(lease.token,lease.scope,"ngertiin.browser_action",{command_id:crypto.randomUUID(),session_id:session.id,generation:session.generation,tool,arguments:args,...fields}) as Promise<any>;
 await call("browser_navigate",{url:"http://host.docker.internal:49958/second"});
 async function state(){const result=await call("browser_get_state",{});return {state:JSON.parse(result.content[0].text),snapshot:JSON.parse(result.content.at(-1).text)};}
 const first=await state();const input=first.state.interactive_elements.find((e:any)=>e.placeholder==="Persistent note");assert(input);
 await call("browser_type",{index:input.index,text:"unknown-receipt-84012"},first.snapshot);
 const second=await state();const button=second.state.interactive_elements.find((e:any)=>e.text==="Save note");assert(button);
 await assert.rejects(call("browser_click",{index:button.index},second.snapshot),/BROWSER_UNKNOWN/);
 report.before=store.list("browser_action");assert.equal(report.before.filter((a:any)=>a.state==="unknown").length,1);
 store.close();store=new Store(`${root}/state.sqlite`,owner);lifecycle=new Lifecycle(store);tools=new ProductTools(lifecycle,undefined,wrapper);
 const observation=await tools.browsers.observe(session.id,scope);const observed=JSON.parse((observation.content.find((c:any)=>c.type==="text") as any).text);
 assert(observed.interactive_elements.some((e:any)=>e.text==="Saved note: unknown-receipt-84012"));
 await assert.rejects(tools.browsers.open(profile.id,scope),/RECONCILIATION_REQUIRED/);
 const after=tools.browsers.receipts(session.id,scope);assert.equal(after.filter(a=>a.state==="unknown").length,1);assert.equal(clicks,1);
 report.after=after;report.effect_dispatches=clicks;report.run=lifecycle.store.get("run",run.id);report.observed_saved_note=true;
 report.checks.push("real_effect_completed_ack_lost","unknown_receipt_persisted","same_profile_observed_after_reconnect","no_second_click_after_restart");
 await Bun.write(`${root}/proof.json`,JSON.stringify({owner,profile_id:profile.id,run_id:run.id,session_id:session.id}));
} catch(error){report.error=String(error);process.exitCode=1;}
finally{if(profile)await host.close(profile.id);await tools.browsers.shutdown();store.close();await Bun.write("docs/verification/nma-058/unknown-browser.json",JSON.stringify(report,null,2));}
