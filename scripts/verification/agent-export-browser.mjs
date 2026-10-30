// Integrated redesign acceptance against an isolated authenticated local account.
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const out = 'docs/verification/agent-export-audit/current';
await mkdir(out, {recursive:true});
const browser = await chromium.launch();
const context = await browser.newContext({storageState:process.env.NMA046_STORAGE_STATE || '/tmp/nma044-state.json',viewport:{width:1440,height:1000}});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const axe = await readFile('node_modules/axe-core/axe.min.js','utf8');
const result = {passed:[],failed:[],matrix:[],pageErrors:[],limits:['Real Clerk-authenticated local API. Automated accessibility semantics and keyboard checks; no manual assistive-technology certification or production deployment.']};
page.on('pageerror',error=>result.pageErrors.push(error.message));
async function check(name,fn){try{await fn();result.passed.push(name);console.log('PASS',name);}catch(error){result.failed.push({name,error:String(error)});console.log('FAIL',name,String(error));await page.screenshot({path:`${out}/failure-${result.failed.length}.png`});}}
async function theme(value){await page.evaluate(value=>{document.documentElement.dataset.theme=value;localStorage.setItem('ngertiin-theme',value)},value);await page.waitForTimeout(350);}
async function audit(label,root){
 await page.addScriptTag({content:axe});
 const details=await page.evaluate(async selector=>{
  const target=selector?document.querySelector(selector):document;
  const a=await axe.run(target,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});
  return {overflow:document.documentElement.scrollWidth>innerWidth,violations:a.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))};
 },root);
 result.matrix.push({label,...details});assert(!details.overflow,'Document overflow');assert.deepEqual(details.violations,[]);
 if(root)assert(await page.locator(root).evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Panel overflow');
 await page.screenshot({path:`${out}/${label}.png`});
}
async function matrix(name,root){for(const mode of ['light','dark'])for(const width of [1440,390,320,768])await check(`${name} ${mode} ${width}`,async()=>{await page.setViewportSize({width,height:1000});await theme(mode);await audit(`${name}-${mode}-${width}`,root)});}
async function conversation(){await page.goto('http://localhost:3000');await page.getByRole('textbox',{name:/Pesan untuk/}).waitFor({timeout:45000});await page.waitForTimeout(700);}
async function tools(){const trigger=page.getByRole('button',{name:'Opsi percakapan',exact:true});if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();}
try{
 await conversation();const dm=page.url();
 const threads=await page.evaluate(async()=>{const token=await window.Clerk.session.getToken();return (await(await fetch('http://localhost:8000/api/agent-engine/v1/threads',{headers:{Authorization:`Bearer ${token}`}})).json()).items});
 await writeFile(`${out}/account-inventory.json`,JSON.stringify({threadCount:threads.length,dmCount:threads.filter(t=>t.kind==='dm').length,groupCount:threads.filter(t=>t.kind==='group').length},null,2));
 await matrix('dm');
 await check('Header disclosure preserves all resource actions and keyboard focus',async()=>{
  await page.setViewportSize({width:390,height:844});const trigger=page.getByRole('button',{name:'Opsi percakapan',exact:true});await trigger.focus();await page.keyboard.press('Enter');assert.equal(await trigger.getAttribute('aria-expanded'),'true');
  for(const name of ['Memori dan skills','Workspace','Layar dan bantuan login','Koneksi','Konteks dan file hasil'])await page.getByRole('button',{name,exact:true}).waitFor();
  await page.getByRole('button',{name:/^Goals/}).waitFor();
 });
 for(const [name,slug] of [['Goals','goals'],['Memori dan skills','memory'],['Workspace','workspace'],['Layar dan bantuan login','computer'],['Koneksi','context-connections'],['Konteks dan file hasil','session-artifacts']]){
  await tools();const trigger=page.getByRole('button',{name:name==='Goals'?/^Goals/:name,exact:name!=='Goals'});await trigger.click();await page.getByRole('dialog').waitFor();await page.waitForTimeout(600);await matrix(slug,'[role=dialog]');
  await check(`${slug} keyboard trap and focus return`,async()=>{const dialog=page.getByRole('dialog');for(let i=0;i<8;i++){await page.keyboard.press('Tab');assert(await dialog.evaluate(el=>el.contains(document.activeElement)));}await page.keyboard.press('Escape');await page.waitForTimeout(350);assert(await trigger.evaluate(el=>el===document.activeElement));});
 }
 await page.goto(dm);await page.getByRole('textbox',{name:/Pesan untuk/}).waitFor();
 await check('Draft, multiline, long content and compact composer at 320px',async()=>{
  await page.setViewportSize({width:320,height:640});const input=page.getByRole('textbox',{name:/Pesan untuk/});const draft='NMA046 unsent draft '+Date.now();await input.fill(draft);await page.keyboard.press('Shift+Enter');await input.pressSequentially('Second line');await page.reload();await input.waitFor();assert.equal(await input.inputValue(),draft+'\nSecond line');await input.fill('Long-unbroken-text-'.repeat(80));assert(await input.evaluate(el=>el.getBoundingClientRect().height<=192));await audit('composer-long-320');await input.fill('');assert.equal(await page.getByRole('button',{name:'Kirim pesan',exact:true}).count(),0);
 });
 await check('Mobile navigation keyboard trap, search and focus return',async()=>{
  const trigger=page.getByRole('button',{name:'Buka navigasi'});await trigger.click();const dialog=page.getByRole('dialog');await dialog.waitFor();const search=dialog.getByRole('textbox',{name:'Cari percakapan'});await search.fill('NMA046-no-matching-thread');await dialog.getByText('Tidak ada percakapan yang cocok.').waitFor();await page.waitForTimeout(350);await audit('navigation-empty-320','[role=dialog]');await search.fill('');for(let i=0;i<10;i++){await page.keyboard.press('Tab');assert(await dialog.evaluate(el=>el.contains(document.activeElement)));}await page.keyboard.press('Escape');await page.waitForTimeout(350);assert(await trigger.evaluate(el=>el===document.activeElement));
 });
 const group=threads.find(t=>t.kind==='group');if(group){await page.goto(`http://localhost:3000/conversations/${group.thread_id}`);await page.getByRole('textbox',{name:/Pesan untuk/}).waitFor();await matrix('group');}
 else result.failed.push({name:'Authenticated group route',error:'No isolated QA group available'});
 for(const [path,slug,ready] of [['/agents','agents','Buat percakapan'],['/connections','providers','Connect your AI provider'],['/connections#apps','apps','Connections'],['/connections#research','research',null],['/connections#media','media',null],['/design-system','design-system',null],['/nma046-missing-page','404','Halaman tidak ditemukan']]){
  await page.goto('http://localhost:3000'+path);await page.waitForTimeout(1200);if(ready&&slug!=='agents')await page.getByRole('heading',{name:ready,exact:true}).waitFor();await matrix(slug);
 }
 await check('200 percent browser-equivalent viewport reflow',async()=>{await conversation();await page.setViewportSize({width:720,height:500});await audit('zoom-200-reflow');await page.getByRole('textbox',{name:/Pesan untuk/}).fill('');});
}finally{await writeFile(`${out}/${process.env.NMA046_RESULT || 'browser-results.json'}`,JSON.stringify(result,null,2)+'\n');await browser.close();}
if(result.failed.length||result.pageErrors.length)process.exitCode=1;
