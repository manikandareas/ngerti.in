import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

const control = "http://127.0.0.1:8320";
const password = "A-long-fixture-password-948!";
type State = {
  organization: { id: string; name: string };
  second: { id: string; name: string };
  team: { id: string; name: string };
  ownerThread: string;
  aliceThread: string;
  bobThread: string;
  ownerConnection: string;
  aliceConnection: string;
  alternativeConnection: string;
  grant: string;
};
let state: State;
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, request }) => {
  const failures: string[] = [];
  errors.set(page, failures);
  page.on("pageerror", (error) => failures.push(error.message));
  const response = await request.post(`${control}/reset`);
  expect(response.ok()).toBeTruthy();
  state = await response.json();
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});
async function signIn(page: Page, email = "alice@example.test") {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  if (email === "owner@example.test")
    await page.getByRole("button", { name: "First organization", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toBeVisible();
}
async function navigation(page: Page) {
  if (!(await page.getByRole("button", { name: /^Organization:/ }).isVisible()))
    await page.getByRole("button", { name: "Percakapan", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Organization:/ })).toBeVisible();
}
async function switchOrganization(page: Page, name: string) {
  await navigation(page);
  await page.getByRole("button", { name: /^Organization:/ }).click();
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toBeVisible();
}
async function settings(page: Page, section: string, label: string) {
  await page.getByRole("button", { name: "Pengaturan", exact: true }).click();
  await expect(page.getByRole("main", { name: "Pengaturan", exact: true })).toBeVisible();
  const mobile = page.getByRole("combobox", { name: "Menu pengaturan", exact: true });
  if (await mobile.isVisible()) await mobile.selectOption(section);
  else {
    const menu = page.getByRole("navigation", { name: "Menu pengaturan", exact: true });
    if (
      ["members", "workgroups", "team-agents"].includes(section) &&
      !(await menu.getByRole("link", { name: label, exact: true }).isVisible())
    )
      await menu.getByRole("link", { name: "Organization", exact: true }).click();
    await menu.getByRole("link", { name: label, exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: label, exact: true, level: 1 })).toBeVisible();
}
async function capture(page: Page, name: string) {
  const directory = resolve(
    process.env.NGERTIIN_ACCOUNT_SCREENSHOTS ?? "../../.dev/accounts-browser-screenshots",
  );
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: resolve(directory, name), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function emailLink(request: APIRequestContext, email: string, purpose: string) {
  const response = await request.get(
    `${control}/email?${new URLSearchParams({ to: email, purpose })}`,
  );
  return (await response.json()).url as string;
}

test("guarded owner setup preserves the new workspace without AI setup", async ({
  page,
  request,
}, info) => {
  state = await (await request.post(`${control}/reset?empty=1`)).json();
  await page.goto("/");
  await capture(page, `${info.project.name}-sign-in.png`);
  await page.getByLabel("Email", { exact: true }).fill("owner@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByText("Set up this server", { exact: true }).click();
  await page.getByLabel("Owner setup token").fill(state.grant);
  await page.getByRole("button", { name: "Complete setup", exact: true }).click();
  await page.getByRole("button", { name: "Create organization", exact: true }).click();
  await page.getByLabel("Organization name").fill("Studio");
  await page.getByRole("button", { name: "Create organization", exact: true }).click();
  const composer = page.getByRole("textbox", { name: "Pesan", exact: true });
  await expect(composer).toBeVisible();
  await expect(page.getByRole("button", { name: "Pilih model", exact: true })).toBeVisible();
  const heading = await page.getByRole("button", { name: /^Detail / }).getAttribute("aria-label");
  await page.reload();
  await expect(page.getByRole("button", { name: heading ?? "" })).toBeVisible();
  await expect(composer).toBeVisible();
  await capture(page, `${info.project.name}-first-workspace.png`);
});

test("member completes a first task with a private Team-agent conversation", async ({
  page,
}, info) => {
  await signIn(page);
  await navigation(page);
  await expect(page.getByText("My agents", { exact: true })).toBeVisible();
  await expect(page.getByText("Team agents", { exact: true })).toBeVisible();
  await page.locator(`[data-thread-id="${state.aliceThread}"]`).click();
  const text = `Private first task ${crypto.randomUUID()}`;
  await page.getByRole("textbox", { name: "Pesan", exact: true }).fill(text);
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/v1/threads/${state.aliceThread}/snapshot`, {
          headers: { "X-Ngertiin-Organization": state.organization.id },
        });
        const snapshot = await response.json();
        return snapshot.runs?.find((run: { status: string }) => run.status === "succeeded")?.status;
      },
      { timeout: 45_000 },
    )
    .toBe("succeeded");
  await expect(
    page.getByRole("main", { name: "Percakapan aktif" }).getByText(text, { exact: true }),
  ).toHaveCount(2);
  await capture(page, `${info.project.name}-conversation.png`);
  const foreign = await page.request.get(`/v1/threads/${state.ownerThread}/snapshot`, {
    headers: { "X-Ngertiin-Organization": state.organization.id },
  });
  expect(foreign.status()).toBe(404);
  await settings(page, "account", "Account");
  await expect(page.getByRole("link", { name: "Members", exact: true })).toHaveCount(0);
});

test("organization switching isolates drafts and uses the selected request scope", async ({
  page,
}) => {
  await signIn(page, "owner@example.test");
  const composer = page.getByRole("textbox", { name: "Pesan", exact: true });
  await composer.fill("First organization private draft");
  await switchOrganization(page, state.second.name);
  await expect(composer).toHaveText("");
  await composer.fill("Second organization private draft");
  await page.reload();
  await expect(composer).toHaveText("Second organization private draft");
  await switchOrganization(page, state.organization.name);
  await expect(composer).toHaveText("First organization private draft");
  const keys = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.includes("draft:")),
  );
  expect(keys.length).toBe(2);
  expect(keys.every((key) => key.startsWith("ngertiin:scope:"))).toBe(true);
});

test("owner manages workgroups and invites a member with the assigned access", async ({
  page,
  request,
  browser,
}, info) => {
  await signIn(page, "owner@example.test");
  await settings(page, "workgroups", "Workgroups");
  await page.getByRole("button", { name: "New workgroup", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Design");
  await page.getByRole("button", { name: "Create workgroup", exact: true }).click();
  await expect(page.getByText("Design", { exact: true })).toBeVisible();
  await capture(page, `${info.project.name}-workgroups.png`);
  await settings(page, "members", "Members");
  await page.getByRole("button", { name: "Invite member", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("invited@example.test");
  await page.getByLabel("Engineering", { exact: true }).check();
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();
  await expect(page.getByText("invited@example.test", { exact: true })).toBeVisible();
  const invitation = await emailLink(request, "invited@example.test", "invitation");
  const context = await browser.newContext({
    viewport: info.project.use.viewport,
    isMobile: info.project.name === "mobile",
    hasTouch: info.project.name === "mobile",
  });
  const invited = await context.newPage();
  await invited.goto(invitation);
  await invited.getByRole("button", { name: "Create account", exact: true }).click();
  await invited.getByLabel("Name", { exact: true }).fill("Invited member");
  await invited.getByLabel("Email", { exact: true }).fill("invited@example.test");
  await invited.getByLabel("Password", { exact: true }).fill(password);
  await invited.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(invited.getByText(/Check your email to verify/)).toBeVisible();
  await invited.goto(await emailLink(request, "invited@example.test", "verification"));
  await invited.goto(invitation);
  await invited.getByLabel("Email", { exact: true }).fill("invited@example.test");
  await invited.getByLabel("Password", { exact: true }).fill(password);
  await invited.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    invited.getByRole("heading", { name: "Join First organization", exact: true }),
  ).toBeVisible();
  await invited.getByRole("button", { name: "Accept invitation", exact: true }).click();
  await expect(invited.getByRole("textbox", { name: "Pesan", exact: true })).toBeVisible();
  const access = await invited.request.get(`/v1/organizations/${state.organization.id}`);
  const projection = await access.json();
  expect(projection.role).toBe("member");
  expect(projection.workgroup_ids.length).toBe(1);
  await context.close();
});

test("account recovery uses the email link and revokes existing sessions", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("alice@example.test");
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(page.getByText(/If this email has an account/)).toBeVisible();
  await page.goto(await emailLink(request, "alice@example.test", "recovery"));
  await page.getByLabel("New password", { exact: true }).fill(`${password}-new`);
  await page.getByRole("button", { name: "Save password", exact: true }).click();
  await expect(
    page.getByText("Password updated. Sign in to continue.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("alice@example.test");
  await page.getByLabel("Password", { exact: true }).fill(`${password}-new`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toBeVisible();
});

test("removal closes private surfaces and prevents queued writes", async ({ page, request }) => {
  await signIn(page);
  await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("Unsent before removal");
  await request.post(`${control}/remove-alice`);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveCount(0, {
    timeout: 20_000,
  });
  await expect(page.getByText("Unsent before removal", { exact: true })).toHaveCount(0);
});

test("a Team-agent model choice stays private to its user and conversation", async ({
  page,
  browser,
}, info) => {
  await signIn(page);
  await navigation(page);
  await page.locator(`[data-thread-id="${state.aliceThread}"]`).click();
  await page.getByRole("button", { name: "Pilih model", exact: true }).click();
  await page
    .locator("[data-model-picker-content]")
    .getByRole("button", { name: /alternative-model/ })
    .click();
  await expect(page.locator(".model-selector")).toContainText("alternative-model");
  const options = { headers: { "X-Ngertiin-Organization": state.organization.id } };
  const selections = await (await page.request.get("/v1/entities/ai_selection", options)).json();
  expect(
    selections.some(
      (row: { scope: string; thread_id: string; selection: { connection_id: string } }) =>
        row.scope === "conversation" &&
        row.thread_id === state.aliceThread &&
        row.selection.connection_id === state.alternativeConnection,
    ),
  ).toBe(true);
  const team = await (
    await page.request.get(`/v1/entities/agent/${state.team.id}`, options)
  ).json();
  expect(team.connection_id).toBeNull();
  const context = await browser.newContext({
    viewport: info.project.use.viewport,
    isMobile: info.project.name === "mobile",
    hasTouch: info.project.name === "mobile",
  });
  const bob = await context.newPage();
  await signIn(bob, "bob@example.test");
  await navigation(bob);
  await bob.locator(`[data-thread-id="${state.bobThread}"]`).click();
  await expect(bob.locator(".model-selector")).toContainText("fixture-model");
  expect(
    (await bob.request.get(`/v1/threads/${state.aliceThread}/snapshot`, options)).status(),
  ).toBe(404);
  await context.close();
  await settings(page, "providers", "Providers");
  await page
    .locator(".organization-settings-row")
    .filter({ hasText: "secondary-fixture-account" })
    .getByText("Manage", { exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Default model", exact: true })
    .selectOption("alternative-model");
  await page.getByRole("button", { name: "Use as my default", exact: true }).click();
  await expect(page.getByRole("button", { name: "Clear my default", exact: true })).toBeEnabled();
  const defaults = await (await page.request.get("/v1/entities/ai_selection", options)).json();
  expect(
    defaults.find((row: { scope: string }) => row.scope === "user").selection.connection_id,
  ).toBe(state.alternativeConnection);
  await capture(page, `${info.project.name}-connections.png`);
});

test("two tabs keep separate organizations and logout clears both private surfaces", async ({
  page,
  context,
}) => {
  await signIn(page, "owner@example.test");
  await page
    .getByRole("textbox", { name: "Pesan", exact: true })
    .fill("Owner draft in first organization");
  const second = await context.newPage();
  await second.goto("/");
  await second.getByRole("button", { name: state.second.name, exact: true }).click();
  await expect(second.getByRole("textbox", { name: "Pesan", exact: true })).toHaveText("");
  await second
    .getByRole("textbox", { name: "Pesan", exact: true })
    .fill("Other organization draft");
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveText(
    "Owner draft in first organization",
  );
  await settings(second, "account", "Account");
  await second.getByRole("button", { name: "Sign out", exact: true }).first().click();
  await expect(second.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveCount(0, {
    timeout: 10_000,
  });
  await second.getByLabel("Email", { exact: true }).fill("alice@example.test");
  await second.getByLabel("Password", { exact: true }).fill(password);
  await second.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(second.getByRole("textbox", { name: "Pesan", exact: true })).toHaveText("");
  await expect(page.getByText("Owner draft in first organization", { exact: true })).toHaveCount(0);
});

test("a lost message acknowledgement cannot move to the next organization", async ({ page }) => {
  await signIn(page, "owner@example.test");
  await navigation(page);
  await page.locator(`[data-thread-id="${state.ownerThread}"]`).click();
  let lost = false;
  const submitted: { organization: string | undefined; key: string | undefined }[] = [];
  await page.route("**/v1/runs", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    submitted.push({
      organization: route.request().headers()["x-ngertiin-organization"],
      key: route.request().headers()["idempotency-key"],
    });
    if (lost) return route.continue();
    lost = true;
    await route.fetch();
    await route.abort("failed");
  });
  const text = "Keep this operation in the original organization";
  await page.getByRole("textbox", { name: "Pesan", exact: true }).fill(text);
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(page.getByRole("button", { name: "Periksa pengiriman", exact: true })).toBeVisible();
  await switchOrganization(page, state.second.name);
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveText("");
  expect(submitted).toHaveLength(1);
  expect(submitted[0].organization).toBe(state.organization.id);
  await switchOrganization(page, state.organization.name);
  await navigation(page);
  await page.locator(`[data-thread-id="${state.ownerThread}"]`).click();
  await page.getByRole("button", { name: "Periksa pengiriman", exact: true }).click();
  await expect.poll(() => submitted.length).toBe(2);
  expect(submitted[1]).toEqual(submitted[0]);
  await expect(page.getByRole("button", { name: "Periksa pengiriman", exact: true })).toHaveCount(
    0,
  );
});

test("owner creates another organization and publishes a Team agent without a dashboard", async ({
  page,
}, info) => {
  await signIn(page, "owner@example.test");
  await settings(page, "organization", "Organization");
  await page.getByRole("button", { name: "New organization", exact: true }).click();
  await page.getByLabel("Organization name", { exact: true }).fill("Design studio");
  await page.getByRole("button", { name: "Create organization", exact: true }).click();
  await page.getByRole("button", { name: "Percakapan", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toBeVisible();
  await settings(page, "team-agents", "Team agents");
  await page.getByRole("button", { name: "Create Team agent", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Studio helper");
  await page.getByRole("button", { name: "Save access", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save access", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("main", { name: "Pengaturan" }).getByText("Studio helper", { exact: true }),
  ).toBeVisible();
  await capture(page, `${info.project.name}-team-access.png`);
  await page.getByRole("button", { name: "Percakapan", exact: true }).click();
  await navigation(page);
  await page.getByRole("button", { name: "Studio helper", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Detail Studio helper", exact: true }),
  ).toBeVisible();
});

test("private attachments open and download through the scoped file transport", async ({
  page,
}, info) => {
  await signIn(page);
  await navigation(page);
  await page.locator(`[data-thread-id="${state.aliceThread}"]`).click();
  const contents = "A private attachment for Alice only.";
  await page.getByLabel("Lampirkan file ke pesan", { exact: true }).setInputFiles({
    name: "private-note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(contents),
  });
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveText("");
  await page
    .getByRole("button", { name: "Pratinjau private-note.txt", exact: true })
    .first()
    .click();
  await expect(page.getByText(contents, { exact: true })).toBeVisible();
  await capture(page, `${info.project.name}-file-focus.png`);
  await page.getByRole("button", { name: "Aksi file", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Unduh file", exact: true }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("private-note.txt");
  expect(readFileSync((await file.path()) ?? "", "utf8")).toBe(contents);
  await page.getByRole("button", { name: "Kembali", exact: true }).click();
  await page.getByRole("button", { name: `Detail ${state.team.name}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Goals", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Routine", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Working files", exact: true }).click();
  await expect(page.getByRole("tree", { name: "Working files", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Agent info", exact: true }).click();
  const machineRead = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/v1/machine",
  );
  await page.getByRole("tab", { name: "Computer", exact: true }).click();
  const machine = await machineRead;
  expect(machine.ok()).toBe(true);
  expect(machine.request().headers()["x-ngertiin-organization"]).toBe(state.organization.id);
});

test("Marketplace keeps personal and organization installs explicit", async ({
  page,
  context,
}, info) => {
  await context.route("https://example.invalid/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "Fixture authorization" }),
  );
  await signIn(page, "owner@example.test");
  await page.goto("/?marketplace=plugins&item=github");
  await page.getByLabel("Install for", { exact: true }).selectOption("organization");
  await page.getByRole("button", { name: "Install plugin", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check status", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check status", exact: true }).click();
  await expect(page.getByRole("button", { name: "Installed", exact: true })).toBeVisible();
  const options = { headers: { "X-Ngertiin-Organization": state.organization.id } };
  const accounts = await (await page.request.get("/v1/apps/connections", options)).json();
  expect(accounts).toHaveLength(1);
  expect(accounts[0].ownership).toBe("organization");
  await capture(page, `${info.project.name}-marketplace.png`);
  await page.getByRole("button", { name: "Uninstall", exact: true }).click();
  await expect(page.getByRole("button", { name: "Install plugin", exact: true })).toBeVisible();
});

test("keyboard focus and dark responsive settings stay simple", async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/");
  const email = page.getByLabel("Email", { exact: true });
  await email.focus();
  await email.fill("alice@example.test");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await page.keyboard.type(password);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toBeVisible();
  await settings(page, "account", "Account");
  await expect(page.getByRole("heading", { name: "Account", exact: true, level: 1 })).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await capture(page, `${info.project.name}-account-dark.png`);
});
