// Use a private authenticated Clerk storage state; no authentication is bypassed.
import { chromium } from "playwright";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const output = process.env.NMA041_OUTPUT || "docs/verification/nma-041";
const origin = process.env.NMA041_ORIGIN || "http://localhost:3000";
if (!process.env.NMA041_STORAGE_STATE) throw new Error("NMA041_STORAGE_STATE must identify a private signed-in Clerk browser state.");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.NMA041_BROWSER, headless: true });
const context = await browser.newContext({ storageState: process.env.NMA041_STORAGE_STATE });
const page = await context.newPage();
const result = { authentication: "Actual Clerk session, authenticated production route, no API mocks", viewports: [], interactions: [], failures: [], limits: ["Foundation catalog only; complete feature walkthrough belongs to NMA-042 through NMA-046.", "Automated accessibility tree and axe checks are not a manual screen-reader audit.", "Local development verification, not deployment or operational acceptance."] };
async function check(name, fn) { if(process.env.NMA041_RECHECK && !["Buka popover: keyboard and focus return", "Select keyboard selection"].includes(name)) return; try { await fn(); result.interactions.push({name, passed:true}); } catch(error) { result.failures.push({name,error:String(error)}); } }
try {
  await page.goto(`${origin}/design-system`);
  await page.getByRole("heading", {name:"Komponen Ngertiin"}).waitFor();
  for (const theme of (process.env.NMA041_RECHECK ? ["dark"] : ["light", "dark"])) {
    await page.evaluate(theme => {document.documentElement.dataset.theme=theme;localStorage.setItem("ngertiin-theme",theme)},theme);
    for (const width of (process.env.NMA041_RECHECK ? [1440] : [1440,390,320,768])) {
      await page.setViewportSize({width,height:900});
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(200); // Allow the 150ms theme color transitions to settle.
      await page.addScriptTag({path:require.resolve("axe-core/axe.min.js")});
      const audit = await page.evaluate(async()=>{
        const report=await window.axe.run(document.querySelector("main"),{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21aa"]}});
        return {overflow:document.documentElement.scrollWidth>innerWidth,violations:report.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),incomplete:report.incomplete.map(v=>v.id)};
      });
      result.viewports.push({theme,width,...audit});
      await page.screenshot({path:`${output}/${theme}-${width}.png`,fullPage:true});
      if(audit.overflow||audit.violations.length)result.failures.push({name:`${theme}-${width}`,audit});
    }
  }
  await page.setViewportSize({width:390,height:844});
  await check("Dialog keyboard activation, focus trap and focus return",async()=>{
    const trigger=page.getByRole("button",{name:"Buka dialog",exact:true});await trigger.focus();await page.keyboard.press("Enter");
    const dialog=page.getByRole("dialog");await dialog.waitFor();
    for(let i=0;i<5;i++){await page.keyboard.press("Tab");assert(await dialog.evaluate(el=>el.contains(document.activeElement)));}
    await page.screenshot({path:`${output}/dialog-mobile.png`});
    await page.keyboard.press("Escape");await page.waitForTimeout(200);assert(await trigger.evaluate(el=>el===document.activeElement));
  });
  for(const [name,role] of [["Buka panel","dialog"],["Buka menu","menu"],["Buka popover","dialog"]])await check(`${name}: keyboard and focus return`,async()=>{
    const trigger=page.getByRole("button",{name,exact:true});await trigger.focus();await page.keyboard.press("Enter");await page.getByRole(role).waitFor();await page.keyboard.press("Escape");await page.getByRole(role).waitFor({state:"hidden"});await page.waitForFunction(name=>document.activeElement?.textContent===name,name);assert(await trigger.evaluate(el=>el===document.activeElement));
  });
  await check("Select keyboard selection",async()=>{const control=page.getByRole("combobox",{name:"Pilih agent"});await control.focus();await page.keyboard.press("Enter");await page.getByRole("listbox").waitFor();await page.keyboard.press("End");await page.waitForFunction(()=>document.activeElement?.getAttribute("role")==="option" && document.activeElement.textContent==="Writer");await page.keyboard.press("Enter");await page.getByRole("listbox").waitFor({state:"hidden"});assert.equal(await control.innerText(),"Writer");});
  await check("Native select, checkbox, switch and radio semantics",async()=>{
    await page.getByRole("combobox",{name:"Pilihan native"}).selectOption("group");
    const checkbox=page.getByRole("checkbox",{name:"Aktifkan pilihan"});await checkbox.focus();await page.keyboard.press("Space");assert.equal(await checkbox.getAttribute("aria-checked"),"true");
    const toggle=page.getByRole("switch",{name:"Notifikasi"});await toggle.focus();await page.keyboard.press("Space");assert.equal(await toggle.getAttribute("aria-checked"),"true");
    await page.getByRole("radio",{name:"Grup",exact:true}).check();assert.equal(await page.getByRole("radio",{name:"DM",exact:true}).isChecked(),false);
  });
  await check("Tabs and accordion keyboard interaction",async()=>{await page.getByRole("tab",{name:"Ringkasan",exact:true}).focus();await page.keyboard.press("ArrowRight");assert.equal(await page.getByRole("tab",{name:"Detail",exact:true}).getAttribute("aria-selected"),"true");const accordion=page.getByRole("button",{name:"Bagaimana menggunakan keyboard?"});await accordion.focus();await page.keyboard.press("Enter");assert.equal(await accordion.getAttribute("aria-expanded"),"true");});
  await check("Tooltip keyboard access",async()=>{await page.getByRole("button",{name:"Petunjuk",exact:true}).focus();await page.getByRole("tooltip").waitFor();await page.keyboard.press("Escape");});
  await check("Button hover, pressed, focus, disabled and loading",async()=>{
    const button=page.getByRole("button",{name:"default",exact:true});await button.scrollIntoViewIfNeeded();await button.hover();await page.screenshot({path:`${output}/button-hover.png`});await page.mouse.down();await page.screenshot({path:`${output}/button-pressed.png`});await page.mouse.up();await button.focus();await page.keyboard.press("Tab");await page.keyboard.press("Shift+Tab");assert(await button.evaluate(el=>el.matches(":focus-visible")));await page.screenshot({path:`${output}/button-focus.png`});assert(await page.getByRole("button",{name:"Dinonaktifkan"}).isDisabled());assert.equal(await page.getByRole("button",{name:"Menyimpan…"}).getAttribute("aria-busy"),"true");
  });
  await check("Reduced motion",async()=>{await page.emulateMedia({reducedMotion:"reduce"});const styles=await page.locator(".animate-spin").evaluate(el=>({animation:getComputedStyle(el).animationName,transition:getComputedStyle(el.closest("button")).transitionDuration}));assert.equal(styles.animation,"none");assert(parseFloat(styles.transition)<=0.00001);});
  await check("200 percent text zoom without horizontal overflow",async()=>{await page.evaluate(()=>document.documentElement.style.fontSize="200%");assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.evaluate(()=>document.documentElement.style.fontSize="");});
} catch(error) {result.failures.push({name:"setup",error:String(error)});} finally {await writeFile(`${output}/${process.env.NMA041_RECHECK ? "browser-recheck-results" : "browser-results"}.json`,JSON.stringify(result,null,2)+"\n");await browser.close();}
console.log(JSON.stringify({viewports:result.viewports.length,interactions:result.interactions.length,failures:result.failures},null,2));
if(result.failures.length)process.exitCode=1;
