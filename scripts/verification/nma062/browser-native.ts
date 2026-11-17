import assert from "node:assert/strict";
import { chromium } from "playwright";
import type { Snapshot } from "../../../apps/web-client/src/types/workspace";

const proof = await Bun.file(".dev/nma062-native/proof.json").json();
const base = "http://127.0.0.1:4322";
const threadId = proof.codex.thread_id as string;
const scope = { agent_id: proof.codex.agent.id as string, thread_id: threadId };
const site = Bun.serve({
  hostname: "0.0.0.0",
  port: 8323,
  fetch: () =>
    new Response(
      "<!doctype html><html><head><title>NMA062 browser proof</title></head><body style='font:32px system-ui;padding:48px;background:#f5f5f5;color:#222'><h1>NMA062 browser proof</h1><p>The agent and this VNC viewer share this tab.</p></body></html>",
      { headers: { "Content-Type": "text/html" } },
    ),
});
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
async function post<T>(path: string, data: unknown): Promise<T> {
  const response = await context.request.post(`${base}${path}`, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data,
  });
  assert(response.ok(), `${path}: ${response.status()}`);
  return response.json();
}
async function snapshot(id: string): Promise<Snapshot> {
  return (await context.request.get(`${base}/v1/threads/${id}/snapshot`)).json();
}
async function waitFor(id: string, match: (s: Snapshot) => boolean) {
  let s = await snapshot(id);
  for (let n = 0; n < 180; n++) {
    if (match(s) && s.runs.every((r) => r.status === "succeeded")) return s;
    assert(!s.runs.some((r) => ["failed", "unknown"].includes(r.status)));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    s = await snapshot(id);
  }
  throw new Error("Inspect existing visual/browser native work before retry.");
}
try {
  await page.goto(base);
  await page.getByRole("button", { name: "Buat baru", exact: true }).waitFor();
  await page
    .getByRole("navigation", { name: "Percakapan", exact: true })
    .getByRole("button", { name: "UI work codex 2 agent", exact: true })
    .click();
  const profiles = await (
    await context.request.get(`${base}/v1/browser/profiles?${new URLSearchParams(scope)}`)
  ).json();
  const profile =
    profiles.find(
      (p: { profile: { name: string } }) => p.profile.name === "UI native browser proof",
    )?.profile ??
    (await post<{ id: string }>("/v1/browser/profiles", {
      name: "UI native browser proof",
      grants: [{ ...scope, actions: true }],
    }));
  let current = await snapshot(threadId);
  if (!current.messages.some((m) => m.text.includes("NMA062 browser proof"))) {
    await page
      .getByRole("textbox", { name: "Pesan", exact: true })
      .fill(
        `@proof062_codex Use the scoped browser tools to open profile ${profile.id}, navigate to http://host.docker.internal:8323/proof, then read its title and text. Report the title. Leave the tab open for the VNC view. This is NMA062 browser proof: one read-only task, not a goal or Routine. Do not visit any other site or use apps.`,
      );
    await page.getByRole("button", { name: "Kirim", exact: true }).click();
  }
  current = await waitFor(threadId, (s) =>
    s.runs.some(
      (r) => r.product_tools.includes("ngertiin.browser_action") && r.status === "succeeded",
    ),
  );
  await page.getByRole("button", { name: "Detail UI work codex", exact: true }).click();
  await page.getByRole("tab", { name: "File", exact: true }).click();
  await page.getByText("Browser percakapan", { exact: true }).click();
  const refreshed = await (
    await context.request.get(`${base}/v1/browser/profiles?${new URLSearchParams(scope)}`)
  ).json();
  const session = refreshed
    .find((p: { profile: { id: string } }) => p.profile.id === profile.id)
    ?.sessions.at(-1);
  assert(session);
  await page.getByRole("button", { name: "Lihat browser", exact: true }).click();
  await page.getByText("Tampilan terhubung", { exact: true }).waitFor({ timeout: 30000 });
  const observation = await (
    await context.request.get(
      `${base}/v1/browser/sessions/${session.id}?${new URLSearchParams(scope)}`,
    )
  ).json();
  const receipts = await (
    await context.request.get(
      `${base}/v1/browser/sessions/${session.id}/receipts?${new URLSearchParams(scope)}`,
    )
  ).json();
  assert(
    observation.content.some(
      (c: { type: string; text?: string }) =>
        c.type === "text" && c.text?.includes("http://host.docker.internal:8323/proof"),
    ),
  );
  assert(
    receipts.some(
      (r: { tool: string; state: string; native_session_id: string }) =>
        r.tool === "browser_navigate" &&
        r.state === "succeeded" &&
        r.native_session_id === observation.binding.native_session_id,
    ),
  );
  assert(
    observation.binding.tabs.some(
      (t: { target_id: string }) => t.target_id === observation.binding.target_id,
    ),
  );
  await page.screenshot({ path: ".dev/verification/nma-062/native-agent-vnc.png" });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Tutup detail", exact: true }).click();
  await Bun.write(
    ".dev/verification/nma-062/native-browser.json",
    JSON.stringify(
      { profile_id: profile.id, session_id: session.id, observation, receipts, errors },
      null,
      2,
    ),
  );

  const dm = await post<{ id: string }>(`/v1/agents/${proof.codex.agent.id}/dm`, {});
  await page
    .getByRole("navigation", { name: "Percakapan", exact: true })
    .getByRole("button", { name: "NMA062 codex Codex / ChatGPT", exact: true })
    .click();
  let visual = await snapshot(dm.id);
  if (!visual.messages.length) {
    await page
      .getByLabel("Lampirkan file ke pesan", { exact: true })
      .setInputFiles("scripts/verification/nma059/fixtures/visual-input.png");
    await page
      .getByRole("button", { name: "Hapus lampiran visual-input.png", exact: true })
      .waitFor();
    await page
      .getByRole("textbox", { name: "Pesan", exact: true })
      .fill(
        "Read the large printed code in this image, and name both colored shapes. Do not use tools or create goals/Routine.",
      );
    await page.getByRole("button", { name: "Kirim", exact: true }).click();
  }
  visual = await waitFor(dm.id, (s) => s.runs.length === 1 && s.runs[0]?.status === "succeeded");
  const answer = visual.messages
    .filter((m) => m.author === "agent")
    .map((m) => m.text)
    .join(" ");
  assert.match(answer, /RAVEN\s*7146/i);
  assert.match(answer, /blue/i);
  assert.match(answer, /triangle/i);
  await page.screenshot({ path: ".dev/verification/nma-062/native-image.png" });
  await Bun.write(
    ".dev/verification/nma-062/native-image.json",
    JSON.stringify(
      { messages: visual.messages, runs: visual.runs, artifacts: visual.artifacts, errors },
      null,
      2,
    ),
  );

  await page.getByRole("button", { name: "Detail NMA062 codex", exact: true }).click();
  await page.getByText("Koneksi aplikasi", { exact: true }).click();
  await page.getByRole("textbox", { name: "Cari aplikasi", exact: true }).fill("linear");
  const catalogue = page.waitForResponse((r) => r.url().includes("/v1/apps/catalog?"));
  await page.getByRole("button", { name: "Cari aplikasi", exact: true }).click();
  const response = await catalogue;
  assert(response.ok());
  const data = await response.json();
  assert(data.items.length > 0);
  await page.screenshot({ path: ".dev/verification/nma-062/live-composio-catalog.png" });
  await Bun.write(
    ".dev/verification/nma-062/live-composio-catalog.json",
    JSON.stringify({ items: data.items, external_connect_or_execute: false, errors }, null, 2),
  );
  assert.deepEqual(errors, []);
} finally {
  await page
    .screenshot({ path: ".dev/verification/nma-062/browser-native-last.png" })
    .catch(() => {});
  await browser.close();
  site.stop(true);
}
