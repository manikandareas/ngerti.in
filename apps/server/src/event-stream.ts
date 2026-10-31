import type { Store } from "./store";

/** Pull one committed envelope at a time. A slow consumer never accumulates an unbounded queue. */
export function eventStream(store: Store, after: number, signal: AbortSignal) {
  let cursor = after;
  let closed = false;
  const deadline = Date.now() + 60_000;
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("retry: 1000\n\n"));
      },
      async pull(controller) {
        for (let i = 0; i < 40; i++) {
          if (closed) return;
          if (signal.aborted || store.closed || Date.now() >= deadline) {
            closed = true;
            controller.close();
            return;
          }
          const event = store.events(cursor, 1)[0];
          if (event) {
            cursor = event.cursor;
            controller.enqueue(
              encoder.encode(`id: ${cursor}\nevent: domain\ndata: ${JSON.stringify(event)}\n\n`),
            );
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (!closed) controller.enqueue(encoder.encode(": keep-alive\n\n"));
      },
      cancel() {
        closed = true;
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
