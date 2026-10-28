// Requires a real, private Clerk development session; no API mocks.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const output = "docs/verification/nma-042";
await mkdir(output, {recursive:true});
const browser = await chromium.launch({headless:true, executablePath:process.env.NMA042_BROWSER});
const context = await browser.newContext({storageState:process.env.NMA042_STORAGE_STATE});
const page = await context.newPage();
const results = { checks:[], failures:[], limits:["Local development only; no deployment or manual screen-reader audit."] };
async function check(name, fn) {try {await fn();results.checks.push(name);console.log("PASS",name);}catch(e){results.failures.push({name,error:String(e)});console.log("FAIL",name,String(e));await page.keyboard.press("Escape");}}
try {
 await page.goto('http://localhost:3000/');
 await check('New account opens Tobi without mandatory configuration',async()=>{await page.waitForURL('**/conversations/**',{timeout:45000});await page.getByRole('heading',{name:'Tobi',exact:true,level:1}).waitFor();});
 await page.goto('http://localhost:3000/agents');
 await check('Configure Tobi with authenticated Muse catalog',async()=>{
  await page.getByRole('button',{name:'Edit Tobi',exact:true}).click();await page.getByText('Lanjutan · Model dan kemampuan',{exact:true}).click();
  const select=page.locator('#agent-model');const value=await select.locator('option').evaluateAll(options=>options.find(o=>o.textContent.includes('muse-spark-1.3'))?.value);assert(value);await select.selectOption(value);await page.getByRole('button',{name:'Simpan agent',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 });
 await check('Create agent through UI',async()=>{
  await page.getByRole('button',{name:'Buat agent',exact:true}).click();await page.getByLabel('Nama',{exact:true}).fill('Travel QA');await page.getByLabel('Handle',{exact:true}).fill('travel_qa');await page.getByLabel('Karakter (soul)').fill('Help plan trips.');await page.getByText('Lanjutan · Model dan kemampuan',{exact:true}).click();const select=page.locator('#agent-model');const value=await select.locator('option').evaluateAll(options=>options.find(o=>o.textContent.includes('muse-spark-1.3'))?.value);assert(value);await select.selectOption(value);await page.getByRole('button',{name:'Simpan agent',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 });
 await check('Create group in two steps and revoke member',async()=>{
  await page.getByRole('button',{name:'Siapkan percakapan'}).click();await page.getByRole('combobox',{name:'Jenis'}).selectOption('group');await page.getByRole('checkbox').nth(0).check();await page.getByRole('checkbox').nth(1).check();await page.getByRole('button',{name:'Lanjut',exact:true}).click();await page.getByLabel('Nama percakapan').fill('Bandung QA');await page.getByRole('button',{name:'Buat percakapan',exact:true}).click();await page.waitForURL('**/conversations/**');await page.getByRole('button',{name:'Anggota',exact:true}).click();await page.getByRole('button',{name:'Keluarkan',exact:true}).last().click();await page.getByRole('button',{name:/Tambah /}).waitFor();await page.screenshot({path:`${output}/group-members.png`});await page.keyboard.press('Escape');
 });
 for(const route of ['/agents','/']) {
  await page.goto(`http://localhost:3000${route}`);
  await page.waitForTimeout(1500);
  for(const theme of ['light','dark'])for(const width of [1440,390,320,768])await check(`${route} ${theme} ${width}`,async()=>{
   await page.setViewportSize({width,height:900});await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;localStorage.setItem('ngertiin-theme',theme)},theme);await page.waitForTimeout(200);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${output}/${route==='/'?'home':'agents'}-${theme}-${width}.png`,fullPage:true});
  });
 }
 await page.goto('http://localhost:3000/agents');await page.setViewportSize({width:390,height:844});
 await check('Mobile navigation keyboard trap and focus return',async()=>{const trigger=page.getByRole('button',{name:'Buka navigasi'});await trigger.click();const dialog=page.getByRole('dialog');await dialog.waitFor();await page.getByRole('textbox',{name:'Cari percakapan'}).fill('no-match-nma042');await page.getByText('Tidak ada percakapan yang cocok.').waitFor();for(let i=0;i<8;i++){await page.keyboard.press('Tab');assert(await dialog.evaluate(el=>el.contains(document.activeElement)));}await page.keyboard.press('Escape');await page.waitForTimeout(200);assert(await trigger.evaluate(el=>el===document.activeElement));});
 await check('Agent editor retains advanced configuration',async()=>{await page.getByRole('button',{name:'Edit Tobi',exact:true}).click();await page.getByLabel('Nama',{exact:true}).waitFor();await page.getByText('Lanjutan · Model dan kemampuan',{exact:true}).click();await page.locator('#agent-model').waitFor();await page.keyboard.press('Escape');});
 await check('Group wizard opens at member selection',async()=>{await page.getByRole('button',{name:'Siapkan percakapan'}).click();await page.getByRole('heading',{name:'Pilih agent'}).waitFor();await page.getByRole('combobox',{name:'Jenis'}).selectOption('group');assert(await page.getByRole('button',{name:'Lanjut',exact:true}).isDisabled());assert(!await page.getByLabel('Nama percakapan').isVisible());await page.keyboard.press('Escape');});
} finally {await writeFile(`${output}/browser-results.json`,JSON.stringify(results,null,2)+'\n');await browser.close();}
console.log(JSON.stringify(results,null,2));if(results.failures.length)process.exitCode=1;
