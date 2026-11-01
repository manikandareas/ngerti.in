import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const proof = await Bun.file('.dev/nma061-native/proof.json').json();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
const results: unknown[] = [];
const base = 'http://127.0.0.1:4312';
async function snapshot(id: string) { const response = await context.request.get(`${base}/v1/threads/${id}/snapshot`); assert(response.ok()); return response.json(); }
try {
 await page.goto(base);
 await page.getByRole('button', { name: 'Detail Tobi' }).waitFor();
 for (const family of ['codex', 'muse']) {
  const connection = proof[family]; assert(connection, `${family} credentials unavailable`);
  // Configure creation defaults through the same UI the owner uses.
  await page.getByRole('button', { name: 'Pengaturan', exact: true }).click();
  await page.getByLabel('Koneksi Tobi', { exact: true }).selectOption(connection.id);
  const model = family === 'codex' ? 'gpt-6.1-sol' : 'muse-spark-1.3';
  await page.getByLabel('Model', { exact: true }).selectOption(model);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Buat baru' }).click();
  const response = page.waitForResponse(r => r.url().endsWith('/v1/creation/agents') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create agent', exact: true }).click();
  const receipt = await (await response).json(); assert(receipt.agent);
  const threadId = receipt.thread.id;
  await page.getByRole('button', { name: `Detail ${receipt.agent.name}` }).waitFor();
  const waitRun = async (count: number) => {
   const deadline = Date.now() + 180000;
   while (Date.now() < deadline) { const state = await snapshot(threadId); const run = state.runs.at(-1); if (state.runs.length >= count && ['succeeded','failed','unknown','cancelled'].includes(run.status)) return state; await new Promise(r => setTimeout(r, 1000)); }
   throw new Error(`${family}: native timeout`);
  };
  const opening = await waitRun(1); assert.equal(opening.runs[0].status, 'succeeded');
  await page.getByRole('textbox', { name: 'Pesan', exact: true }).fill(`Use your scoped profile tool to change your name to UI proof ${family}. Read the current revision first. Then calculate 137 times 23. This is one-time work, not a goal or Routine. Do not change files, apps, memory or skills.`);
  await page.getByRole('button', { name: 'Kirim', exact: true }).click();
  const final = await waitRun(2); assert.equal(final.runs.at(-1).status, 'succeeded');
  assert(final.runs.at(-1).product_tools.includes('ngertiin.update_agent'));
  assert.equal(final.agents[0].name, `UI proof ${family}`);
  await page.getByRole('button', { name: `Detail UI proof ${family}`, exact: true }).waitFor();
  assert(final.messages.some((m: { author: string; text: string }) => m.author === 'agent' && /3.?151/.test(m.text)));
  await page.reload(); await page.getByRole('button', { name: `Detail UI proof ${family}`, exact: true }).waitFor();
  const after = await snapshot(threadId); assert.equal(after.runs.length, 2);
  await page.screenshot({ path: `docs/verification/nma-061/native-${family}.png` });
  results.push({ family, thread_id: threadId, agent_id: receipt.agent.id, opening_status: opening.runs[0].status, run: final.runs.at(-1), billing: connection.effective_billing_source, reload_run_count: after.runs.length });
  await Bun.write('docs/verification/nma-061/native.json', JSON.stringify({ results, errors }, null, 2));
  await page.getByRole('button', { name: /Tobi.*Asisten personal/ }).click();
 }
 assert.deepEqual(errors, []);
 console.log(JSON.stringify({ native_runs: results.length * 2, families: results.length, errors }));
} finally { await browser.close(); }
