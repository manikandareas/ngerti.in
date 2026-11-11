import { createRequire } from "node:module";
import { expect, type Page, test } from "@playwright/test";
import { withTimeline } from "./conversation-fixture.js";

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("a large roster paints the conversation before preparing only visible avatars", async ({
  page,
}, info) => {
  const ids = Array.from({ length: 100 }, () => crypto.randomUUID());
  await page.route("**/v1/entities/agent", async (route) => {
    const response = await route.fetch();
    const agents = await response.json();
    await route.fulfill({
      response,
      json: [
        ...agents,
        ...ids.map((id, index) => ({
          ...agents[0],
          id,
          name: `Roster member ${index}`,
          system_role: null,
          avatar_config: { ...agents[0].avatar_config, seed: id },
        })),
      ],
    });
  });
  await page.route("**/v1/entities/thread", async (route) => {
    const response = await route.fetch();
    const threads = await response.json();
    await route.fulfill({
      response,
      json: [
        ...threads,
        ...ids.map((id) => ({
          ...threads[0],
          id: `thread-${id}`,
          type: "dm",
          name: null,
          member_agent_ids: [id],
        })),
      ],
    });
  });
  const started = Date.now();
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const paintMs = Date.now() - started;
  const sidebar = page.getByRole("button", { name: "Percakapan", exact: true });
  if (await sidebar.isVisible()) await sidebar.click();
  const navigation = page.getByRole("navigation", { name: "Percakapan", exact: true });
  const last = navigation.locator(`[data-thread-id="thread-${ids.at(-1)}"]`);
  await expect(last).toHaveCount(1);
  expect(await navigation.locator(".ngertiin-avatar svg").count()).toBeLessThan(30);
  await expect(last.locator("svg")).toHaveCount(0);
  await last.scrollIntoViewIfNeeded();
  await expect(last.locator(".ngertiin-avatar svg")).toHaveCount(1);
  await expect.poll(() => navigation.locator(".ngertiin-avatar svg").count()).toBeLessThan(30);
  await info.attach("large-roster.json", {
    contentType: "application/json",
    body: JSON.stringify({
      synthetic_members: ids.length,
      paint_ms: paintMs,
      mounted_avatars: await navigation.locator(".ngertiin-avatar svg").count(),
      navigation_html_bytes: await navigation.evaluate((element) => element.outerHTML.length),
    }),
  });
});

test("stored message times appear for users and agents in both DM and group", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const agent = await post(page, "/v1/agents", {
    name: "Timestamp agent",
    harness: "codex",
    connection_id: null,
  });
  const dm = await post(page, `/v1/agents/${agent.id}/dm`, {});
  const setup = { agent_id: agent.id, thread_id: dm.id };
  const welcome = { id: "timed-dm-answer", created_at: "2026-11-02T12:40:00.000Z" };
  await page.route(`**/v1/threads/${dm.id}/snapshot`, async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    await route.fulfill({
      response,
      json: withTimeline({
        ...snapshot,
        messages: [
          ...snapshot.messages,
          {
            ...welcome,
            revision: 1,
            thread_id: dm.id,
            author: "agent",
            author_agent_id: agent.id,
            state: "complete",
            run_id: null,
            artifact_ids: [],
            purpose: "conversation",
            text: "Balasan agent di DM.",
          },
        ],
      }),
    });
  });
  await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), dm.id);
  await page.reload();
  await expect(page.locator(`#message-${welcome.id} .message-time`)).toHaveAttribute(
    "datetime",
    welcome.created_at,
  );
  const sent = await post(page, "/v1/runs", {
    thread_id: setup.thread_id,
    agent_id: setup.agent_id,
    text: "Jam untuk pesan DM",
  });
  const dmTime = page.locator(`#message-${sent.message.id} .chat-user-bubble .message-time`);
  await expect(dmTime).toHaveAttribute("datetime", sent.message.created_at);
  await expect(dmTime).toHaveText(/^\d{2}\.\d{2}$/);
  await page.screenshot({ path: info.outputPath("dm-message-times.png") });
  const group = await post(page, "/v1/threads", {
    type: "group",
    member_agent_ids: [setup.agent_id],
  });
  const sentGroup = await post(page, "/v1/runs", {
    thread_id: group.id,
    agent_id: setup.agent_id,
    text: "Jam untuk pesan grup",
  });
  await page.route(`**/v1/threads/${group.id}/snapshot`, async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    await route.fulfill({
      response,
      json: withTimeline({
        ...snapshot,
        messages: [
          ...snapshot.messages,
          {
            id: "timed-group-answer",
            revision: 1,
            created_at: "2026-11-02T12:43:00.000Z",
            thread_id: group.id,
            author: "agent",
            author_agent_id: setup.agent_id,
            state: "complete",
            run_id: null,
            artifact_ids: [],
            purpose: "conversation",
            text: "Jam balasan agent di grup.",
          },
        ],
      }),
    });
  });
  await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), group.id);
  await page.reload();
  const groupTime = page.locator(
    `#message-${sentGroup.message.id} .chat-user-bubble .message-time`,
  );
  await expect(groupTime).toHaveAttribute("datetime", sentGroup.message.created_at);
  await expect(page.locator(".group-agent-bubble .message-time")).toHaveAttribute(
    "datetime",
    "2026-11-02T12:43:00.000Z",
  );
  await page.screenshot({ path: info.outputPath("group-message-times.png") });
  await page.reload();
  await expect(groupTime).toHaveAttribute("datetime", sentGroup.message.created_at);
});

for (const theme of ["light", "dark"] as const) {
  test(`group bubble keeps compact headings and saved time around rich content (${theme})`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
    const agent = await post(page, "/v1/agents", {
      name: "Agent dengan nama panjang untuk percakapan bersama",
      harness: "codex",
      connection_id: null,
    });
    const group = await post(page, "/v1/threads", { type: "group", member_agent_ids: [agent.id] });
    const sentAt = "2026-11-02T12:43:00.000Z";
    await page.route(`**/v1/threads/${group.id}/snapshot`, async (route) => {
      const response = await route.fetch();
      const snapshot = await response.json();
      await route.fulfill({
        response,
        json: withTimeline({
          ...snapshot,
          messages: [
            {
              id: "group-rich-answer",
              revision: 1,
              created_at: sentAt,
              thread_id: group.id,
              author: "agent",
              author_agent_id: agent.id,
              state: "partial",
              run_id: null,
              artifact_ids: [],
              purpose: "conversation",
              text: "Hasil pekerjaan bersama.\n\n# Heading one\n\n## Heading two\n\n### Heading three\n\n#### Heading four\n\n##### Heading five\n\n###### Heading six\n\n| Langkah | Status |\n| --- | --- |\n| Periksa dokumen | Selesai |\n\n```ts\nconst result = 'ready';\n```",
            },
          ],
        }),
      });
    });
    await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), group.id);
    await page.reload();
    if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 844 });
    const bubble = page.locator(".group-agent-bubble");
    await expect(bubble).toHaveCount(1);
    await expect(bubble.locator(".group-bubble-author")).toHaveCount(0);
    await expect(bubble.getByRole("heading")).toHaveCount(6);
    const typography = await bubble.evaluate((element) => {
      const paragraph = getComputedStyle(element.querySelector(".chat-md > p") as Element);
      return Array.from(element.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((heading) => {
        const style = getComputedStyle(heading);
        return {
          size: style.fontSize,
          line: style.lineHeight,
          paragraphSize: paragraph.fontSize,
          paragraphLine: paragraph.lineHeight,
        };
      });
    });
    expect(
      typography.every(
        (heading) =>
          heading.size === heading.paragraphSize && heading.line === heading.paragraphLine,
      ),
    ).toBe(true);
    await expect(bubble.getByRole("table", { name: "Tabel", exact: true })).toBeVisible();
    await expect(bubble.locator("[data-code-block]")).toHaveCount(1);
    await expect(bubble.locator("time")).toHaveAttribute("datetime", sentAt);
    const expectedTime = await page.evaluate(
      (value) =>
        new Date(value).toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }),
      sentAt,
    );
    await expect(bubble.locator("time")).toHaveText(expectedTime);
    const bounds = await bubble.evaluate((element) => {
      const bubble = element.getBoundingClientRect();
      const time = element.querySelector("time")?.getBoundingClientRect();
      return {
        contained:
          !!time &&
          time.x >= bubble.x &&
          time.right <= bubble.right &&
          time.bottom <= bubble.bottom,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(bounds).toEqual({ contained: true, overflow: false });
    await page.addScriptTag({
      path: createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
    });
    const violations = await page.evaluate(async () => {
      const axe = (
        window as unknown as {
          axe: {
            run(
              context: string,
              options: unknown,
            ): Promise<{
              violations: { id: string; nodes: { target: string[]; failureSummary: string }[] }[];
            }>;
          };
        }
      ).axe;
      return (await axe.run(".group-agent-bubble", { runOnly: ["color-contrast"] })).violations.map(
        (issue) => ({ id: issue.id, nodes: issue.nodes }),
      );
    });
    expect(violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`group-bubble-${theme}.png`) });
    await page.getByRole("button", { name: `Profil ${agent.name}`, exact: true }).click();
    await expect(
      page.getByRole("button", { name: `Sapa ${agent.name}`, exact: true }),
    ).toBeVisible();
  });
}

test("saved avatar identity appears outside the left of group replies and survives reload", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const agents = await page.request.get("/v1/entities/agent").then((response) => response.json());
  const tobi = agents.find((agent: { system_role: string }) => agent.system_role === "tobi");
  await page.goto(`/avatar-studio?agent=${tobi.id}`);
  await page.getByRole("radio", { name: "Hexagon", exact: true }).check();
  await page.getByRole("radio", { name: "Mint", exact: true }).check();
  await page.getByRole("button", { name: "Gunakan untuk Tobi", exact: true }).click();
  await expect(page.getByText("Avatar tersimpan untuk Tobi.", { exact: true })).toBeVisible();
  const saved = await page.request
    .get(`/v1/entities/agent/${tobi.id}`)
    .then((response) => response.json());
  expect(saved.avatar_config).toMatchObject({
    seed: tobi.avatar_config.seed,
    shape: "hexagon",
    color: "mint",
  });
  const peer = await post(page, "/v1/agents", {
    name: `Avatar peer ${crypto.randomUUID()}`,
    harness: "muse",
    connection_id: null,
  });
  const group = await post(page, "/v1/threads", {
    type: "group",
    member_agent_ids: [tobi.id, peer.id],
  });
  await page.route(`**/v1/threads/${group.id}/snapshot`, async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    await route.fulfill({
      response,
      json: withTimeline({
        ...snapshot,
        messages: [tobi, peer].map((agent, index) => ({
          id: `avatar-answer-${index}`,
          revision: 1,
          created_at: new Date(1700000000000 + index).toISOString(),
          thread_id: group.id,
          author: "agent",
          author_agent_id: agent.id,
          text: `Reply from ${agent.name}`,
          state: "complete",
          run_id: null,
          artifact_ids: [],
          purpose: "conversation",
        })),
      }),
    });
  });
  await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), group.id);
  await page.goto("/");
  const portraits = page.locator(".conversation-message .group-message-avatar");
  await expect(portraits).toHaveCount(2);
  await expect(portraits.first().locator(".agent-avatar")).toHaveAttribute(
    "data-avatar-seed",
    saved.avatar_config.seed,
  );
  for (const message of await page.locator(".conversation-message").all()) {
    await message.scrollIntoViewIfNeeded();
    await expect(message.locator(".group-message-avatar .ngertiin-avatar > svg")).toBeVisible();
    const avatar = await message.locator(".group-message-avatar").boundingBox();
    const bubble = await message.locator(".chat-agent-bubble").boundingBox();
    expect(avatar && bubble && avatar.x + avatar.width <= bubble.x).toBeTruthy();
    const content = message.locator('.group-agent-bubble > [data-slot="bubble-content"]');
    await expect(content.locator(".group-bubble-author")).toHaveCount(0);
    await expect(content.locator("time")).toHaveText(/^\d{2}\.\d{2}$/);
    await expect(content.locator("time")).toHaveAttribute(
      "datetime",
      /^2023-11-14T22:13:20\.00[01]Z$/,
    );
    await expect(message.locator(".message-author")).toHaveCount(0);
  }
  await expect(page.locator(".group-bubble-author")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("group-avatar.png") });
  await portraits.first().click();
  await expect(page.getByRole("button", { name: "Sapa Tobi", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sapa Tobi", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sapa Tobi", exact: true }).locator(".ngertiin-avatar"),
  ).toHaveAttribute("data-avatar-action", "boop");
  await page.screenshot({ path: info.outputPath("member-profile.png") });
  await page.reload();
  await expect(page.locator(".conversation-message .group-message-avatar")).toHaveCount(2);
  await expect(page.locator(".conversation-message .agent-avatar").first()).toHaveAttribute(
    "data-avatar-seed",
    saved.avatar_config.seed,
  );
  await expect(page.locator(".group-bubble-time")).toHaveCount(2);
  if (info.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath("group-avatar-320.png") });
  }
});

test("avatar activity follows live refreshes, celebrates once and keeps DM/group activity separate", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const setup = await post(page, "/v1/setup", {});
  const peer = await post(page, "/v1/agents", {
    name: `State peer ${crypto.randomUUID()}`,
    harness: "codex",
    connection_id: null,
  });
  const group = await post(page, "/v1/threads", {
    type: "group",
    member_agent_ids: [setup.agent_id, peer.id],
  });
  let phase = { status: "running", activity: "generating", waiting_for_user: false };
  const runId = crypto.randomUUID();
  await page.route("**/v1/agents/activity", async (route) => {
    const response = await route.fetch();
    const value = await response.json();
    await route.fulfill({
      response,
      json: {
        ...value,
        items: [
          { agent_id: setup.agent_id, thread_id: setup.thread_id, run_id: runId, ...phase },
          {
            agent_id: setup.agent_id,
            thread_id: group.id,
            run_id: crypto.randomUUID(),
            status: "running",
            activity: "tool_running",
            waiting_for_user: false,
          },
        ],
      },
    });
  });
  await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), setup.thread_id);
  await page.reload();
  const header = page.locator(".header-identity .ngertiin-avatar");
  await expect(header).toHaveAttribute("data-avatar-state", "thinking");
  await expect(header).toHaveAttribute("data-avatar-loading", "true");
  await expect(header.locator("[data-avatar-surface] image")).toHaveAttribute(
    "href",
    /^data:image\/png;base64,/,
  );
  async function change(next: typeof phase) {
    phase = next;
    const agent = await page.request
      .get(`/v1/entities/agent/${setup.agent_id}`)
      .then((response) => response.json());
    await post(page, `/v1/agents/${setup.agent_id}/configuration`, {
      expected_revision: agent.revision,
      changes: { soul: agent.soul },
    });
  }
  await page.getByRole("button", { name: "Detail Tobi", exact: true }).click();
  const profile = page.getByRole("button", { name: "Sapa Tobi", exact: true });
  await expect(profile).toBeVisible();
  const portrait = profile.locator(".ngertiin-avatar");
  await expect(portrait).toHaveAttribute("data-avatar-loading", "true");
  await change({ ...phase, activity: "tool_running" });
  await expect(header).toHaveAttribute("data-avatar-state", "working");
  await expect(portrait).toHaveAttribute("data-avatar-loading", "true");
  await change({ ...phase, waiting_for_user: true });
  await expect(header).toHaveAttribute("data-avatar-state", "listening");
  await expect(portrait).toHaveAttribute("data-avatar-loading", "false");
  await change({ ...phase, status: "cancel_requested" });
  await expect(header).toHaveAttribute("data-avatar-state", "working");
  await expect(portrait).toHaveAttribute("data-avatar-loading", "true");
  await expect(page.locator(".header-identity .agent-avatar")).toHaveAttribute(
    "data-activity-label",
    "Stopping…",
  );
  await change({ status: "unknown", activity: "unknown", waiting_for_user: false });
  await expect(header).toHaveAttribute("data-avatar-state", "error");
  await expect(portrait).toHaveAttribute("data-avatar-loading", "false");
  await change({ status: "succeeded", activity: "idle", waiting_for_user: false });
  await expect(header).toHaveAttribute("data-avatar-state", "celebrating");
  await expect(header).toHaveAttribute("data-avatar-state", "idle");
  await page.reload();
  await expect(header).toHaveAttribute("data-avatar-state", "idle");
  await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), group.id);
  await page.reload();
  await expect(
    page.locator(`.header-identity [data-agent-id="${setup.agent_id}"] .ngertiin-avatar`),
  ).toHaveAttribute("data-avatar-state", "working");
  await expect(
    page.locator(`.header-identity [data-agent-id="${peer.id}"] .ngertiin-avatar`),
  ).toHaveAttribute("data-avatar-state", "idle");
  await page.locator(".header-identity").click();
  const groupHero = page.locator(".context-hero");
  await expect(
    groupHero.locator(`[data-agent-id="${setup.agent_id}"] .ngertiin-avatar`),
  ).toHaveAttribute("data-avatar-loading", "true");
  await expect(groupHero.locator(`[data-agent-id="${peer.id}"] .ngertiin-avatar`)).toHaveAttribute(
    "data-avatar-loading",
    "false",
  );
  await page.getByRole("button", { name: `Member profile Tobi`, exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sapa Tobi", exact: true }).locator(".ngertiin-avatar"),
  ).toHaveAttribute("data-avatar-loading", "true");
});
