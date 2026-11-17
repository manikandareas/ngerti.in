import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect as browserExpect, type Page } from "playwright/test";
import { fixturePassword } from "../../../apps/server/tests/auth/helpers";
import { acceptanceFixture } from "./fixture";

const directory = resolve(import.meta.dir, "../../../.dev/verification/nma-083");
const dist = resolve(import.meta.dir, "../../../apps/web-client/dist");
mkdirSync(resolve(directory, "screenshots"), { recursive: true });
async function navigation(page: Page) {
  if (!(await page.getByRole("button", { name: /^Organization:/ }).isVisible()))
    await page.getByRole("button", { name: "Percakapan", exact: true }).click();
}
async function switchOrganization(page: Page, name: string) {
  await navigation(page);
  await page.getByRole("button", { name: /^Organization:/ }).click();
  await page.getByRole("button", { name, exact: true }).click();
  await browserExpect(page.getByRole("textbox", { name: "Pesan", exact: true })).toBeVisible();
}
for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 1000 }],
  ["mobile", { width: 390, height: 844 }],
] as const)
  test(`${name}: simultaneous Team-agent conversations, cross-organization drafts and live member removal`, async () => {
    const f = await acceptanceFixture();
    const browser = await chromium.launch();
    const checks: { name: string; status: "pass" }[] = [];
    const report = {
      viewport,
      planned: 6,
      checks,
      completed: false,
      real_http_and_postgresql: true,
      controlled_transports: ["email", "native_harness", "machine"],
      page_errors: [] as string[],
      scheduler_interval_ms: 1000,
      run_timings: [] as unknown[],
    };
    const waits: unknown[] = [];
    let collecting = false;
    const collectWaits =
      process.env.NGERTIIN_NMA083_QUERY_WAITS === "1"
        ? setInterval(() => {
            if (collecting) return;
            collecting = true;
            void f.domain
              .administrativeQuery(`SELECT pid,state,wait_event_type,wait_event,
        pg_blocking_pids(pid) AS blockers,left(query,180) AS statement,
        extract(epoch FROM now()-xact_start) AS transaction_seconds
        FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()`)
              .then((result) => {
                waits.push({
                  at: new Date().toISOString(),
                  active: f.background.activeCount,
                  rows: result.rows,
                });
                return Bun.write(
                  resolve(directory, `browser-${name}-query-waits.json`),
                  `${JSON.stringify(waits, null, 2)}\n`,
                );
              })
              .catch(() => {})
              .finally(() => {
                collecting = false;
              });
          }, 5000)
        : undefined;
    const save = () =>
      Bun.write(resolve(directory, `browser-${name}.json`), `${JSON.stringify(report, null, 2)}\n`);
    const pass = async (name: string) => {
      checks.push({ name, status: "pass" });
      await save();
    };
    f.serve(async (request) => {
      const url = new URL(request.url);
      if (/^\/(v1|health|api\/auth)(\/|$)/.test(url.pathname)) return f.api.handle(request);
      const path = resolve(dist, `.${url.pathname}`);
      const file = path.startsWith(`${dist}/`) ? Bun.file(path) : null;
      return new Response(
        file && (await file.exists()) ? file : Bun.file(resolve(dist, "index.html")),
        {
          headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
        },
      );
    });
    await f.background.start();
    try {
      const pages: Page[] = [];
      const lanes = [f.ownerLane, f.aliceLane, f.bobLane];
      const markers = lanes.map(
        (_, index) => `NMA083 ${name} private person ${index} ${crypto.randomUUID()}`,
      );
      for (const [index, email] of [
        "owner@example.test",
        "alice@example.test",
        "bob@example.test",
      ].entries()) {
        const context = await browser.newContext({
          viewport,
          isMobile: name === "mobile",
          hasTouch: name === "mobile",
        });
        const page = await context.newPage();
        pages.push(page);
        page.on("pageerror", (error) => report.page_errors.push(error.message));
        await page.goto(f.origin);
        await page.getByLabel("Email", { exact: true }).fill(email);
        await page.getByLabel("Password", { exact: true }).fill(fixturePassword);
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        if (index > 0)
          await page.getByRole("button", { name: "First organization", exact: true }).click();
        await browserExpect(
          page.getByRole("textbox", { name: "Pesan", exact: true }),
        ).toBeVisible();
        await navigation(page);
        await page.locator(`[data-thread-id="${lanes[index]!.thread.id}"]`).click();
      }
      await pass("three_independent_browser_sessions_with_owner_member_admin");
      await Promise.all(
        pages.map(async (page, index) => {
          await page.getByRole("textbox", { name: "Pesan", exact: true }).fill(markers[index]!);
          await page.getByRole("button", { name: "Kirim", exact: true }).click();
        }),
      );
      await Bun.write(
        resolve(directory, `browser-${name}-visibility.json`),
        `${JSON.stringify(await Promise.all(pages.map((page) => page.evaluate(() => ({ visibility: document.visibilityState, focused: document.hasFocus() })))), null, 2)}\n`,
      );
      for (const [index, page] of pages.entries()) {
        await browserExpect
          .poll(
            async () => {
              const snapshot = await f.success(
                f.request(lanes[index]!.cookie, `/v1/threads/${lanes[index]!.thread.id}/snapshot`),
              );
              return snapshot.runs[0]?.status;
            },
            { timeout: 45000 },
          )
          .toBe("succeeded");
        const completed = await f.success(
          f.request(lanes[index]!.cookie, `/v1/threads/${lanes[index]!.thread.id}/snapshot`),
        );
        report.run_timings.push({
          actor: index,
          created_at: completed.runs[0].created_at,
          ...completed.runs[0].timings,
        });
        // Presentation pauses in inactive pages. Assert the foreground reconciliation a person sees.
        await page.bringToFront();
        await browserExpect(
          page
            .getByRole("main", { name: "Percakapan aktif" })
            .getByText(markers[index]!, { exact: true }),
        ).toHaveCount(2, { timeout: 45000 });
        for (const marker of markers.filter((_, other) => other !== index))
          await browserExpect(
            page.getByRole("main", { name: "Percakapan aktif" }).getByText(marker, { exact: true }),
          ).toHaveCount(0);
        const other = lanes[(index + 1) % lanes.length]!;
        const response = await page.request.get(
          `${f.origin}/v1/threads/${other.thread.id}/snapshot`,
          {
            headers: { "X-Ngertiin-Organization": f.initial.organization.id },
          },
        );
        expect(response.status()).toBe(404);
      }
      await pass("simultaneous_same_team_agent_messages_and_foreign_read_denial");
      const alice = pages[1]!;
      await alice.bringToFront();
      const composer = alice.getByRole("textbox", { name: "Pesan", exact: true });
      await composer.fill("First organization private draft NMA083");
      await switchOrganization(alice, f.second.name);
      await browserExpect(composer).toHaveText("");
      await composer.fill("Second organization private draft NMA083");
      await alice.reload();
      await browserExpect(composer).toHaveText("Second organization private draft NMA083");
      await switchOrganization(alice, f.initial.organization.name);
      await browserExpect(composer).toHaveText("First organization private draft NMA083");
      await pass("cross_organization_drafts_survive_reload_without_cross_display");
      await alice.screenshot({
        path: resolve(directory, `screenshots/${name}-private-team.png`),
        fullPage: true,
      });
      expect(await alice.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await pass("rendered_viewport_has_no_horizontal_overflow");
      const pendingRemoval = setTimeout(() => {
        void f.domain
          .administrativeQuery(`SELECT pid,state,wait_event_type,wait_event,
          pg_blocking_pids(pid) AS blockers,left(query,180) AS statement,
          extract(epoch FROM now()-xact_start) AS transaction_seconds
          FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()`)
          .then((result) =>
            Bun.write(
              resolve(directory, `browser-${name}-database-waits.json`),
              `${JSON.stringify(result.rows, null, 2)}\n`,
            ),
          );
      }, 10000);
      try {
        await f.success(
          f.write(f.bob.cookie, `${f.path}/members/${f.joined.membership.id}/remove`),
        );
      } finally {
        clearTimeout(pendingRemoval);
      }
      await browserExpect(
        alice
          .getByRole("main", { name: "Percakapan aktif" })
          .getByText(markers[1]!, { exact: true }),
      ).toHaveCount(0, { timeout: 30000 });
      const retained = await alice.request.get(
        `${f.origin}/v1/threads/${f.aliceLane.thread.id}/snapshot`,
        {
          headers: { "X-Ngertiin-Organization": f.initial.organization.id },
        },
      );
      expect(retained.status()).toBe(403);
      await pass("live_membership_removal_clears_private_projection_and_denies_retrieval");
      // The account still belongs to the second organization after removal from the first.
      await alice.reload();
      await browserExpect(composer).toBeVisible({ timeout: 30000 });
      await browserExpect(composer).toHaveText("Second organization private draft NMA083");
      expect(report.page_errors).toEqual([]);
      await alice.screenshot({
        path: resolve(directory, `screenshots/${name}-remaining-organization.png`),
        fullPage: true,
      });
      await pass("remaining_organization_preserves_its_private_draft_after_offboarding");
      expect(checks.length).toBe(report.planned);
      report.completed = true;
    } catch (error) {
      const snapshots = [];
      for (const lane of [f.ownerLane, f.aliceLane, f.bobLane]) {
        const snapshot = await f
          .success(f.request(lane.cookie, `/v1/threads/${lane.thread.id}/snapshot`))
          .catch(() => null);
        snapshots.push(snapshot);
      }
      await Bun.write(
        resolve(directory, `browser-${name}-failure.json`),
        `${JSON.stringify({ snapshots }, null, 2)}\n`,
      );
      throw error;
    } finally {
      clearInterval(collectWaits);
      await browser.close();
      await f.close();
      await save();
    }
  }, 180000);
