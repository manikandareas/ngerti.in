// Uses an isolated authenticated development account against the real local API.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='docs/verification/nma-045';await mkdir(out,{recursive:true});
const b=await chromium.launch({headless:true});
const c=await b.newContext({storageState:process.env.NMA045_STORAGE_STATE || '/tmp/nma044-state.json',viewport:{width:1440,height:1000}});
const p=await c.newPage();p.setDefaultTimeout(12000);
const results={passed:[],failed:[],limits:['Real local development API and Clerk session; no deployment or manual screen reader audit.']};
async function check(name,fn){try{await fn();results.passed.push(name);console.log('PASS',name);}catch(e){results.failed.push({name,error:String(e)});console.log('FAIL',name,String(e));await p.screenshot({path:`${out}/failure-${results.failed.length}.png`});await p.keyboard.press('Escape');}}
try {
 await p.goto('http://localhost:3000/connections');await p.waitForFunction(()=>window.Clerk?.session);await p.getByRole('heading',{name:'Connect your AI provider'}).waitFor();await p.getByRole('button',{name:'Add another provider'}).waitFor();await p.waitForTimeout(1000);
 await writeFile(`${out}/inventory.json`,JSON.stringify(await p.evaluate(async()=>{const token=await window.Clerk.session.getToken();const headers={Authorization:`Bearer ${token}`};const base='http://localhost:8000/api/agent-engine/v1';const [providers,apps]=await Promise.all(['/connections','/apps'].map(path=>fetch(base+path,{headers}).then(r=>r.json())));return {providers:providers.providers,connections:providers.items.map(c=>({provider:c.provider,status:c.status,modelCount:c.models.length})),applications:apps.applications,appConnections:apps.items.map(c=>({application:c.application,status:c.status}))};}),null,2));
 await p.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
 for(const section of ['providers','apps','research','media']){
   if(section!=='providers')await p.goto(`http://localhost:3000/connections#${section}`);
   await p.waitForTimeout(700);
   for(const theme of ['light','dark'])for(const width of [1440,390,320,768])await check(`${section} ${theme} ${width}`,async()=>{
    await p.setViewportSize({width,height:1000});await p.evaluate(theme=>{document.documentElement.dataset.theme=theme;localStorage.setItem('ngertiin-theme',theme)},theme);await p.waitForTimeout(180);
    assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const a=await p.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));});assert.deepEqual(a,[]);
    await p.screenshot({path:`${out}/${section}-${theme}-${width}.png`});
   });
 }
 await p.setViewportSize({width:1440,height:1000});await p.goto('http://localhost:3000/connections');
 await check('Provider dialog includes presets and all existing provider methods',async()=>{
  await p.getByRole('button',{name:'Connect OpenAI',exact:true}).click();const d=p.getByRole('dialog');await d.waitFor();assert.equal(await d.getByLabel('Endpoint API').inputValue(),'https://api.openai.com/v1');assert.equal(await d.locator('input[type=password]').count(),1);assert(await d.getByRole('button',{name:'Simpan API key'}).isDisabled());await p.keyboard.press('Escape');await p.waitForTimeout(180);assert(await p.getByRole('button',{name:'Connect OpenAI',exact:true}).evaluate(el=>el===document.activeElement));
  await p.getByRole('button',{name:'Add another provider'}).click();await d.getByRole('combobox',{name:'Provider',exact:true}).selectOption('custom');await d.getByLabel('Protokol').selectOption('anthropic_messages');await p.keyboard.press('Escape');
 });
 await p.goto('http://localhost:3000/connections#apps');
 await check('Search, empty state and app setup preserve managed app controls',async()=>{
  const search=p.getByRole('textbox',{name:'Search connections'});await search.fill('no-match-nma045');await p.getByText('Tidak ada aplikasi yang cocok.').waitFor();await search.fill('');await p.getByRole('button',{name:'Add',exact:true}).click();const d=p.getByRole('dialog');await d.waitFor();await d.getByRole('combobox',{name:'Aplikasi',exact:true}).selectOption('google-workspace');await d.getByText('Pengaturan koneksi tambahan',{exact:true}).click();await p.screenshot({path:`${out}/google-setup.png`});await p.keyboard.press('Escape');
 });
 await p.setViewportSize({width:390,height:844});
 await check('Mobile Settings keyboard trap and focus return',async()=>{const t=p.getByRole('button',{name:'Buka Settings'});await t.click();const d=p.getByRole('dialog');await d.waitFor();for(let i=0;i<8;i++){await p.keyboard.press('Tab');assert(await d.evaluate(el=>el.contains(document.activeElement)));}await p.keyboard.press('Escape');await p.waitForTimeout(200);assert(await t.evaluate(el=>el===document.activeElement));});
}finally{await writeFile(`${out}/browser-results.json`,JSON.stringify(results,null,2)+'\n');await b.close();}
if(results.failed.length)process.exitCode=1;
