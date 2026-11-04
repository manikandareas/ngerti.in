import { afterEach, expect, spyOn, test } from "bun:test";
import { request } from "../src/lib/api-client";

let restore: (() => void) | undefined;
afterEach(() => restore?.());

test("snapshot reads have a deadline even when the transport never settles", async () => {
  let signal: AbortSignal | undefined;
  const mock = spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
    signal = init?.signal ?? undefined;
    return new Promise(() => {});
  });
  restore = () => mock.mockRestore();
  const result = request("/v1/threads/example/snapshot", undefined, undefined, undefined, 20);
  await expect(result).rejects.toThrow("Request timed out");
  expect(signal?.aborted).toBe(true);
});

test("the request deadline includes reading the response body", async () => {
  const mock = spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: () => new Promise(() => {}),
  } as Response);
  restore = () => mock.mockRestore();
  await expect(request("/v1/agents/activity", undefined, undefined, undefined, 20)).rejects.toThrow(
    "Request timed out",
  );
});

test("cancelling a connection generation rejects its snapshot read immediately", async () => {
  const mock = spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
  restore = () => mock.mockRestore();
  const abort = new AbortController();
  const result = request("/v1/threads/example/snapshot", undefined, undefined, abort.signal);
  abort.abort(new Error("Previous connection retired"));
  await expect(result).rejects.toThrow("Previous connection retired");
});

test("invalid successful JSON is a recoverable API failure rather than a null snapshot", async () => {
  const mock = spyOn(globalThis, "fetch").mockResolvedValue(new Response("not JSON"));
  restore = () => mock.mockRestore();
  await expect(request("/v1/threads/example/snapshot")).rejects.toThrow("Invalid server response");
});
