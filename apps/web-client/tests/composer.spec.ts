import { expect, type Page, test } from "@playwright/test";

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function setup(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const connection = await post(page, "/v1/connections", {
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const agent = await post(page, "/v1/agents", {
    name: `Inline files ${crypto.randomUUID().slice(0, 8)}`,
    harness: "codex",
    connection_id: connection.id,
    model_id: "fixture",
    billing_source: "subscription",
  });
  const thread = await post(page, `/v1/agents/${agent.id}/dm`, {});
  const warmup = await post(page, "/v1/runs", {
    agent_id: agent.id,
    thread_id: thread.id,
    text: "fixture warmup",
  });
  await expect
    .poll(
      async () => {
        const snapshot = await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json();
        return snapshot.runs.find((run: { id: string }) => run.id === warmup.run.id)?.status;
      },
      { timeout: 20000 },
    )
    .toBe("succeeded");
  await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), thread.id);
  await page.reload();
  await expect(
    page.getByRole("button", { name: `Detail ${agent.name}`, exact: true }),
  ).toBeVisible();
  const composer = page.getByRole("textbox", { name: "Pesan", exact: true });
  await expect(composer).toBeEditable();
  return { agent, thread, composer };
}
const documentFile = (name: string, text = "Fixture document") => ({
  name,
  mimeType: "text/plain",
  buffer: Buffer.from(text),
});

test("expanded composer keeps full-width text above the attachment and send toolbar", async ({
  page,
}, info) => {
  const { composer } = await setup(page);
  const form = page.locator(".conversation-composer");
  await composer.fill("Tinjau ringkasan ini.\nPeriksa rujukan halaman dan simpan catatan review.");
  await expect(form).toHaveAttribute("data-multiline", "true");
  const geometry = await form.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const editor = element.querySelector(".composer-editor")?.getBoundingClientRect();
    const attach = element.querySelector(".composer-attach")?.getBoundingClientRect();
    const send = element.querySelector(".composer-send")?.getBoundingClientRect();
    if (!editor || !attach || !send) throw new Error("The composer controls are missing.");
    const style = getComputedStyle(element);
    return {
      toolbarCenterOffset: Math.abs(attach.y + attach.height / 2 - send.y - send.height / 2),
      editorToolbarGap: Math.min(attach.top, send.top) - editor.bottom,
      textLeftInset: editor.left - box.left,
      textRightInset: box.right - editor.right,
      attachLeftInset: attach.left - box.left,
      sendRightInset: box.right - send.right,
      padding: parseFloat(style.paddingLeft),
    };
  });
  expect(geometry.toolbarCenterOffset).toBeLessThan(1);
  expect(geometry.editorToolbarGap).toBeGreaterThanOrEqual(8);
  expect(geometry.textLeftInset).toBeCloseTo(geometry.padding, 0);
  expect(geometry.textRightInset).toBeCloseTo(geometry.padding, 0);
  expect(geometry.attachLeftInset).toBeCloseTo(geometry.padding, 0);
  expect(geometry.sendRightInset).toBeCloseTo(geometry.padding, 0);
  await page.screenshot({ path: info.outputPath("expanded-composer-toolbar.png") });
  await form.screenshot({ path: info.outputPath("expanded-composer-closeup.png") });
  await composer.press("ControlOrMeta+a");
  await composer.press("Backspace");
  await expect(form).not.toHaveAttribute("data-multiline");

  await composer.fill("m");
  for (let batch = 0; batch < 60 && !(await form.getAttribute("data-multiline")); batch++)
    await composer.pressSequentially("mmmm");
  await expect(form).toHaveAttribute("data-multiline", "true");
  const stable = await form.evaluate(async (element) => {
    const states = [];
    for (let frame = 0; frame < 12; frame++) {
      await new Promise(requestAnimationFrame);
      states.push(element.getAttribute("data-multiline"));
    }
    return states.every((value) => value === "true");
  });
  expect(stable).toBe(true);
  await composer.press("ControlOrMeta+a");
  await composer.press("Backspace");
  await expect(form).not.toHaveAttribute("data-multiline");
  await info.attach("composer-geometry.json", {
    body: JSON.stringify(geometry, null, 2),
    contentType: "application/json",
  });
});

test("inline chips align with surrounding text, keep default gaps and allow file-only sends", async ({
  page,
}, info) => {
  const { composer } = await setup(page);
  await composer.fill("Baca");
  await page
    .getByLabel("Lampirkan file ke pesan", { exact: true })
    .setInputFiles([documentFile("a.txt"), documentFile("b.txt")]);
  await expect(composer.locator('[data-upload-state="local"]')).toHaveCount(2);
  const geometry = await composer.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode();
    while (text && !text.textContent?.includes("Baca")) text = walker.nextNode();
    if (!text) throw new Error("Missing surrounding text");
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 4);
    const textBox = range.getBoundingClientRect();
    const [first, second] = [...element.querySelectorAll("[data-attachment-chip]")].map((chip) =>
      chip.getBoundingClientRect(),
    );
    return {
      verticalDifference: Math.abs(textBox.y + textBox.height / 2 - first.y - first.height / 2),
      gap: second.x - first.right,
      sameLine: Math.abs(first.y - second.y) < 3,
    };
  });
  expect(geometry.verticalDifference).toBeLessThanOrEqual(3);
  if (geometry.sameLine) {
    expect(geometry.gap).toBeGreaterThanOrEqual(3);
    expect(geometry.gap).toBeLessThanOrEqual(5);
  }
  await page.screenshot({ path: info.outputPath("inline-attachment-alignment.png") });
  await composer.press("ControlOrMeta+a");
  await composer.press("ArrowLeft");
  for (let i = 0; i < 4; i++) await composer.press("Delete");
  await expect(composer.locator("[data-attachment-chip]")).toHaveCount(2);
  const sent = page.waitForRequest(
    (request) => request.url().endsWith("/v1/runs") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  const body = (await sent).postDataJSON();
  expect(body.artifact_ids).toHaveLength(2);
  expect(body.text).not.toContain("Baca");
  await expect(composer).toHaveText("");
});

test("long filenames leave only one normal space before the following text", async ({
  page,
}, info) => {
  const { composer } = await setup(page);
  const name =
    "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks - a long document filename.txt";
  await page
    .getByLabel("Lampirkan file ke pesan", { exact: true })
    .setInputFiles(documentFile(name));
  await expect(composer.locator('[data-upload-state="local"]')).toHaveCount(1);
  await page.keyboard.insertText("pelajari dokumen ini");
  const boxes = await composer.evaluate((element) => {
    const host = element.querySelector(".composer-attachment-node");
    const chip = element.querySelector("[data-attachment-chip]");
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && !node.textContent?.includes("pelajari")) node = walker.nextNode();
    if (!host || !chip || !node) throw new Error("Missing inline attachment or text");
    const offset = node.textContent?.indexOf("pelajari") ?? 0;
    const range = document.createRange();
    range.setStart(node, offset);
    range.setEnd(node, offset + 8);
    const text = range.getBoundingClientRect();
    const file = chip.getBoundingClientRect();
    return {
      host: host.getBoundingClientRect().width,
      chip: file.width,
      gap: text.left - file.right,
      sameLine: Math.abs(text.top + text.height / 2 - file.top - file.height / 2) <= 3,
    };
  });
  await page.screenshot({ path: info.outputPath("long-filename-spacing.png") });
  expect(boxes.host - boxes.chip).toBeLessThanOrEqual(1);
  if (boxes.sameLine) expect(boxes.gap).toBeLessThanOrEqual(5);
  expect(
    await composer.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
});

test("files stay inline at the cursor and send stable references in sentence order", async ({
  page,
}, info) => {
  const { thread, composer } = await setup(page);
  const sentence = "Pelajari dokumen ini, lalu bandingkan dengan ";
  await composer.fill(sentence);
  await composer.press("ControlOrMeta+a");
  await composer.press("ArrowLeft");
  await expect
    .poll(() =>
      composer.evaluate((element) => {
        const selection = window.getSelection();
        return (
          selection?.isCollapsed &&
          selection.anchorOffset === 0 &&
          element.contains(selection.anchorNode)
        );
      }),
    )
    .toBe(true);
  await page
    .getByLabel("Lampirkan file ke pesan", { exact: true })
    .setInputFiles(documentFile("dokumen [utama].txt", "First document"));
  await expect(composer.locator('[data-upload-state="local"]')).toHaveCount(1);
  await composer.press("ControlOrMeta+a");
  await composer.press("ArrowRight");
  await expect.poll(() => composer.evaluate(() => window.getSelection()?.isCollapsed)).toBe(true);
  await page
    .getByLabel("Lampirkan file ke pesan", { exact: true })
    .setInputFiles(documentFile("dokumen [utama].txt", "Second document"));
  await expect(composer.locator('[data-upload-state="local"]')).toHaveCount(2);
  await expect(page.locator(".composer-dock > fieldset")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("inline-file-composer.png") });
  const sent = page.waitForRequest(
    (request) => request.url().endsWith("/v1/runs") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  const body = (await sent).postDataJSON();
  expect(body.artifact_ids).toHaveLength(2);
  expect(body.artifact_ids[0]).not.toBe(body.artifact_ids[1]);
  expect(body.text).toBe(
    `[dokumen \\[utama\\].txt](ngertiin://file/${body.artifact_ids[0]}) ${sentence}[dokumen \\[utama\\].txt](ngertiin://file/${body.artifact_ids[1]}) `,
  );
  await expect(composer).toHaveText("");
  await expect(page.locator(".chat-user-bubble [data-attachment-chip]")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".chat-user-bubble [data-attachment-chip]")).toHaveCount(2);
  const snapshot = await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json();
  expect(
    snapshot.messages.find((message: { text: string }) => message.text === body.text).artifact_ids,
  ).toEqual(body.artifact_ids);
});

test("files stay local until submit and a lost upload reply retries the same operation", async ({
  page,
}, info) => {
  const { thread, composer } = await setup(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const keys: string[] = [];
  let calls = 0;
  await page.route("**/v1/message-uploads", async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    calls++;
    if (calls === 1) {
      await gate;
      await route.fetch();
      await route.abort("failed");
    } else await route.fulfill({ response: await route.fetch() });
  });
  await composer.fill("Pelajari ");
  await page
    .getByLabel("Lampirkan file ke pesan", { exact: true })
    .setInputFiles(documentFile("laporan.txt"));
  const chip = composer.locator("[data-attachment-chip]");
  await expect(chip).toHaveAttribute("data-upload-state", "local");
  expect(calls).toBe(0);
  expect(
    (await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json()).artifacts,
  ).toHaveLength(0);
  await composer.press("ControlOrMeta+a");
  await composer.press("ArrowRight");
  await page.keyboard.insertText("dan simpan kesimpulannya.");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(chip).toHaveAttribute("data-upload-state", "uploading");
  await expect(composer).not.toBeEditable();
  expect(
    (await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json()).artifacts,
  ).toHaveLength(0);
  await page.screenshot({ path: info.outputPath("submit-file-uploading.png") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await chip.evaluate((element) => getComputedStyle(element, "::after").animationName)).toBe(
    "none",
  );
  release();
  await expect(chip).toHaveAttribute("data-upload-state", "failed");
  await expect(page.getByRole("button", { name: "Periksa pengiriman", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Periksa pengiriman", exact: true }).click();
  await expect(composer).toHaveText("");
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  expect(
    (await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json()).artifacts,
  ).toHaveLength(1);
});

test("removing a selected file never uploads it and status stays behind its icon", async ({
  page,
}, info) => {
  const { thread, composer } = await setup(page);
  let uploads = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/v1/message-uploads")) uploads++;
  });
  await page
    .getByLabel("Lampirkan file ke pesan", { exact: true })
    .setInputFiles(documentFile("wrong-file.txt"));
  const status = composer.getByRole("button", { name: "Pratinjau wrong-file.txt", exact: true });
  await expect(status.locator("svg").first()).toHaveCount(1);
  await expect(
    composer.getByRole("button", { name: "Status wrong-file.txt", exact: true }),
  ).toHaveCount(0);
  if (info.project.name === "mobile") await status.tap();
  else await status.hover();
  const details = page.locator(
    info.project.name === "mobile"
      ? '[data-slot="popover-content"]'
      : '[data-slot="tooltip-content"]',
  );
  await expect(details.getByText("wrong-file.txt", { exact: true })).toBeVisible();
  await expect(details).toContainText("TXT · 16 B");
  expect((await details.boundingBox())?.width).toBeLessThanOrEqual(256);
  await expect(page.getByText("Belum dikirim.", { exact: true })).toHaveCount(0);
  await page
    .locator('[data-slot="popover-content"], [data-slot="tooltip-content"]')
    .evaluateAll(async (items) => {
      await Promise.all(
        items
          .flatMap((item) => item.getAnimations())
          .filter((animation) =>
            Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)),
          )
          .map((animation) => animation.finished),
      );
    });
  await page.screenshot({ path: info.outputPath("attachment-status-tooltip.png") });
  await page.keyboard.press("Escape");
  await composer
    .getByRole("button", { name: "Hapus lampiran wrong-file.txt", exact: true })
    .click();
  await expect(composer.locator("[data-attachment-chip]")).toHaveCount(0);
  await composer.fill("Pesan tanpa file");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(composer).toHaveText("");
  expect(uploads).toBe(0);
  expect(
    (await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json()).artifacts,
  ).toHaveLength(0);
});

test("image chips preview through shadcn overlays and remove, undo and paste as whole objects", async ({
  page,
}, info) => {
  const { composer } = await setup(page);
  await composer.fill("Lihat gambar ini ");
  await page
    .getByLabel("Lampirkan file ke pesan", { exact: true })
    .setInputFiles("../../docs/verification/nma-059/visual-input.png");
  const chip = composer.locator("[data-attachment-chip]");
  await expect(chip).toHaveAttribute("data-upload-state", "local");
  const preview = composer.getByRole("button", { name: "Pratinjau visual-input.png", exact: true });
  if (info.project.name === "mobile") await preview.tap();
  else await preview.hover();
  const overlay = page.locator(
    info.project.name === "mobile"
      ? '[data-slot="popover-content"]'
      : '[data-slot="tooltip-content"]',
  );
  await expect(
    overlay.getByRole("img", { name: "Pratinjau visual-input.png", exact: true }),
  ).toBeVisible();
  await expect(overlay).toContainText("visual-input.png");
  expect((await overlay.boundingBox())?.width).toBeLessThanOrEqual(256);
  await page.screenshot({ path: info.outputPath("inline-image-preview.png") });
  await page.keyboard.press("Escape");
  await chip.hover();
  await composer
    .getByRole("button", { name: "Hapus lampiran visual-input.png", exact: true })
    .click();
  await expect(chip).toHaveCount(0);
  await composer.press("ControlOrMeta+z");
  await expect(chip).toHaveCount(1);
  await composer.press("ControlOrMeta+a");
  const copied = await composer.evaluate((element) => {
    const data = new DataTransfer();
    element.dispatchEvent(
      new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }),
    );
    return {
      text: data.getData("text/plain"),
      content: data.getData("application/x-ngertiin-composer"),
    };
  });
  expect(copied.text).toContain("visual-input.png");
  expect(copied.text).not.toContain("ngertiin://");
  await composer.fill("");
  await composer.evaluate((element, content) => {
    const data = new DataTransfer();
    data.setData("application/x-ngertiin-composer", content);
    element.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, copied.content);
  await expect(chip).toHaveCount(1);
  await expect(composer).toContainText("Lihat gambar ini");
  await composer.press("ControlOrMeta+a");
  await composer.press("ArrowRight");
  await composer.press("Backspace");
  await composer.press("Backspace");
  await expect(chip).toHaveCount(0);
  await expect(composer).toContainText("Lihat gambar ini");
});

test("a rejected second file restores an editable draft without publishing the first file", async ({
  page,
}) => {
  const { thread, composer } = await setup(page);
  await page
    .getByLabel("Lampirkan file ke pesan", { exact: true })
    .setInputFiles([documentFile("keep.txt"), documentFile("remove.txt")]);
  await page.route("**/v1/message-uploads", async (route) => {
    if (route.request().postDataJSON().name === "remove.txt")
      await route.fulfill({
        status: 422,
        json: { error: { code: "INVALID_REQUEST", message: "Fixture rejection." } },
      });
    else await route.fulfill({ response: await route.fetch() });
  });
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(composer).toBeEditable();
  await expect(composer.locator('[data-upload-state="local"]')).toHaveCount(2);
  expect(
    (await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json()).artifacts,
  ).toHaveLength(0);
  await composer.getByRole("button", { name: "Hapus lampiran remove.txt", exact: true }).click();
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(composer).toHaveText("");
  expect(
    (await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json()).artifacts,
  ).toHaveLength(1);
});

test("pending sends restore inline file references and replay the exact message after reload", async ({
  page,
}) => {
  const { thread, composer } = await setup(page);
  await composer.fill("Baca ");
  await page
    .getByLabel("Lampirkan file ke pesan", { exact: true })
    .setInputFiles(documentFile("pending.txt"));
  await expect(composer.locator('[data-upload-state="local"]')).toHaveCount(1);
  const operations: { key: string; body: unknown }[] = [];
  await page.route("**/v1/runs", async (route) => {
    operations.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postDataJSON(),
    });
    const response = await route.fetch();
    if (operations.length === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(page.getByRole("button", { name: "Periksa pengiriman", exact: true })).toBeVisible();
  await page.reload();
  await expect(composer.locator('[data-upload-state="local"]')).toHaveCount(1);
  await expect(composer).not.toBeEditable();
  await expect(
    composer.getByRole("button", { name: "Hapus lampiran pending.txt", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Periksa pengiriman", exact: true }).click();
  await expect(composer).toHaveText("");
  expect(operations).toHaveLength(1);
  const snapshot = await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json();
  expect(snapshot.runs).toHaveLength(2);
  expect(snapshot.artifacts).toHaveLength(1);
});
