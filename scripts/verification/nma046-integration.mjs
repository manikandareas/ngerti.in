// Real authenticated message lifecycle; uses a disposable QA account only.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const out='docs/verification/nma-046';
const b=await chromium.launch();const c=await b.newContext({storageState:process.env.NMA046_STORAGE_STATE||'/tmp/nma044-state.json',viewport:{width:1440,height:1000}});const p=await c.newPage();p.setDefaultTimeout(25000);
const result={passed:[],failed:[],limits:['Real local API and configured provider on isolated QA account. No external tools requested. No production deployment.']};
async function check(name,fn){try{await fn();result.passed.push(name);console.log('PASS',name)}catch(e){result.failed.push({name,error:String(e)});console.log('FAIL',name,String(e));await p.screenshot({path:`${out}/integration-failure-${result.failed.length}.png`})}}
try{
 await p.goto('http://localhost:3000');await p.getByRole('textbox',{name:/Pesan untuk/}).waitFor({timeout:45000});
 const url=p.url();const thread=url.split('/').at(-1);
 const snapshot=()=>p.evaluate(async thread=>{const token=await window.Clerk.session.getToken();return (await(await fetch(`http://localhost:8000/api/agent-engine/v1/threads/${thread}/snapshot`,{headers:{Authorization:`Bearer ${token}`}})).json())},thread);
 const second=await c.newPage();await second.goto(url);await second.getByRole('textbox',{name:/Pesan untuk/}).waitFor();
 let marker;
 await check('Real send, streamed reply and two-tab convergence without duplicate publication',async()=>{
  marker=process.env.NMA046_REUSE_MARKER||`NMA046-${Date.now()}`;const input=p.getByRole('textbox',{name:/Pesan untuk/});if(!process.env.NMA046_REUSE_MARKER){await input.fill(`${marker}: Jawab tepat satu kata SIAP. Jangan gunakan alat, buat goal, jadwal, atau tindakan eksternal.`);await p.getByRole('button',{name:'Kirim pesan',exact:true}).click();}
  const until=Date.now()+90000;let final;
  while(Date.now()<until){
    const state=await snapshot();const sent=state.messages.find(m=>m.author_kind==='user'&&m.content.includes(marker));const run=sent?.run_id&&state.runs.find(r=>r.run_id===sent.run_id);
    if(run&&!['queued','running','recovering'].includes(run.status)){
      assert.equal(run.status,'succeeded',`Run ended with ${run.status}: ${run.error_code}`);
      if(state.messages.some(m=>m.author_kind==='agent'&&m.run_id===run.run_id)){final=state;break;}
    }
    await p.waitForTimeout(500);
  }
  assert(final,'Provider did not publish a completed reply');
  await second.locator("article").getByText(new RegExp(marker)).waitFor();const s=final;const sent=s.messages.filter(m=>m.author_kind==='user'&&m.content.includes(marker));assert.equal(sent.length,1,'One user publication');assert.equal(s.messages.filter(m=>m.author_kind==='agent'&&m.run_id===sent[0].run_id).length,1,'One agent publication');await p.screenshot({path:`${out}/real-message.png`});
 });
 await check('Refresh preserves message identities, private route and read state',async()=>{
  const before=await snapshot();await p.reload();await p.getByRole('textbox',{name:/Pesan untuk/}).waitFor();const after=await snapshot();assert.deepEqual(after.messages.map(m=>m.message_id),before.messages.map(m=>m.message_id));assert.equal(p.url(),url);assert.equal(after.messages.filter(m=>m.author_kind==='user'&&m.content.includes(marker)).length,1);
 });
 await check('Offline disables send, exposes reconnect and keeps draft until recovery',async()=>{
  const input=p.getByRole('textbox',{name:/Pesan untuk/});await input.fill('NMA046 unsent offline draft');await c.setOffline(true);await p.getByText(/Menyambungkan kembali|Koneksi terputus/).waitFor({timeout:30000});assert(await p.getByRole('button',{name:'Kirim pesan',exact:true}).isDisabled());assert.equal(await input.inputValue(),'NMA046 unsent offline draft');await p.screenshot({path:`${out}/offline-draft.png`});await c.setOffline(false);await p.getByRole('button',{name:'Kirim pesan',exact:true}).waitFor();await p.waitForFunction(()=>!document.querySelector('button[aria-label="Kirim pesan"]')?.disabled,{},{timeout:45000});assert.equal(await input.inputValue(),'NMA046 unsent offline draft');await input.fill('');
 });
 await c.setOffline(false);await second.close();
}finally{await writeFile(`${out}/integration-results.json`,JSON.stringify(result,null,2)+'\n');await b.close()}
if(result.failed.length)process.exitCode=1;
