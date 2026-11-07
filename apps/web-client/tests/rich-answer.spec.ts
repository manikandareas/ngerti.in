import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const snippet =
  'const message = "<img src=x onerror=alert(1)>";\nconsole.log(message);\n// ' +
  "A long line that should remain copyable and wrap without changing its text. ".repeat(4);
const richText = [
  "Summary before the table with **important text**, `inline code`, [safe link](https://example.com/proof), and [unsafe link](javascript:alert%281%29).",
  "<script>window.__richExecuted = true</script>",
  [
    "| Item | Count | Notes |",
    "| --- | ---: | --- |",
    "| =SUM(1,2) | 2 | **Formula stays text** |",
    "| Beta | 10 | A longer note that has several words and fits by wrapping naturally. |",
    "| Alpha | 1 | Safe [cell link](https://example.com/cell) |",
    ...Array.from(
      { length: 7 },
      (_, index) => `| Sample ${index} | ${index + 20} | Detail ${index} |`,
    ),
  ].join("\n"),
  "Follow-up after the table.",
  `\`\`\`typescript\n${snippet}\n\`\`\``,
  "```text\n| This is code | Not a table |\n| --- | --- |\n```",
].join("\n\n");

for (const theme of ["light", "dark"] as const) {
  test(`rich reply matches source blocks, table/code interactions and safe rendering (${theme})`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as Window & { __copied?: string }).__copied = text;
          },
        },
      });
    });
    // Only the assistant text projection is a fixture. Setup, events and profile updates use the real API.
    await page.route("**/v1/threads/*/snapshot", async (route) => {
      const response = await route.fetch();
      const snapshot = await response.json();
      await route.fulfill({
        response,
        json: {
          ...snapshot,
          messages: snapshot.messages.map((message: { author: string; text: string }) =>
            message.author === "agent" ? { ...message, text: richText } : message,
          ),
        },
      });
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    const answer = page.locator(".assistant-answer").first();
    await expect(
      answer.locator(":scope > .message-action-anchor > .chat-agent-bubble"),
    ).toHaveCount(2);
    await expect(answer.locator(":scope > [data-reply-table]")).toHaveCount(1);
    await expect(answer.locator("[data-code-block]")).toHaveCount(2);
    await expect(answer.locator("script,img")).toHaveCount(0);
    await expect(answer.locator('a[href^="javascript:"]')).toHaveCount(0);
    await expect(answer.getByRole("link", { name: "safe link", exact: true })).toHaveAttribute(
      "href",
      "https://example.com/proof",
    );
    expect(
      await page.evaluate(() => (window as Window & { __richExecuted?: boolean }).__richExecuted),
    ).toBeUndefined();
    const card = answer.locator("[data-table-card]");
    const table = card.getByRole("table", { name: "Tabel", exact: true });
    await expect(table.getByRole("row")).toHaveCount(11);
    await expect(table.locator("strong")).toHaveText("Formula stays text");
    const metrics = await answer.evaluate((element) => {
      const card = element.querySelector<HTMLElement>("[data-table-card]");
      const bubble = element.querySelector<HTMLElement>(
        ".chat-agent-bubble > [data-slot=bubble-content]",
      );
      const header = card?.querySelector("th");
      return {
        width: element.getBoundingClientRect().width,
        card: card?.getBoundingClientRect().width ?? 0,
        radius: card && getComputedStyle(card).borderRadius,
        font: header && getComputedStyle(header).fontSize,
        headerPadding: header && getComputedStyle(header).padding,
        bubbleLineHeight: bubble && getComputedStyle(bubble).lineHeight,
      };
    });
    expect(metrics.card).toBeGreaterThan(metrics.width * 0.87);
    expect(metrics.card).toBeLessThanOrEqual(metrics.width * 0.88 + 1);
    expect(metrics.radius).toBe("20px");
    expect(metrics.font).toBe("14px");
    expect(metrics.headerPadding).toBe("10px 16px");
    expect(metrics.bubbleLineHeight).toBe("22px");
    await table.getByRole("button", { name: "Urutkan Count", exact: true }).click();
    await expect(
      table.getByRole("columnheader", { name: "Urutkan Count", exact: true }),
    ).toHaveAttribute("aria-sort", "ascending");
    await expect(table.locator("tbody tr").first()).toContainText("Alpha");
    const agents = await page.request.get("/v1/entities/agent").then((response) => response.json());
    const tobi = agents.find((agent: { system_role: string }) => agent.system_role === "tobi");
    const updated = await page.request.post(`/v1/agents/${tobi.id}/configuration`, {
      headers: { "Idempotency-Key": crypto.randomUUID() },
      data: {
        expected_revision: tobi.revision,
        changes: { soul: `Rich rendering projection refresh ${theme}` },
      },
    });
    expect(updated.ok()).toBeTruthy();
    await expect(
      table.getByRole("columnheader", { name: "Urutkan Count", exact: true }),
    ).toHaveAttribute("aria-sort", "ascending");
    await card.hover();
    await card.getByRole("button", { name: "Salin tabel", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as Window & { __copied?: string }).__copied))
      .toContain('"\'=SUM(1,2)"');
    const tableDownload = page.waitForEvent("download");
    await card.getByRole("button", { name: "Unduh tabel", exact: true }).click();
    const savedTable = await tableDownload;
    expect(savedTable.suggestedFilename()).toBe("Tabel.csv");
    const csvPath = await savedTable.path();
    expect(csvPath).toBeTruthy();
    const csv = await readFile(csvPath ?? "", "utf8");
    expect(csv).toContain("\uFEFFItem,Count,Notes");
    expect(csv).toContain('"\'=SUM(1,2)"');
    const expand = card.getByRole("button", { name: "Perbesar tabel", exact: true });
    await expand.click();
    const dialog = page.getByRole("region", { name: "Viewer Tabel", exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Salin tabel", exact: true }).click();
    await expect(dialog.locator("footer")).toContainText("Tabel disalin.");
    await expect(dialog.locator('footer [role="status"]').first()).toHaveCSS("font-size", "11px");
    await dialog.getByRole("textbox", { name: "Cari dalam tabel", exact: true }).fill("Alpha");
    await expect(dialog.getByRole("table").locator("tbody tr")).toHaveCount(1);
    const wrapTable = dialog.getByRole("button", { name: "Bungkus teks", exact: true });
    await wrapTable.click();
    await expect(wrapTable).toHaveAttribute("aria-pressed", "false");
    await page.screenshot({ path: info.outputPath(`table-expanded-${theme}.png`) });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(expand).toBeFocused();
    await card.getByRole("textbox", { name: "Cari dalam tabel", exact: true }).fill("");
    const code = answer.locator("[data-code-block]").first();
    await code.scrollIntoViewIfNeeded();
    await code.hover();
    await expect(code.locator("pre")).toHaveCSS("font-size", "13px");
    await expect(code.locator("pre")).toHaveCSS("line-height", "20px");
    await code.getByRole("button", { name: "Salin kode", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as Window & { __copied?: string }).__copied))
      .toBe(snippet);
    await code.getByRole("button", { name: "Opsi kode", exact: true }).click();
    await page.getByRole("menuitemcheckbox", { name: "Bungkus baris", exact: true }).click();
    await expect(code.locator("pre")).toHaveCSS("white-space", "pre-wrap");
    await code.getByRole("button", { name: "Opsi kode", exact: true }).click();
    const codeDownload = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Simpan sebagai file", exact: true }).click();
    const savedCode = await codeDownload;
    expect(savedCode.suggestedFilename()).toBe("snippet.ts");
    const codePath = await savedCode.path();
    expect(await readFile(codePath ?? "", "utf8")).toBe(snippet);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`rich-answer-${theme}.png`) });
  });
}

test("long reply tables virtualize, scroll to the last row and filter without dropping data", async ({
  page,
}, info) => {
  const text = [
    "| Name | Value |",
    "| --- | ---: |",
    ...Array.from({ length: 120 }, (_, index) => `| Row ${index} | ${index} |`),
  ].join("\n");
  await page.route("**/v1/threads/*/snapshot", async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    await route.fulfill({
      response,
      json: {
        ...snapshot,
        messages: snapshot.messages.map((message: { author: string; text: string }) =>
          message.author === "agent" ? { ...message, text } : message,
        ),
      },
    });
  });
  await page.goto("/");
  const card = page.locator("[data-table-card]").first();
  const table = card.getByRole("table", { name: "Tabel", exact: true });
  await expect(table).toHaveAttribute("aria-rowcount", "121");
  expect(await table.locator("tbody tr").count()).toBeLessThan(120);
  const scroll = card.getByRole("region", { name: "Tabel", exact: true });
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(table.getByText("Row 119", { exact: true })).toBeVisible();
  await card.getByRole("textbox", { name: "Cari dalam tabel", exact: true }).fill("Row 119");
  await expect(table).toHaveAttribute("aria-rowcount", "2");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table.getByText("Row 119", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("long-table-filtered.png") });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
});
