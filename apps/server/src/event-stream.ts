import type { SessionLease } from "./auth/service";
import { conversationEvent } from "./conversations/projection";
import type { Store } from "./store";

/** Pull one committed envelope at a time; check the device before every delivery. */
export function eventStream(
  store: Store,
  after: number,
  requestSignal: AbortSignal,
  lease?: SessionLease,
) {
  const scope = store.dataContext;
  const revoked = new AbortController();
  const permissionTimer = scope
    ? setInterval(() => {
        void scope.validate().catch(() => revoked.abort());
      }, 1000)
    : undefined;
  const signal = AbortSignal.any([requestSignal, revoked.signal, ...(lease ? [lease.signal] : [])]);
  let cursor = after;
  let closed = false;
  const deadline = Date.now() + 60_000;
  const encoder = new TextEncoder();
  let detach = () => {};
  const release = () => {
    if (closed) return false;
    closed = true;
    detach();
    lease?.release();
    return true;
  };
  const finish = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (release()) controller.close();
  };
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const stop = () => finish(controller);
        signal.addEventListener("abort", stop, { once: true });
        detach = () => {
          signal.removeEventListener("abort", stop);
          clearInterval(permissionTimer);
        };
        if (signal.aborted) stop();
        else controller.enqueue(encoder.encode("retry: 1000\n\n"));
      },
      async pull(controller) {
        const read = async () => {
          try {
            for (let i = 0; i < 2; i++) {
              if (closed) return;
              if (signal.aborted || store.closed || Date.now() >= deadline) break;
              await lease?.assert();
              const page = await store.replay(cursor, { limit: 1 });
              const event = page.events[0];
              if (!event) cursor = page.next_cursor;
              if (event) {
                const value = await conversationEvent(store, event);
                await lease?.assert();
                if (closed) return;
                cursor = event.cursor;
                controller.enqueue(
                  encoder.encode(
                    `id: ${cursor}\nevent: domain\ndata: ${JSON.stringify(value)}\n\n`,
                  ),
                );
                return;
              }
              await store.waitForEvents(cursor, signal, Math.min(10_000, deadline - Date.now()));
            }
            if (closed) return;
            if (signal.aborted || store.closed || Date.now() >= deadline) {
              finish(controller);
            } else controller.enqueue(encoder.encode(": keep-alive\n\n"));
          } catch {
            finish(controller);
          }
        };
        return scope ? store.withDataContext(scope, read) : read();
      },
      cancel() {
        release();
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    },
  );
}
