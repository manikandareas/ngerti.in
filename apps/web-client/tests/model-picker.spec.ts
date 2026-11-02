import { expect, type Page, test } from "@playwright/test";

interface Agent {
  id: string;
  revision: number;
  system_role: string | null;
  reasoning: string | null;
  billing_source: string | null;
}
interface Connection {
  id: string;
  harness: "codex" | "muse";
  authentication: { method: string; billing_source: "subscription" | "api_key" };
}

// Native inspection projections are fixtures; connection creation, revision checks,
// configuration persistence and reload use the real API/SQLite without inference.
async function account(page: Page, harness: "codex" | "muse", keyed = false) {
  const response = await page.request.post("/v1/connections", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: {
      harness,
      authentication: keyed
        ? { method: "api_key", billing_source: "api_key", credential_ref: crypto.randomUUID() }
        : { method: "native_login", billing_source: "subscription" },
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<Connection>;
}

async function tobi(page: Page) {
  const agents: Agent[] = await page.request
    .get("/v1/entities/agent")
    .then((response) => response.json());
  const agent = agents.find((candidate) => candidate.system_role === "tobi");
  expect(agent).toBeTruthy();
  return agent as Agent;
}

async function configure(page: Page, connection: Connection, model: string) {
  const agent = await tobi(page);
  const response = await page.request.post(`/v1/agents/${agent.id}/configuration`, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: {
      expected_revision: agent.revision,
      changes: {
        connection_id: connection.id,
        harness: connection.harness,
        billing_source: connection.authentication.billing_source,
        model_id: model,
        reasoning: null,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
}

test("model menu searches accounts, persists model/reasoning and explicitly selects billing", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const codex = await account(page, "codex");
  const muse = await account(page, "muse", true);
  const small = "ui-proof-codex-small";
  const large = "ui-proof-codex-large";
  const museModel = "ui-proof-muse";
  await configure(page, codex, small);
  await page.route("**/v1/entities/connection", async (route) => {
    const response = await route.fetch();
    const all: Connection[] = await response.json();
    await route.fulfill({
      response,
      json: all.map((connection) =>
        connection.id === codex.id || connection.id === muse.id
          ? {
              ...connection,
              login: "authenticated",
              discovery: "succeeded",
              effective_billing_source: connection.authentication.billing_source,
              account_id: connection.id === codex.id ? "proof-chatgpt-account" : "proof-muse-key",
              models:
                connection.id === codex.id
                  ? [
                      { id: small, reasoning: ["low", "high"] },
                      { id: large, reasoning: ["low", "high"] },
                      ...Array.from({ length: 11 }, (_, index) => ({
                        id: `ui-proof-extra-${index}`,
                        reasoning: [],
                      })),
                    ]
                  : [{ id: museModel, reasoning: [] }],
            }
          : connection,
      ),
    });
  });
  await page.reload();
  const trigger = page.getByRole("button", { name: "Pilih model", exact: true });
  await expect(trigger).toHaveText(small);
  await trigger.focus();
  await trigger.press("ArrowDown");
  const menu = page.getByRole("dialog", { name: "Pilih model", exact: true });
  await expect(menu).toBeVisible();
  const search = menu.getByRole("textbox", { name: "Cari model", exact: true });
  await expect(search).toBeFocused();
  const initialGroup = menu.locator(`[data-simple-provider="${codex.id}"]`);
  await expect(initialGroup.getByRole("button")).toHaveCount(5);
  await initialGroup.getByRole("button", { name: "Tampilkan semua 13 model", exact: true }).click();
  await expect(initialGroup.getByRole("button")).toHaveCount(13);
  await initialGroup.getByRole("button", { name: "Tampilkan saran", exact: true }).click();
  await expect(initialGroup.getByRole("button")).toHaveCount(5);
  await search.focus();
  await search.press("ArrowDown");
  await expect(menu.locator("[data-current-model]")).toBeFocused();
  await menu.locator("[data-current-model]").press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await search.fill(large);
  await expect(menu.locator("[data-current-model]")).toHaveCount(0);
  await expect(menu.locator(`[data-simple-provider="${muse.id}"]`)).toHaveCount(0);
  const codexGroup = menu.locator(`[data-simple-provider="${codex.id}"]`);
  await expect(codexGroup).toContainText("Subscription");
  const update = page.waitForRequest(
    (request) => request.url().endsWith("/configuration") && request.method() === "POST",
  );
  await expect(codexGroup.getByRole("button", { name: large, exact: true })).toBeVisible();
  await search.press("Enter");
  const changes = (await update).postDataJSON().changes;
  expect(changes).toMatchObject({
    connection_id: codex.id,
    model_id: large,
    billing_source: "subscription",
    harness: "codex",
  });
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveText(large);

  await trigger.click();
  await menu.getByRole("button", { name: "low", exact: true }).focus();
  await menu.getByRole("button", { name: "low", exact: true }).press("ArrowRight");
  await expect(menu.getByRole("button", { name: "high", exact: true })).toBeFocused();
  await menu.getByRole("button", { name: "high", exact: true }).press("Enter");
  await expect.poll(async () => (await tobi(page)).reasoning).toBe("high");
  await expect(menu.getByRole("button", { name: "high", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await search.fill("no-model-matches-this-query");
  await expect(menu.getByRole("status")).toContainText("Tidak ada hasil");
  await search.fill(museModel);
  const museGroup = menu.locator(`[data-simple-provider="${muse.id}"]`);
  await expect(museGroup).toContainText("API key");
  const bounds = await menu.boundingBox();
  const viewport = page.viewportSize();
  expect(
    bounds && viewport && bounds.x >= 0 && bounds.x + bounds.width <= viewport.width,
  ).toBeTruthy();
  expect(
    bounds && viewport && bounds.y >= 0 && bounds.y + bounds.height <= viewport.height,
  ).toBeTruthy();
  await page.screenshot({ path: info.outputPath("model-menu.png") });
  const keyedUpdate = page.waitForRequest(
    (request) => request.url().endsWith("/configuration") && request.method() === "POST",
  );
  await museGroup.getByRole("button", { name: museModel, exact: true }).click();
  expect((await keyedUpdate).postDataJSON().changes).toMatchObject({
    connection_id: muse.id,
    harness: "muse",
    billing_source: "api_key",
    model_id: museModel,
    reasoning: null,
  });
  await expect(menu).toBeHidden();
  await expect.poll(async () => (await tobi(page)).billing_source).toBe("api_key");
  await page.reload();
  await expect(trigger).toHaveText(museModel);
  const saved = await tobi(page);
  expect(saved).toMatchObject({
    connection_id: muse.id,
    harness: "muse",
    model_id: museModel,
    reasoning: null,
    billing_source: "api_key",
  });
});

test("unverified discovery exposes inspection failure and a repair entry without inventing models", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const connection = await account(page, "codex");
  await configure(page, connection, "ui-proof-unavailable");
  await page.route("**/v1/entities/connection", async (route) => {
    const response = await route.fetch();
    const all: Connection[] = await response.json();
    await route.fulfill({
      response,
      json: all.map((item) =>
        item.id === connection.id ? { ...item, login: "authenticated" } : item,
      ),
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "Pilih model", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Pilih model", exact: true });
  const group = menu.locator(`[data-simple-provider="${connection.id}"]`);
  await expect(group).toContainText("Biaya belum terverifikasi");
  await expect(group).toContainText("Model belum diperiksa");
  await expect(group.getByRole("button")).toHaveCount(1);
  await expect(menu.getByRole("textbox", { name: "Cari model", exact: true })).toHaveCount(0);
  await menu.locator("[data-current-model]").press("p");
  await expect(
    group.getByRole("button", { name: "Periksa akun & model", exact: true }),
  ).toBeFocused();
  await group.getByRole("button", { name: "Periksa akun & model", exact: true }).click();
  await expect(menu.getByRole("alert")).toContainText("Layanan akun belum tersedia");
  await menu.getByRole("button", { name: "Kelola akun & model", exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname === "/" && url.searchParams.get("settings") === "providers",
  );
});
