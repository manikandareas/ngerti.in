import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const native = await Bun.file('docs/verification/nma-061/native.json').json();
const browser = await chromium.launch();
const results = [];
try {
 for (const lane of native.results) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(id => localStorage.setItem('ngertiin:thread', id), lane.thread_id);
  const base = 'http://127.0.0.1:4312';
  const before = await context.request.get(`${base}/v1/threads/${lane.thread_id}/snapshot`).then(r => r.json());
  const page = await context.newPage(); await page.goto(base);
  await page.getByRole('button', { name: `Detail UI proof ${lane.family}` }).waitFor();
  await page.reload(); await page.getByRole('button', { name: `Detail UI proof ${lane.family}` }).waitFor();
  const after = await context.request.get(`${base}/v1/threads/${lane.thread_id}/snapshot`).then(r => r.json());
  assert.equal(after.runs.length, before.runs.length); assert.equal(after.messages.length, before.messages.length);
  assert(after.runs.some((r: { cancellation: string }) => r.cancellation === 'confirmed'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('button', { name: `Detail UI proof ${lane.family}` }).click();
  await page.getByRole('tab', { name: 'Agent', exact: true }).waitFor();
  await page.screenshot({ path: `docs/verification/nma-061/native-${lane.family}-mobile.png` });
  results.push({ family: lane.family, runs: after.runs.length, messages: after.messages.length, restart_read_only: true });
  await context.close();
 }
 await Bun.write('docs/verification/nma-061/restart.json', JSON.stringify({ results, pass: results.length, fail: 0 }, null, 2));
 console.log(JSON.stringify({ pass: results.length, fail: 0 }));
} finally { await browser.close(); }
