import { afterEach, expect, spyOn, test } from "bun:test";
import { followEvents } from "../src/lib/api-client";

let restore: (() => void) | undefined;
afterEach(() => restore?.());

function connection(heartbeat = false) {
  let cancelled = false;
  const mock = spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    const signal = init?.signal;
    let timer: ReturnType<typeof setInterval> | undefined;
    let end: ReturnType<typeof setTimeout> | undefined;
    let abort = () => {};
    return new Response(
      new ReadableStream({
        start(controller) {
          const cleanup = () => {
            clearInterval(timer);
            clearTimeout(end);
            signal?.removeEventListener("abort", abort);
          };
          abort = () => {
            cancelled = true;
            cleanup();
            controller.error(signal?.reason);
          };
          signal?.addEventListener("abort", abort, { once: true });
          controller.enqueue(new TextEncoder().encode("retry: 1000\n\n"));
          if (heartbeat) {
            timer = setInterval(
              () => controller.enqueue(new TextEncoder().encode(": keep-alive\n\n")),
              5,
            );
            end = setTimeout(() => {
              cleanup();
              controller.close();
            }, 70);
          }
        },
        cancel() {
          cancelled = true;
          clearInterval(timer);
          clearTimeout(end);
          signal?.removeEventListener("abort", abort);
        },
      }),
    );
  });
  restore = () => mock.mockRestore();
  return { cancelled: () => cancelled };
}

test("a stalled open event connection is aborted so its caller can reconcile and reconnect", async () => {
  const transport = connection();
  const abort = new AbortController();
  const result = followEvents(12, abort.signal, () => {}, 20).then(
    () => "ended",
    (error: Error) => error.message,
  );
  const outcome = await Promise.race([result, Bun.sleep(100).then(() => "stalled")]);
  abort.abort();
  await result;
  expect(outcome).toBe("Event connection lost. Reconnecting…");
  expect(transport.cancelled()).toBe(true);
});

test("heartbeats keep an idle event stream alive beyond one inactivity window", async () => {
  connection(true);
  const abort = new AbortController();
  await expect(followEvents(0, abort.signal, () => {}, 20)).resolves.toBeUndefined();
  expect(abort.signal.aborted).toBe(false);
});
