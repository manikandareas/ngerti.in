// Real authenticated product UI. Use an isolated development account.
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='docs/verification/nma-044';await mkdir(out,{recursive:true});
const b=await chromium.launch({headless:true});const c=await b.newContext({storageState:process.env.NMA044_STORAGE_STATE||'/tmp/nma044-state.json',viewport:{width:1440,height:1000}});const p=await c.newPage();p.setDefaultTimeout(15000);
const results={passed:[],failed:[],limits:['Development account, real API; no deployment or manual screen-reader audit.']};
async function check(name,fn){try{await fn();results.passed.push(name);console.log('PASS',name);}catch(e){results.failed.push({name,error:String(e)});console.log('FAIL',name,String(e));await p.screenshot({path:`${out}/failure-${results.failed.length}.png`});await p.keyboard.press('Escape');}}
await p.goto('http://localhost:3000');await p.waitForURL('**/conversations/**');await p.getByRole('button',{name:'Workspace',exact:true}).waitFor();
for(const name of ['Memori dan skills','Workspace','Layar dan bantuan login'])await check(`${name} keyboard and responsive matrix`,async()=>{
 const trigger=p.getByRole('button',{name,exact:true});await trigger.click();const dialog=p.getByRole('dialog');await dialog.waitFor();
 if(name==='Workspace'){await p.getByRole('button',{name:'Periksa workspace'}).click();await p.waitForTimeout(1500);}
 for(const theme of ['light','dark'])for(const width of [1440,390,320,768]){
 await p.setViewportSize({width,height:1000});await p.evaluate(theme=>{document.documentElement.dataset.theme=theme;localStorage.setItem('ngertiin-theme',theme)},theme);await p.waitForTimeout(180);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await p.screenshot({path:`${out}/${name==='Workspace'?'workspace':name.startsWith('Memori')?'memory':'computer'}-${theme}-${width}.png`});
 }
 for(let i=0;i<8;i++){await p.keyboard.press('Tab');assert(await dialog.evaluate(el=>el.contains(document.activeElement)));}await p.keyboard.press('Escape');await p.waitForTimeout(150);assert(await trigger.evaluate(el=>el===document.activeElement));
});
await p.setViewportSize({width:1440,height:1000});
await check('Upload/remove attachment through composer',async()=>{await p.getByLabel('Pilih lampiran').setInputFiles({name:'nma044-note.md',mimeType:'text/markdown',buffer:Buffer.from('# Workspace result\n\nA real uploaded document.\n\n- Verified file bytes\n')});await p.getByRole('button',{name:'nma044-note.md ×',exact:true}).waitFor();await p.getByRole('button',{name:'nma044-note.md ×',exact:true}).click();assert.equal(await p.getByRole('button',{name:'nma044-note.md ×',exact:true}).count(),0);});
await p.getByRole('button',{name:'Opsi percakapan',exact:true}).click();
await check('Preview uploaded markdown and download exact bytes',async()=>{await p.getByRole('button',{name:'Pratinjau nma044-note.md',exact:true}).click();await p.getByRole('heading',{name:'Workspace result',exact:true}).waitFor();await p.screenshot({path:`${out}/markdown-preview.png`});await p.getByRole('button',{name:'Tutup pratinjau',exact:true}).click();const waiting=p.waitForEvent('download');await p.getByRole('button',{name:'Unduh nma044-note.md',exact:true}).click();const download=await waiting;assert.match(await readFile(await download.path(),'utf8'),/Verified file bytes/);});
console.log('RESOURCE STATE',await p.evaluate(async()=>{const token=await window.Clerk.session.getToken();const r=await fetch('http://localhost:8000/api/agent-engine/v1/agents',{headers:{Authorization:`Bearer ${token}`}});return (await r.json()).items.map(a=>({id:a.agent_id,name:a.display_name,config:a.config}));}));
await writeFile(`${out}/browser-results.json`,JSON.stringify(results,null,2));await b.close();if(results.failed.length)process.exitCode=1;
