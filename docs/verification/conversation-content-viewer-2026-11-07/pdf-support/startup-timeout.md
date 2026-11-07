# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: work.spec.ts >> contextual goals, Routine and files use real scoped state and keep stop responsibility distinct from stop run
- Location: tests/work.spec.ts:113:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'Detail Tobi', exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('button', { name: 'Detail Tobi', exact: true }) with timeout 5000ms
  - waiting for getByRole('button', { name: 'Detail Tobi', exact: true })

```

```yaml
- complementary:
  - link "Ngertiin":
    - /url: /
    - text: ngertiin.
  - button "Search conversations":
    - img
  - button "Buat baru":
    - img
  - navigation "Percakapan":
    - status "Memuat percakapan": Memuat percakapan…
  - button "Pengaturan":
    - img
  - button "Hubungkan aplikasi":
    - img
    - text: Hubungkan aplikasi
- main "Percakapan aktif":
  - status "Membuka percakapan": Membuka percakapan…
- region "Notifications alt+T"
```

# Test source

```ts
  1   | import { createHash } from "node:crypto";
  2   | import { readFile } from "node:fs/promises";
  3   | import { expect, type Page, test } from "@playwright/test";
  4   | 
  5   | async function post(page: Page, path: string, data: unknown) {
  6   |   const response = await page.request.post(path, {
  7   |     headers: { "Idempotency-Key": crypto.randomUUID() },
  8   |     data,
  9   |   });
  10  |   expect(response.ok(), await response.text()).toBeTruthy();
  11  |   return response.json();
  12  | }
  13  | // Project stored fixture bytes as native outputs to test the result UI without a harness run.
  14  | async function projectOutputs(page: Page, threadId: string, names?: string[]) {
  15  |   await page.route(`**/v1/threads/${threadId}/snapshot`, async (route) => {
  16  |     const response = await route.fetch();
  17  |     const snapshot = await response.json();
  18  |     snapshot.agents[0].instructions =
  19  |       "Keep the instructions visible.\n\nKeep this second paragraph out of the summary.";
  20  |     for (const file of snapshot.artifacts) {
  21  |       if (!names || names.includes(file.name)) file.origin = "native_output";
  22  |     }
  23  |     await route.fulfill({ response, json: snapshot });
  24  |   });
  25  | }
  26  | async function expectPanelHeader(page: Page, title: string) {
  27  |   const panel = page.locator("#conversation-details");
  28  |   const toolbar = panel.locator(".details-toolbar");
  29  |   const heading = toolbar.getByRole("heading", { name: title, exact: true });
  30  |   await expect(heading).toBeVisible();
  31  |   await expect(heading).toHaveCSS("font-size", "18px");
  32  |   await expect(heading).toHaveCSS("font-weight", "500");
  33  |   await expect(toolbar.locator("[data-panel-back]")).toHaveCount(1);
  34  |   await expect(toolbar.locator("[data-panel-close]")).toHaveCount(1);
  35  |   await expect(panel.getByRole("heading", { name: title, exact: true })).toHaveCount(1);
  36  |   await expect
  37  |     .poll(() =>
  38  |       toolbar.evaluate((element) => {
  39  |         const back = element.querySelector<HTMLElement>("[data-panel-back]");
  40  |         const title = element.querySelector("h3");
  41  |         const close = element.querySelector("[data-panel-close]");
  42  |         if (!back || !title || !close) return false;
  43  |         const a = back.getBoundingClientRect();
  44  |         const b = title.getBoundingClientRect();
  45  |         const c = close.getBoundingClientRect();
  46  |         return (
  47  |           Math.abs(a.y + a.height / 2 - c.y - c.height / 2) < 1 &&
  48  |           a.right <= b.left &&
  49  |           b.right <= c.left &&
  50  |           getComputedStyle(back).backgroundColor !== "rgba(0, 0, 0, 0)"
  51  |         );
  52  |       }),
  53  |     )
  54  |     .toBeTruthy();
  55  | }
  56  | async function capture(page: Page, path: string) {
  57  |   await page
  58  |     .locator(
  59  |       '[data-slot="sheet-content"], [data-slot="dialog-content"], [data-slot="drawer-content"], [data-slot="accordion-content"]',
  60  |     )
  61  |     .evaluateAll(async (surfaces) => {
  62  |       const animations = surfaces
  63  |         .flatMap((surface) => surface.getAnimations())
  64  |         .filter((animation) =>
  65  |           Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)),
  66  |         );
  67  |       await Promise.allSettled(animations.map((animation) => animation.finished));
  68  |     });
  69  |   await page.screenshot({ path });
  70  | }
  71  | async function start(page: Page) {
  72  |   await page.goto("/");
> 73  |   await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
      |                                                                                ^ Error: expect(locator).toBeVisible() failed
  74  |   const a = await post(page, "/v1/creation/agents", {
  75  |     connection_id: null,
  76  |     harness: "codex",
  77  |     model_id: null,
  78  |     billing_source: "subscription",
  79  |   });
  80  |   const b = await post(page, "/v1/creation/agents", {
  81  |     connection_id: null,
  82  |     harness: "codex",
  83  |     model_id: null,
  84  |     billing_source: "subscription",
  85  |   });
  86  |   return { a, b };
  87  | }
  88  | async function menu(page: Page) {
  89  |   const open = page.getByRole("button", { name: "Buka percakapan", exact: true });
  90  |   if (await open.isVisible()) await open.click();
  91  |   await page.getByRole("button", { name: "Buat baru", exact: true }).click();
  92  |   await page.getByRole("button", { name: "Create group", exact: true }).click();
  93  | }
  94  | async function chooseAgent(page: Page, name: string) {
  95  |   const open = page.getByRole("button", { name: "Buka percakapan", exact: true });
  96  |   if (await open.isVisible()) await open.click();
  97  |   const row = page
  98  |     .getByRole("navigation", { name: "Percakapan", exact: true })
  99  |     .locator("[data-thread-id]")
  100 |     .filter({ has: page.getByText(name, { exact: true }) });
  101 |   // Offscreen portraits intentionally remain deferred until the list is scrolled.
  102 |   await row.evaluate((element) => element.scrollIntoView({ block: "nearest" }));
  103 |   await row.click();
  104 |   await expect(page.getByRole("button", { name: `Detail ${name}`, exact: true })).toBeVisible();
  105 | }
  106 | async function revokeFixtureApps(page: Page, toolkit: string) {
  107 |   const connections = await (await page.request.get("/v1/apps/connections")).json();
  108 |   for (const connection of connections)
  109 |     if (connection.toolkit === toolkit && connection.state !== "revoked")
  110 |       await post(page, `/v1/apps/connections/${connection.id}/revoke`, {});
  111 | }
  112 | 
  113 | test("contextual goals, Routine and files use real scoped state and keep stop responsibility distinct from stop run", async ({
  114 |   page,
  115 | }, testInfo) => {
  116 |   test.setTimeout(60000);
  117 |   const { a } = await start(page);
  118 |   const goal = await post(page, "/v1/goals", {
  119 |     thread_id: a.thread.id,
  120 |     agent_id: a.agent.id,
  121 |     title: "Research progress",
  122 |   });
  123 |   const routine = await post(page, "/v1/routines", {
  124 |     thread_id: a.thread.id,
  125 |     agent_id: a.agent.id,
  126 |     instruction: "Check research progress",
  127 |     goal_id: goal.id,
  128 |     schedule: { type: "once", at: "2035-01-01T00:00:00.000Z" },
  129 |     timezone: "Asia/Makassar",
  130 |   });
  131 |   await chooseAgent(page, a.agent.name);
  132 |   await page.getByRole("button", { name: `Detail ${a.agent.name}`, exact: true }).click();
  133 |   await expect(page.locator("#conversation-details").getByRole("tab")).toHaveText([
  134 |     "Details",
  135 |     "Library",
  136 |     "Computer",
  137 |   ]);
  138 |   await expect(page.locator(".context-hero").getByRole("status")).toHaveCount(0);
  139 |   await expect(page.locator(".context-hero [data-activity-label]")).toHaveCount(0);
  140 |   await expect(page.getByRole("link", { name: "Ubah avatar", exact: true })).toHaveCount(0);
  141 |   await capture(page, testInfo.outputPath("agent-profile.png"));
  142 |   await capture(page, testInfo.outputPath("goals-list.png"));
  143 |   await page.getByRole("button", { name: "Research progress", exact: true }).click();
  144 |   await expect(page.getByRole("heading", { name: "Research progress", exact: true })).toBeVisible();
  145 |   await expect(
  146 |     page.getByRole("dialog").getByRole("heading", { name: "Activity", exact: true }),
  147 |   ).toBeVisible();
  148 |   await capture(page, testInfo.outputPath("goal-detail.png"));
  149 |   const initial = await (await page.request.get(`/v1/threads/${a.thread.id}/snapshot`)).json();
  150 |   const userAdmissions: string[] = [];
  151 |   page.on("request", (request) => {
  152 |     if (request.method() === "POST" && /\/v1\/(runs|groups\/[^/]+\/messages)$/.test(request.url()))
  153 |       userAdmissions.push(request.url());
  154 |   });
  155 |   let firstControlKey = "";
  156 |   let committedPause: { revision: number; state: string } | undefined;
  157 |   await page.route(`**/v1/goals/${goal.id}/control`, async (route) => {
  158 |     firstControlKey = route.request().headers()["idempotency-key"];
  159 |     const response = await route.fetch();
  160 |     expect(response.ok()).toBeTruthy();
  161 |     committedPause = await response.json();
  162 |     await route.abort("failed");
  163 |   });
  164 |   await page.getByRole("button", { name: "Pause goal", exact: true }).click();
  165 |   await expect(page.getByRole("button", { name: "Check change", exact: true })).toBeVisible();
  166 |   await page.reload();
  167 |   await page.getByRole("button", { name: `Detail ${a.agent.name}`, exact: true }).click();
  168 |   await page.getByRole("button", { name: "Research progress", exact: true }).click();
  169 |   await expect(page.getByRole("button", { name: "Check change", exact: true })).toBeVisible();
  170 |   await page.unroute(`**/v1/goals/${goal.id}/control`);
  171 |   const retry = page.waitForRequest((request) =>
  172 |     request.url().endsWith(`/v1/goals/${goal.id}/control`),
  173 |   );
```