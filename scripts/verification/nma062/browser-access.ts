import assert from "node:assert/strict";
import { chromium } from "playwright";

const proof = await Bun.file(".dev/nma062-native/proof.json").json();
const recorded = await Bun.file(".dev/verification/nma-062/native-browser.json").json();
const base = "http://127.0.0.1:4322";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
try {
  await page.goto(base);
  await page.getByRole("button", { name: "Buat baru", exact: true }).waitFor();
  const count = (await (await page.request.get(`${base}/v1/entities/browser_action`)).json())
    .length;
  await page
    .getByRole("navigation", { name: "Percakapan", exact: true })
    .getByRole("button", { name: "UI work codex 2 agent", exact: true })
    .click();
  await page.getByRole("button", { name: "Detail UI work codex", exact: true }).click();
  await page.getByRole("tab", { name: "File", exact: true }).click();
  await page.getByText("Browser percakapan", { exact: true }).click();
  await page.getByRole("button", { name: "Lihat browser", exact: true }).click();
  await page.getByText("Tampilan terhubung", { exact: true }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: ".dev/verification/nma-062/restart-browser.png" });
  const profile = await (
    await page.request.get(`${base}/v1/entities/browser_profile/${recorded.profile_id}`)
  ).json();
  const update = await page.request.post(`${base}/v1/browser/profiles/${profile.id}/grants`, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: {
      expected_revision: profile.revision,
      profile: {
        name: profile.name,
        grants: profile.grants,
        auth_policy: {
          origin: "http://host.docker.internal:8323",
          login_path_prefix: "/proof",
          authenticated_path_prefix: "/authenticated",
        },
      },
    },
  });
  assert(update.ok());
  const revised = await update.json();
  assert(revised.generation > profile.generation);
  await page
    .getByText("Tampilan terputus. Sambungkan ulang untuk melihat sesi yang sama.", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Sambungkan ulang tampilan", exact: true }).click();
  await page.getByText("Tampilan terhubung", { exact: true }).waitFor({ timeout: 30000 });
  await page
    .getByText(
      "Situs meminta login ulang. Selesaikan login pada host browser lalu periksa kembali.",
      { exact: true },
    )
    .waitFor();
  await page.screenshot({ path: ".dev/verification/nma-062/browser-auth-required.png" });
  const profiles = await (
    await page.request.get(
      `${base}/v1/browser/profiles?agent_id=${proof.codex.agent.id}&thread_id=${proof.codex.thread_id}`,
    )
  ).json();
  const active = profiles.find((p: { profile: { id: string } }) => p.profile.id === profile.id);
  assert(active.sessions.length);
  const after = (await (await page.request.get(`${base}/v1/entities/browser_action`)).json())
    .length;
  assert.equal(after, count);
  await Bun.write(
    ".dev/verification/nma-062/browser-access.json",
    JSON.stringify(
      {
        restart_view_connected: true,
        changed_grant_closed_old_view: true,
        fresh_view_generation: revised.generation,
        synthetic_site_auth_required_visible: true,
        browser_actions_before: count,
        browser_actions_after: after,
        native_inference: 0,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
