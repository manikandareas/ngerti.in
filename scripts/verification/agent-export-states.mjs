// Auth pages use the real Clerk UI. Snapshot faults are labelled presentation fixtures.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const out='docs/verification/agent-export-audit/current';const b=await chromium.launch();
const result={passed:[],failed:[],matrix:[],limits:['Snapshot/SSE faults validate presentation only, not runtime or remote provider acceptance. Accessibility semantics are automated; no manual screen reader certification.']};
let p;const axe=await readFile('node_modules/axe-core/axe.min.js','utf8');
async function check(name,fn){try{await fn();result.passed.push(name);console.log('PASS',name)}catch(error){result.failed.push({name,error:String(error)});console.log('FAIL',name,String(error));await p.screenshot({path:`${out}/states-failure-${result.failed.length}.png`})}}
async function matrix(name){if(process.env.NMA046_STATE_FILTER&&name!==process.env.NMA046_STATE_FILTER)return;for(const theme of ['light','dark'])for(const width of [1440,390,320,768])await check(`${name} ${theme} ${width}`,async()=>{
 await p.setViewportSize({width,height:900});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.waitForTimeout(350);await p.addScriptTag({content:axe});const a=await p.evaluate(async()=>{const r=await axe.run({runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return {overflow:document.documentElement.scrollWidth>innerWidth,violations:r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))}});result.matrix.push({name,theme,width,...a});assert(!a.overflow);assert.deepEqual(a.violations,[]);await p.screenshot({path:`${out}/${name}-${theme}-${width}.png`});
})}
try{
 const anon=await b.newContext();p=await anon.newPage();p.setDefaultTimeout(20000);
 for(const mode of ['sign-in','sign-up']){await p.goto(`http://localhost:3000/${mode}`);await p.getByRole('heading',{name:mode==='sign-in'?'Selamat datang kembali':'Mulai bersama Tobi',exact:true}).waitFor();await p.locator('.cl-rootBox').waitFor();await matrix(mode);await writeFile(`${out}/${mode}-accessibility-tree.txt`,await p.locator('main').ariaSnapshot());}
 await anon.close();
 const c=await b.newContext({storageState:process.env.NMA046_STORAGE_STATE||'/tmp/nma044-state.json'});p=await c.newPage();p.setDefaultTimeout(20000);await p.goto('http://localhost:3000');await p.getByRole('textbox',{name:/Pesan untuk/}).waitFor({timeout:45000});const url=p.url();const source=await p.evaluate(async()=>{const token=await window.Clerk.session.getToken();return(await(await fetch(`http://localhost:8000/api/agent-engine/v1/threads/${location.pathname.split('/').at(-1)}/snapshot`,{headers:{Authorization:`Bearer ${token}`}})).json())});
 await p.route('**/api/agent-engine/v1/events?*',r=>r.fulfill({contentType:'text/event-stream',body:': presentation fixture\n\n'}));
 // Prevent presentation fixtures from changing persisted state.
 await p.route('**/api/agent-engine/v1/commands',r=>r.fulfill({json:{fixture:true}}));
 let fixture=structuredClone(source);fixture.messages=[];fixture.runs=[];fixture.goals=[];fixture.artifacts=[];fixture.delegations=[];fixture.collaboration_tasks=[];fixture.next_before_message_seq=null;
 await p.route('**/api/agent-engine/v1/threads/*/snapshot*',r=>r.fulfill({json:fixture}));await p.reload();await p.getByRole('heading',{name:/Mulai percakapan dengan/}).waitFor();await matrix('fixture-empty');
 fixture.thread.title='Nama percakapan sangat panjang '.repeat(12);fixture.thread.agents[0].display_name='AgentDenganNamaSangatPanjangTanpaSpasi'.repeat(6);fixture.messages=[{message_id:'nma046-long',message_seq:'1',run_id:'long',author_kind:'agent',author_agent_id:fixture.thread.agents[0].agent_id,content:'# Catatan panjang\n\n'+('LongUnbrokenIdentifier'.repeat(50))+'\n\n```ts\n'+('const x = 123; '.repeat(50))+'\n```'}];await p.reload();await p.locator('#message-nma046-long').waitFor();await matrix('fixture-long');
 await writeFile(`${out}/conversation-accessibility-tree.txt`,await p.locator('main').ariaSnapshot());
 await p.unroute('**/api/agent-engine/v1/threads/*/snapshot*');await p.route('**/api/agent-engine/v1/threads/*/snapshot*',r=>r.fulfill({status:403,json:{detail:'Forbidden'}}));await p.reload();await p.getByRole('alert').filter({hasText:'Percakapan belum dapat dimuat'}).waitFor();await matrix('fixture-permission');
 await p.unroute('**/api/agent-engine/v1/threads/*/snapshot*');let release;const gate=new Promise(resolve=>release=resolve);await p.route('**/api/agent-engine/v1/threads/*/snapshot*',async r=>{await gate;await r.fulfill({json:source})});await p.goto(url);await p.getByText('Memuat riwayat…',{exact:true}).waitFor();await matrix('fixture-loading');release();await c.close();
}finally{await writeFile(`${out}/${process.env.NMA046_RESULT || "states-results.json"}`,JSON.stringify(result,null,2)+'\n');await b.close()}
if(result.failed.length)process.exitCode=1;
