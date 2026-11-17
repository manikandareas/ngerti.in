import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import type { Snapshot } from "../../../apps/web-client/src/types/workspace";

const directory = ".dev/nma062-native";
const proof = await Bun.file(`${directory}/proof.json`).json();
const { token } = await Bun.file(`${directory}/installation.json`).json();
async function api<T>(path: string): Promise<T> {
  const r = await fetch(`http://127.0.0.1:8322${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(r.ok);
  return r.json();
}
const runs = await api<{ id: string; status: string }[]>("/v1/entities/run");
assert(
  runs.every((r) => r.status === "succeeded"),
  "Reconcile every native outcome before restart.",
);
const projections = await Promise.all(
  ["codex", "muse"].map(async (family) => {
    const lane = proof[family];
    const s = await api<Snapshot>(`/v1/threads/${lane.thread_id}/snapshot`);
    const agent = await api<{ revision: number; name: string; instructions: string }>(
      `/v1/entities/agent/${lane.agent.id}`,
    );
    assert.equal(agent.revision, lane.agent.revision);
    assert.equal(agent.name, lane.agent.name);
    assert.equal(agent.instructions, lane.agent.instructions);
    assert(s.goals.every((g) => g.state === "paused"));
    assert(s.routines.every((r) => r.state === "paused"));
    for (const artifact of s.artifacts)
      if (artifact.workspace_id) {
        const response = await fetch(
          `http://127.0.0.1:8322/v1/artifacts/${artifact.id}/content?workspace_id=${artifact.workspace_id}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        assert(response.ok);
        assert.equal(
          createHash("sha256")
            .update(new Uint8Array(await response.arrayBuffer()))
            .digest("hex"),
          artifact.sha256,
        );
      }
    return {
      family,
      thread: s.thread,
      messages: s.messages,
      goals: s.goals,
      routines: s.routines,
      artifacts: s.artifacts.map((a) => ({ id: a.id, sha256: a.sha256 })),
      runs: s.runs.map((r) => ({ id: r.id, status: r.status })),
      human_requests: s.human_requests,
      routes: s.routes,
    };
  }),
);
if (process.argv[2] === "before") {
  await Bun.write(`${directory}/restart-before.json`, JSON.stringify({ runs, projections }));
  console.log(
    JSON.stringify({
      native_runs: runs.length,
      all_succeeded: true,
      paused_goals: projections.length,
    }),
  );
} else {
  const before = await Bun.file(`${directory}/restart-before.json`).json();
  assert.deepEqual(runs, before.runs);
  assert.deepEqual(projections, before.projections);
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    await page.goto("http://127.0.0.1:4322");
    await page.getByRole("button", { name: "Buka percakapan", exact: true }).waitFor();
    for (const family of ["codex", "muse"]) {
      await page.getByRole("button", { name: "Buka percakapan", exact: true }).click();
      await page
        .getByRole("navigation", { name: "Percakapan", exact: true })
        .getByRole("button", { name: `UI work ${family} 2 agent`, exact: true })
        .click();
      await page.getByRole("button", { name: `Detail UI work ${family}`, exact: true }).click();
      await page.getByRole("tab", { name: "Goals", exact: true }).click();
      await page.getByRole("button", { name: `UI responsibility ${family}`, exact: true }).click();
      assert(
        await page
          .getByText(/Dijeda/)
          .first()
          .isVisible(),
      );
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `.dev/verification/nma-062/restart-mobile-${family}.png` });
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.reload();
      await page.getByRole("button", { name: `Detail UI work ${family}`, exact: true }).waitFor();
    }
    const finalRuns = await api<{ id: string }[]>("/v1/entities/run");
    assert.deepEqual(finalRuns, before.runs);
    await Bun.write(
      ".dev/verification/nma-062/restart.json",
      JSON.stringify(
        {
          native_runs_before: before.runs.length,
          native_runs_after: finalRuns.length,
          new_inference: 0,
          exact_stable_projections: projections.length,
          mobile_read_reload: 2,
          artifact_bytes_verified: true,
          global_agent_profiles_unchanged: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}
