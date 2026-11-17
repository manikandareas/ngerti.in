import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const proof = await Bun.file('.dev/verification/nma-061/native.json').json();
const browser = await chromium.launch();
const results: unknown[] = [];
const base = 'http://127.0.0.1:4312';
try {
 for (const lane of proof.results) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(id => localStorage.setItem('ngertiin:thread', id), lane.thread_id);
  const page = await context.newPage();
  await page.goto(base);
  await page.getByRole('button', { name: `Detail UI proof ${lane.family}` }).waitFor();
  const text = lane.family === 'codex' ? 'Use the native shell to run sleep 25, then say done. This is a one-time cancellation check; do not create goals, Routine, files or external effects.' : 'Write a careful 3000-word explanation of sorting algorithms with at least ten worked examples. This is one-time work; do not create goals, Routine, files or external effects.';
  await page.getByRole('textbox', { name: 'Pesan', exact: true }).fill(text);
  const admitted = page.waitForResponse(r => r.url().endsWith('/v1/runs') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Kirim', exact: true }).click();
  const admission = await (await admitted).json();
  const runId = admission.run.id;
  const stop = page.getByRole('button', { name: 'Stop run', exact: true });
  await stop.waitFor();
  await page.getByRole('textbox', { name: 'Pesan', exact: true }).fill('This message should wait.');
  await page.getByRole('button', { name: 'Antrekan', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).last().click();
  await page.getByRole('textbox', { name: 'Edit pesan', exact: true }).fill(lane.family === 'codex' ? 'Stop this run now. Use your scoped cancel_run product tool for this active run. Do not start another task.' : 'Waiting message corrected.');
  await page.getByRole('button', { name: 'Simpan pesan', exact: true }).click();
  await page.getByRole('dialog', { name: 'Edit pesan menunggu' }).waitFor({ state: 'hidden' });
  if (lane.family === 'codex') {
   await page.getByRole('button', { name: 'Arahkan sekarang', exact: true }).click();
  } else {
   await page.getByRole('button', { name: 'Hapus', exact: true }).last().click();
   await stop.click();
  }
  const deadline = Date.now() + 120000;
  let run;
  while (Date.now() < deadline) {
   run = await context.request.get(`${base}/v1/entities/run/${runId}`).then(r => r.json());
   if (['succeeded','cancelled','failed','unknown'].includes(run.status)) break;
   await new Promise(r => setTimeout(r, 1000));
  }
  results.push({ family: lane.family, run, mode: lane.family === 'codex' ? 'queued_edit_steer_conversational_stop' : 'queued_edit_delete_button_stop' });
  await Bun.write('.dev/verification/nma-061/native-controls.json', JSON.stringify({ results }, null, 2));
  assert.equal(run.status, 'cancelled'); assert.equal(run.cancellation, 'confirmed');
  await page.getByText('Stop terkonfirmasi', { exact: true }).last().waitFor();
  await page.screenshot({ path: `.dev/verification/nma-061/control-${lane.family}.png` });
  await context.close();
 }
 console.log(JSON.stringify({ pass: results.length, fail: 0 }));
} finally { await browser.close(); }
