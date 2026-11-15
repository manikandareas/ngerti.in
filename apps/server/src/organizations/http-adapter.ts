import type { AnyElysia } from "elysia";
import { BunAdapter } from "elysia/adapter/bun";

/** Account media shares this listener. Bun 1.3.10 can retain closed server-side WS counts. */
export const accountHttpAdapter = {
  ...BunAdapter,
  async stop(app: AnyElysia, force?: boolean) {
    const server = app.server;
    if (!force || Bun.version !== "1.3.10" || !server) return BunAdapter.stop?.(app, force);
    // Views are revoked by the API wrapper first. Force closes network connections;
    // drain real HTTP requests without awaiting the pinned runtime's stale WS counter.
    const stopping = server.stop(true);
    let failure: unknown;
    void stopping.catch((error) => {
      failure = error;
    });
    const deadline = Date.now() + 5000;
    while (server.pendingRequests && !failure && Date.now() < deadline) await Bun.sleep(10);
    if (failure) throw failure;
    if (server.pendingRequests) throw new Error("Account HTTP requests did not stop.");
    server.unref();
    app.server = null;
    for (const hook of app.event.stop ?? []) await hook.fn(app);
  },
};
