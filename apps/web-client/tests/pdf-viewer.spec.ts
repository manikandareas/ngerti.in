import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { pdfFixture } from "./fixtures/pdf.js";

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    data,
    headers: { "Idempotency-Key": crypto.randomUUID() },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function setup(page: Page, files: { name: string; type: string; bytes: Buffer }[]) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const created = await post(page, "/v1/creation/agents", {
    connection_id: null,
    harness: "codex",
    model_id: null,
    billing_source: "subscription",
  });
  const workspace = await post(page, "/v1/workspaces", {
    thread_id: created.thread.id,
    agent_id: created.agent.id,
  });
  const artifacts = [];
  for (const file of files)
    artifacts.push(
      await post(page, `/v1/workspaces/${workspace.id}/uploads`, {
        name: file.name,
        media_type: file.type,
        content_base64: file.bytes.toString("base64"),
      }),
    );
  // Only result provenance is projected; bytes, scoped reads and storage are real API services.
  await page.route(`**/v1/threads/${created.thread.id}/snapshot`, async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    for (const artifact of snapshot.artifacts) artifact.origin = "native_output";
    await route.fulfill({ response, json: snapshot });
  });
  await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), created.thread.id);
  await page.reload();
  await page.getByRole("button", { name: `Detail ${created.agent.name}`, exact: true }).click();
  await page.getByRole("tab", { name: "Library", exact: true }).click();
  return artifacts;
}

test("Focus PDF renders selectable pages, navigates, zooms and downloads original bytes", async ({
  page,
}, info) => {
  const bytes = pdfFixture();
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await setup(page, [{ name: "sales-report.PDF", type: "application/octet-stream", bytes }]);
  await page.getByRole("button", { name: "File sales-report.PDF", exact: true }).click();
  const viewer = page.locator("[data-content-viewer]");
  const first = viewer.locator('[data-pdf-page="1"]');
  await expect(first.locator("canvas")).toHaveAttribute("data-pdf-rendered", "true");
  await expect(first.locator(".pdf-text-layer")).toContainText("October sales");
  expect(
    await first.locator("canvas").evaluate((canvas) => {
      const surface = canvas as HTMLCanvasElement;
      const pixel = surface
        .getContext("2d")
        ?.getImageData(Math.floor(surface.width / 2), Math.floor(surface.height / 4), 1, 1).data;
      return pixel ? pixel[0] < 80 && pixel[1] < 100 && pixel[2] < 130 : false;
    }),
  ).toBeTruthy();
  await expect(viewer.locator(".content-viewer-header")).toHaveCSS("border-bottom-width", "0px");
  expect(
    await viewer.evaluate((element) => {
      const header = element.querySelector(".content-viewer-header")?.getBoundingClientRect();
      const toolbar = element.querySelector(".pdf-toolbar")?.getBoundingClientRect();
      return header && toolbar ? toolbar.top >= header.bottom - 1 : false;
    }),
  ).toBeTruthy();
  await viewer.getByRole("button", { name: "Halaman berikutnya", exact: true }).click();
  const second = viewer.locator('[data-pdf-page="2"]');
  await expect(second.locator("canvas")).toHaveAttribute("data-pdf-rendered", "true");
  await expect(viewer.getByRole("spinbutton", { name: "Halaman PDF", exact: true })).toHaveValue(
    "2",
  );
  await expect(second.locator(".pdf-text-layer")).toContainText("Channel breakdown - page 2");
  await viewer.getByRole("button", { name: "Perbesar PDF", exact: true }).click();
  await expect(viewer.getByLabel("Zoom PDF", { exact: true })).toHaveText("125%");
  await expect(viewer.getByRole("spinbutton", { name: "Halaman PDF", exact: true })).toHaveValue(
    "2",
  );
  await viewer.getByRole("button", { name: "Sesuaikan lebar", exact: true }).click();
  await expect(viewer.getByLabel("Zoom PDF", { exact: true })).toHaveText("100%");
  await expect(viewer.getByRole("spinbutton", { name: "Halaman PDF", exact: true })).toHaveValue(
    "2",
  );
  await viewer.getByRole("spinbutton", { name: "Halaman PDF", exact: true }).fill("1");
  await viewer.getByRole("spinbutton", { name: "Halaman PDF", exact: true }).press("Enter");
  await expect(first.locator("canvas")).toHaveAttribute("data-pdf-rendered", "true");
  const selected = await first.locator(".pdf-text-layer").evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const value = selection?.toString();
    selection?.removeAllRanges();
    return value;
  });
  expect(selected).toContain("October sales");
  await page.screenshot({ path: info.outputPath("focus-pdf.png") });
  await viewer.getByRole("button", { name: "Aksi file", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Unduh file", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("sales-report.PDF");
  expect(await readFile((await download.path()) ?? "")).toEqual(bytes);
  await viewer.getByRole("button", { name: "Kembali", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "File sales-report.PDF", exact: true }),
  ).toBeVisible();
  expect(dialogs).toEqual([]);
  await page.unrouteAll({ behavior: "wait" });
});

test("Focus PDF detects MIME without an extension and handles invalid, oversized and page-limit files", async ({
  page,
}) => {
  test.setTimeout(60000);
  const artifacts = await setup(page, [
    { name: "document-without-extension", type: "application/pdf", bytes: pdfFixture() },
    { name: "damaged.pdf", type: "application/pdf", bytes: Buffer.from("This is not a PDF.") },
    { name: "too-many-pages.pdf", type: "application/pdf", bytes: pdfFixture(501) },
    { name: "too-large.pdf", type: "application/pdf", bytes: pdfFixture() },
  ]);
  const oversized = artifacts.find((file) => file.name === "too-large.pdf");
  await page.route(`**/v1/artifacts/${oversized.id}/content?**`, (route) =>
    route.fulfill({ contentType: "application/pdf", body: Buffer.alloc(16 * 1024 * 1024 + 1) }),
  );
  const viewer = page.locator("[data-content-viewer]");
  async function open(name: string) {
    await page.getByRole("button", { name: `File ${name}`, exact: true }).click();
  }
  await open("document-without-extension");
  await expect(viewer.locator('[data-pdf-page="1"] canvas')).toHaveAttribute(
    "data-pdf-rendered",
    "true",
  );
  await viewer.getByRole("button", { name: "Kembali", exact: true }).click();
  await open("damaged.pdf");
  await expect(viewer.getByRole("alert")).toContainText("PDF tidak dapat dibaca");
  await viewer.getByRole("button", { name: "Coba buka lagi", exact: true }).click();
  await expect(viewer.getByRole("alert")).toContainText("PDF tidak dapat dibaca");
  await viewer.getByRole("button", { name: "Aksi file", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Unduh file", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toBeVisible();
  await viewer.getByRole("button", { name: "Kembali", exact: true }).click();
  await open("too-many-pages.pdf");
  await expect(viewer.getByRole("alert")).toContainText("500 halaman");
  await viewer.getByRole("button", { name: "Kembali", exact: true }).click();
  await open("too-large.pdf");
  await expect(viewer.getByRole("alert")).toContainText("16 MB");
  await viewer.getByRole("button", { name: "Kembali", exact: true }).click();
  await page.unrouteAll({ behavior: "wait" });
});
