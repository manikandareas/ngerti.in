import { expect, type Page, test } from "@playwright/test";

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("group collaboration displays friendly activity and shared goal evidence without technical bubbles", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const members = [];
  for (const name of ["Campaign writer", "Campaign reviewer"]) {
    const connection = await post(page, "/v1/connections", {
      harness: "codex",
      authentication: { method: "native_login", billing_source: "subscription" },
    });
    members.push(
      await post(page, "/v1/agents", {
        name: `${name} ${crypto.randomUUID().slice(0, 5)}`,
        harness: "codex",
        connection_id: connection.id,
        model_id: "fixture",
      }),
    );
  }
  const group = await post(page, "/v1/threads", {
    type: "group",
    member_agent_ids: members.map((a) => a.id),
  });
  const groupName = `Campaign team ${crypto.randomUUID().slice(0, 5)}`;
  await post(page, `/v1/groups/${group.id}/configuration`, {
    expected_revision: group.revision,
    changes: { name: groupName },
  });
  const snapshot = async () => (await page.request.get(`/v1/threads/${group.id}/snapshot`)).json();
  await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), group.id);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toBeEditable();
  await post(page, `/v1/groups/${group.id}/messages`, {
    agent_id: members[0].id,
    text: "fixture shared responsibility",
  });
  await expect
    .poll(async () => (await snapshot()).goals[0]?.state, { timeout: 30_000 })
    .toBe("completed");
  await expect(page.getByText("The campaign summary is ready.", { exact: true })).toBeVisible();
  await expect(page.getByText("The reviewed example is ready.", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Goal: Shared campaign report · Selesai", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-collaboration-activity]")).toHaveCount(1);
  await expect(page.locator("[data-collaboration-activity]")).toContainText(
    "Prepare the reviewed example",
  );
  await expect(page.locator("body")).not.toContainText("INTERNAL_HANDOFF_CANARY_8472");
  await expect(page.locator("body")).not.toContainText("INTERNAL_FINALIZATION_CANARY_8472");
  const state = await snapshot();
  expect(state.goals[0]).toMatchObject({
    scope: "group",
    agent_id: null,
    coordinator_agent_id: members[0].id,
  });
  const peerView = await (
    await page.request.get(`/v1/threads/${group.id}/goals?agent_id=${members[1].id}`)
  ).json();
  expect(peerView.goals[0].id).toBe(state.goals[0].id);
  await page.getByRole("button", { name: `Detail ${groupName}` }).click();
  await page.locator('[data-panel-nav="Goals"]').click();
  await page.getByRole("button", { name: "Shared campaign report", exact: true }).click();
  await expect(page.getByText(`Koordinator: ${members[0].name}`, { exact: false })).toBeVisible();
  await expect(page.getByText(members[1].name, { exact: false }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "summary.txt", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("shared-goal-and-friendly-handoff.png") });
  const routine = await post(page, "/v1/routines", {
    thread_id: group.id,
    agent_id: members[0].id,
    instruction: "Check campaign progress",
    execution_target: { type: "auto" },
    timezone: "Asia/Makassar",
    schedule: { type: "once", at: "2050-11-02T00:00:00Z" },
  });
  expect(routine).toMatchObject({
    scope: "group",
    agent_id: null,
    execution_target: { type: "auto" },
  });
  await page.getByRole("button", { name: "Kembali ke goals", exact: true }).click();
  await page.getByRole("button", { name: "Kembali ke detail", exact: true }).click();
  await page.locator('[data-panel-nav="Routine"]').click();
  await page.getByRole("button", { name: "Check campaign progress", exact: true }).click();
  await expect(
    page.getByText("Milik grup · Pelaksana dipilih otomatis", { exact: true }),
  ).toBeVisible();
  const toggle = page.getByRole("switch", { name: "Routine Check campaign progress", exact: true });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.screenshot({ path: info.outputPath("group-routine-assignment.png") });
  await page.reload();
  await expect(page.locator("[data-collaboration-activity]")).toHaveCount(1);
  expect(
    (await snapshot()).routines.find((item: { id: string }) => item.id === routine.id).state,
  ).toBe("paused");
});
