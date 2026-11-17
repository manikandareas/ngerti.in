import { captureRfb } from "./rfb";
const {token} = await Bun.file(".dev/nma049-native/installation.json").json();
const p = await Bun.file(".dev/nma060-browser-proof.json").json();
const a = p.agents[Number(process.argv[2] ?? 0)];
const r = await fetch(`http://127.0.0.1:49959/v1/browser/sessions/${a.session_id}/view`, {method:"POST", headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({agent_id:a.id,thread_id:a.thread_id})});
const v=await r.json();if(r.status!==200)throw Error(String(r.status));
try {const frame=await captureRfb(v.url);await Bun.write(`.dev/verification/nma-060/final-cohort/view-probe-${a.harness}.png`,frame.png);console.log({width:frame.width,height:frame.height});}catch(e){console.log(String(e));process.exitCode=1;}
