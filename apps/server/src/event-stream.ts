import type { SessionLease } from "./auth/service";
import { conversationEvent } from "./conversations/projection";
import type { Store } from "./store";

export function eventStream(
  store: Store,
  after: number,
  requestSignal: AbortSignal,
  lease?: SessionLease,
) {
  const scope = store.dataContext;
  const revoked = new AbortController();
  let validating = false;
  const permissionTimer = scope
    ? setInterval(async () => {
        if (validating) return;
        validating = true;
        try {
          await scope.validate();
        } catch {
          revoked.abort();
        } finally {
          validating = false;
        }
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
              const { page, events } = await store.read(async () => {
                const page = await store.replay(cursor, { limit: 16 });
                const events = [];
                for (const event of page.events) events.push(await conversationEvent(store, event));
                return { page, events };
              });
              if (events.length) {
                await lease?.assert();
                await scope?.validate();
                if (closed) return;
                cursor = events[events.length - 1].cursor;
                controller.enqueue(
                  encoder.encode(
                    events
                      .map(
                        (event) =>
                          `id: ${event.cursor}\nevent: domain\ndata: ${JSON.stringify(event)}\n\n`,
                      )
                      .join(""),
                  ),
                );
                return;
              }
              cursor = page.next_cursor;
              const remaining = deadline - Date.now();
              if (remaining <= 0) break;
              await store.waitForEvents(cursor, signal, Math.min(10_000, remaining));
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
