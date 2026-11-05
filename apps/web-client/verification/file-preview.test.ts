import { expect, test } from "bun:test";
import { readFilePreview } from "../src/features/conversation/lib/file-preview";

test("large previews bound retained bytes and cancel the unread original", async () => {
  let pulls = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array(16 * 1024).fill(65));
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const result = await readFilePreview(
    new Response(body),
    128 * 1024,
    new AbortController().signal,
  );
  expect(result.bytes.length).toBe(128 * 1024);
  expect(result.truncated).toBe(true);
  expect(pulls).toBe(9);
  expect(cancelled).toBe(true);
});

test("an exact-limit preview remains complete and UTF-8 bytes are preserved", async () => {
  const text = "é🙂abc";
  const bytes = new TextEncoder().encode(text);
  const result = await readFilePreview(
    new Response(bytes),
    bytes.length,
    new AbortController().signal,
  );
  expect(result.truncated).toBe(false);
  expect(new TextDecoder().decode(result.bytes)).toBe(text);
});

test("cancelled scope does not publish a preview", async () => {
  const abort = new AbortController();
  abort.abort(new Error("Scope changed"));
  await expect(readFilePreview(new Response("data"), 10, abort.signal)).rejects.toThrow(
    "Scope changed",
  );
});
