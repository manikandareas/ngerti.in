import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Runs in a bounded child process without provider credentials. Output is data only. */
const input = (await Bun.stdin.json()) as {
  content_base64: string;
  start_page?: number;
  end_page?: number;
};
const task = getDocument({
  data: new Uint8Array(Buffer.from(input.content_base64, "base64")),
  stopAtErrors: true,
  useSystemFonts: false,
  useWorkerFetch: false,
  disableFontFace: true,
  enableXfa: false,
  verbosity: 0,
});
try {
  const document = await task.promise;
  const first = input.start_page ?? 1;
  const last = Math.min(document.numPages, input.end_page ?? 300);
  const pages: { number: number; text: string }[] = [];
  let remaining = 800_000;
  let truncated = last < document.numPages && input.end_page === undefined;
  for (let number = first; number <= last && remaining > 0; number++) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
      .join("")
      .trim();
    const retained = text.slice(0, Math.min(60_000, remaining));
    truncated ||= retained.length < text.length;
    remaining -= retained.length;
    pages.push({ number, text: retained });
    page.cleanup();
  }
  truncated ||= pages.length < Math.max(0, last - first + 1);
  console.log(JSON.stringify({ page_count: document.numPages, pages, truncated }));
} catch {
  console.log(JSON.stringify({ error_code: "INVALID_DOCUMENT" }));
} finally {
  await task.destroy();
}
