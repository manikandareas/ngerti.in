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
  const signal = lease ? AbortSignal.any([requestSignal, lease.signal]) : requestSignal;
  let cursor = after;
  let closed = false;
  const deadline = Date.now() + 60_000;
  const encoder = new TextEncoder();
  let detach = () => {};
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const stop = () => {
          if (closed) return;
          closed = true;
          detach();
          lease?.release();
          controller.close();
        };
        signal.addEventListener("abort", stop, { once: true });
        detach = () => signal.removeEventListener("abort", stop);
        if (signal.aborted) stop();
        else controller.enqueue(encoder.encode("retry: 1000\n\n"));
      },
      async pull(controller) {
        try {
          for (let i = 0; i < 2; i++) {
            if (closed) return;
            if (signal.aborted || store.closed || Date.now() >= deadline) break;
            await lease?.assert();
            const event = (await store.events(cursor, 1))[0];
            if (event) {
              const value = await conversationEvent(store, event);
              await lease?.assert();
              if (closed) return;
              cursor = event.cursor;
              controller.enqueue(
                encoder.encode(`id: ${cursor}\nevent: domain\ndata: ${JSON.stringify(value)}\n\n`),
              );
              return;
            }
            await store.waitForEvents(cursor, signal, Math.min(10_000, deadline - Date.now()));
          }
          if (closed) return;
          if (signal.aborted || store.closed || Date.now() >= deadline) {
            closed = true;
            detach();
            lease?.release();
            controller.close();
          } else controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          if (!closed) {
            closed = true;
            detach();
            lease?.release();
            controller.close();
          }
        }
      },
      cancel() {
        closed = true;
        detach();
        lease?.release();
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
