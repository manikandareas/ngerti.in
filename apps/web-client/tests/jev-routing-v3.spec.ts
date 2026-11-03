import { expect, type Page, test } from "@playwright/test";

async function post(page: Page, path: string, data: object) {
  const r = await page.request.post(path, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data,
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
async function setup(
  page: Page,
  ready = false,
  unknown = false,
  mode?: "reviewing" | "clarification",
) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  await post(page, "/v1/verification/runtime", { ready, unknown, mode });
  const connection = await post(page, "/v1/connections", {
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const agent = await post(page, "/v1/agents", {
    name: `Routing actor ${crypto.randomUUID().slice(0, 6)}`,
    harness: "codex",
    connection_id: connection.id,
    model_id: "fixture",
    billing_source: "subscription",
  });
  const group = await post(page, "/v1/threads", { type: "group", member_agent_ids: [agent.id] });
  await post(page, `/v1/groups/${group.id}/configuration`, {
    expected_revision: group.revision,
    changes: { name: `Routing group ${group.id.slice(0, 6)}` },
  });
  const route = await post(page, `/v1/groups/${group.id}/messages`, {
    text: "Keep this original group request.",
  });
  await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), group.id);
  await page.reload();
  return { group, route };
}
async function snapshot(page: Page, id: string) {
  return (await page.request.get(`/v1/threads/${id}/snapshot`)).json();
}

test("a blocked fallback shows its cause and retries the same hidden run across reload", async ({
  page,
}, info) => {
  const { group, route } = await setup(page);
  await expect(
    page.getByRole("status").filter({ hasText: "I couldn’t get started." }),
  ).toBeVisible();
  await expect(
    page.getByText("Update your connected app to continue.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Who’s got this? One sec…", { exact: true })).toHaveCount(0);
  const before = (await snapshot(page, group.id)).routes.find(
    (r: { id: string }) => r.id === route.id,
  );
  const sent = page.waitForRequest(
    (r) =>
      r.method() === "POST" &&
      r.url().endsWith(`/v1/runs/${before.execution.run_id}/retry-preparation`),
  );
  await page.getByRole("button", { name: "Try connecting again", exact: true }).click();
  expect((await sent).postDataJSON()).toEqual({ expected_revision: before.execution.run_revision });
  await expect(
    page.getByRole("button", { name: "Try connecting again", exact: true }),
  ).toBeEnabled();
  const after = await snapshot(page, group.id);
  expect(after.routes.find((r: { id: string }) => r.id === route.id).execution.run_id).toBe(
    before.execution.run_id,
  );
  expect(
    after.messages.filter((m: { text: string }) => m.text === "Keep this original group request."),
  ).toHaveLength(1);
  expect(after.runs).toHaveLength(0);
  await page.reload();
  await expect(page.getByText("I couldn’t get started.", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("blocked-router.png") });
});

test("binary repair refreshes the group from hidden-run events without another message or classifier call", async ({
  page,
}) => {
  const { group, route } = await setup(page);
  await expect(page.getByText("I couldn’t get started.", { exact: true })).toBeVisible();
  const before = await snapshot(page, group.id);
  const router = before.routes.find((r: { id: string }) => r.id === route.id);
  const decisions = (await (await page.request.get("/v1/verification/runtime")).json()).decisions;
  await post(page, "/v1/verification/runtime", { ready: true });
  await expect(page.getByText("Fixture routed answer.", { exact: true })).toBeVisible();
  const after = await snapshot(page, group.id);
  const current = after.routes.find((r: { id: string }) => r.id === route.id);
  expect(current.state).toBe("selected");
  expect(current.router_run_id).toBe(router.router_run_id);
  expect(
    after.messages.filter((m: { text: string }) => m.text === "Keep this original group request."),
  ).toHaveLength(1);
  expect((await (await page.request.get("/v1/verification/runtime")).json()).decisions).toBe(
    decisions,
  );
  await expect(page.getByText("I couldn’t get started.", { exact: true })).toHaveCount(0);
});

test("an unknown native fallback requests reconciliation and exposes no preparation retry", async ({
  page,
}) => {
  await setup(page, true, true);
  await expect(
    page.getByText("I couldn’t confirm who should reply.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try connecting again", exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText("I couldn’t confirm who should reply.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("semantic review progress updates without exposing private routing input", async ({
  page,
}, info) => {
  const { group } = await setup(page, true, false, "reviewing");
  await expect(
    page.getByRole("status").filter({ hasText: "Who’s got this? One sec…" }),
  ).toBeVisible();
  const routing = page.locator("[data-group-routing]");
  await expect(routing.locator(".agent-activity-avatar .agent-avatar").first()).toBeVisible();
  await expect(routing.locator("[data-activity-text]")).toHaveAttribute("data-shimmer", "true");
  expect(
    await routing
      .locator("[data-activity-text]")
      .evaluate((element) => getComputedStyle(element, "::after").animationName),
  ).toBe("agent-activity-shimmer");
  const geometry = await routing.evaluate((element) => {
    const avatar = element.querySelector(".agent-activity-avatar")?.getBoundingClientRect();
    const bubble = element.querySelector(".agent-activity-bubble")?.getBoundingClientRect();
    if (!avatar || !bubble) throw new Error("Missing routing bubble or avatar");
    return { gap: bubble.left - avatar.right, top: Math.abs(bubble.top - avatar.top) };
  });
  expect(geometry.gap).toBe(9);
  expect(geometry.top).toBeLessThanOrEqual(4);
  await expect(page.getByText("PRIVATE_REVIEW_CANARY")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("semantic-review.png") });
  await post(page, "/v1/verification/runtime", { ready: true });
  await expect(page.getByText("Fixture routed answer.", { exact: true })).toBeVisible();
  const current = await snapshot(page, group.id);
  expect(
    current.messages.filter(
      (message: { text: string }) => message.text === "Keep this original group request.",
    ),
  ).toHaveLength(1);
  await expect(page.getByText("Who’s got this? One sec…", { exact: true })).toHaveCount(0);
});

test("an unresolved recipient displays the agent's clarification across reload", async ({
  page,
}, info) => {
  const { group, route } = await setup(page, true, false, "clarification");
  const question = "Anggota mana yang kamu maksud untuk permintaan ini?";
  await expect(page.getByRole("status").filter({ hasText: question })).toBeVisible();
  await expect(page.getByText("Who’s got this? One sec…", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: question })).toBeVisible();
  const current = await snapshot(page, group.id);
  expect(current.routes.find((item: { id: string }) => item.id === route.id).task_id).toBeNull();
  expect(current.runs).toHaveLength(0);
  await page.screenshot({ path: info.outputPath("recipient-clarification.png") });
});
