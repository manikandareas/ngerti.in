// Authenticated local walkthrough. No API mocks; requires an isolated test account.
import { chromium } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const out = "docs/verification/agent-export-audit/current";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.NMA046_BROWSER,
});
const context = await browser.newContext({
  storageState: process.env.NMA046_STORAGE_STATE,
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const results = {
  checks: [],
  failures: [],
  limits: [
    "Local development, real authenticated API/provider. No production deployment or manual screen reader audit.",
  ],
};
async function check(name, fn) {
  try {
    await fn();
    results.checks.push(name);
    console.log("PASS", name);
  } catch (e) {
    results.failures.push({ name, error: String(e) });
    console.log("FAIL", name, String(e));
    await page.screenshot({ path: `${out}/failure-${results.failures.length}.png` });
  }
}
async function api(path, body) {
  return page.evaluate(
    async ({ path, body }) => {
      const token = await window.Clerk.session.getToken();
      const r = await fetch(`http://localhost:8000/api/agent-engine/v1${path}`, {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, body: await r.json() };
    },
    { path, body },
  );
}
const snapshot = async () => {
  const r = await api(`/threads/${thread}/snapshot`);
  assert.equal(r.status, 200);
  return r.body;
};
let thread;

// Presentation-only fault fixtures. Never count these as provider/runtime acceptance.
results.limits.push(
  "Snapshots and SSE are intercepted for presentation-only edge states. Real runtime invariants are independently covered by gateway tests and the authenticated walkthrough.",
);
try {
  await page.goto("http://localhost:3000");
  await page.waitForURL("**/conversations/**");
  await page.getByRole("textbox", { name: /Pesan untuk/ }).waitFor();
  thread = page.url().split("/").at(-1);
  const source = await snapshot();
  const agent = source.thread.agents[0];
  let fixture = structuredClone(source);
  fixture.messages = [
    {
      message_id: "fixture-user",
      message_seq: "1",
      run_id: "fixture-run",
      author_kind: "user",
      author_agent_id: null,
      content: "Periksa hasil pekerjaan ini.",
    },
  ];
  fixture.runs = [
    {
      run_id: "fixture-run",
      agent_id: agent.agent_id,
      status: "indeterminate",
      text: "",
      error_code: "EFFECT_OUTCOME_UNKNOWN",
    },
  ];
  fixture.goals = [];
  fixture.delegations = [];
  fixture.collaboration_tasks = [];
  fixture.next_before_message_seq = null;
  await page.route("**/api/agent-engine/v1/threads/*/snapshot*", (route) =>
    route.fulfill({ json: fixture }),
  );
  await page.route("**/api/agent-engine/v1/events?*", (route) =>
    route.fulfill({ contentType: "text/event-stream", body: ": presentation fixture\n\n" }),
  );
  await page.route("**/api/agent-engine/v1/commands", (route) =>
    route.fulfill({ json: { fixture: true } }),
  );
  for (const theme of ["light", "dark"])
    for (const width of [1440, 390])
      await check(`Indeterminate fixture ${theme} ${width} has no retry`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.reload();
        await page.getByText(/Pekerjaan tidak diulang otomatis/).waitFor();
        await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
        assert.equal(
          await page.getByRole("button", { name: /retry|coba lagi|kirim kembali/i }).count(),
          0,
        );
        await page.screenshot({ path: `${out}/fixture-unknown-${theme}-${width}.png` });
      });
  fixture.collaboration_tasks = [
    {
      task_id: "fixture-task",
      revision: "1",
      expected_result: "Susun shortlist penginapan",
      assignee_agent_id: agent.agent_id,
      implementer_agent_id: agent.agent_id,
      reviewer_agent_id: null,
      status: "review",
      summary: "Tiga pilihan sudah disiapkan.",
      review_summary: "Periksa tanggal sebelum konfirmasi.",
      artifact_ids: [],
      dependencies: [],
    },
  ];
  fixture.delegations = [
    {
      child_session_id: "fixture-child",
      parent_run_id: "fixture-run",
      parent_child_id: null,
      subagent_id: "assistant",
      kind: "temporary_subagent",
      status: "unknown",
      goal: "Periksa ketersediaan penginapan",
      model: "Configured agent model",
      result: { summary: "Hasil tindakan belum diketahui.", schema_valid: true },
    },
  ];
  await check("Task and temporary-subagent rows expose evidence with keyboard", async () => {
    await page.reload();
    await page.getByRole("button", { name: /Susun shortlist/ }).waitFor();
    await page.getByRole("button", { name: /Susun shortlist/ }).focus();
    await page.keyboard.press("Enter");
    await page.getByText("Tiga pilihan sudah disiapkan.", { exact: true }).waitFor();
    await page.getByRole("button", { name: /Periksa ketersediaan/ }).click();
    await page.getByText("Hasil tindakan belum diketahui.", { exact: true }).waitFor();
    await page.screenshot({ path: `${out}/fixture-collaboration.png` });
  });
  fixture.runs[0].status = "running";
  fixture.runs[0].activity = "Menggunakan alat";
  fixture.runs[0].error_code = null;
  await check("Tool progress honors reduced motion", async () => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await page.locator(".beautiful-loader-cell").first().waitFor();
    assert.equal(
      await page
        .locator(".beautiful-loader-cell")
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    await page.screenshot({ path: `${out}/fixture-tool-progress.png` });
  });
  fixture.thread.status = "archived";
  fixture.runs = [];
  await check("Archived permission state retains history and prevents send", async () => {
    await page.reload();
    await page
      .getByText("Agent atau percakapan tidak aktif. Riwayat tetap dapat dibaca.", { exact: true })
      .waitFor();
    assert(await page.getByRole("textbox", { name: /Pesan untuk/ }).isDisabled());
    assert.equal(await page.getByRole("button", { name: "Kirim pesan", exact: true }).count(), 0);
    await page.screenshot({ path: `${out}/fixture-read-only.png` });
  });
  await check("History error has recoverable state", async () => {
    await page.unroute("**/api/agent-engine/v1/threads/*/snapshot*");
    await page.route("**/api/agent-engine/v1/threads/*/snapshot*", (r) =>
      r.fulfill({ status: 403, json: { detail: "Forbidden" } }),
    );
    await page.reload();
    await page.getByRole("alert").filter({ hasText: "Percakapan belum dapat dimuat" }).waitFor();
    await page.screenshot({ path: `${out}/fixture-permission-error.png` });
  });
} finally {
  await writeFile(`${out}/presentation-results.json`, JSON.stringify(results, null, 2) + "\n");
  await browser.close();
}
if (results.failures.length) process.exitCode = 1;
