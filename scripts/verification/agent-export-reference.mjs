import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';import{mkdir,writeFile}from'node:fs/promises';
const out='docs/verification/agent-export-audit/reference';await mkdir(out,{recursive:true});const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:1000}});await p.goto(pathToFileURL(resolve('docs/agent-export.html')).href);await p.evaluate(()=>document.fonts.ready);
const boards=await p.locator('body > div > [data-pencil-id]').evaluateAll(es=>es.map(e=>({id:e.dataset.pencilId,name:e.dataset.pencilName,width:e.offsetWidth,height:e.offsetHeight,nodes:e.querySelectorAll('[data-pencil-id]').length+1,text:e.innerText})));await writeFile(`${out}/boards.json`,JSON.stringify(boards,null,2));
for(const board of boards){await p.locator(`body > div > [data-pencil-id="${board.id}"]`).screenshot({path:`${out}/${board.id}.png`});}await b.close();console.log(boards.length,'boards rendered');
