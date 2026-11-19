const runPath = process.argv[2];
if (!runPath?.startsWith("/observe/"))
  throw new Error("Pass an isolated /observe/ path for this test run.");

const result = "LATE_RESULT=41\n";
const state = {
  started_at: "",
  released_at: "",
  response_created_at: "",
};
const latch = Promise.withResolvers<true>();

Bun.serve({
  hostname: "0.0.0.0",
  port: 8418,
  idleTimeout: 65,
  async fetch(request, server) {
    const path = new URL(request.url).pathname;
    const local = server.requestIP(request)?.address === "127.0.0.1";
    if (local && request.method === "GET" && path === "/status") return Response.json(state);
    if (local && request.method === "POST" && path === "/release") {
      if (!state.started_at || state.released_at)
        return new Response("No pending fixture observation", { status: 409 });
      state.released_at = new Date().toISOString();
      latch.resolve(true);
      return Response.json(state);
    }
    if (request.method !== "GET" || path !== runPath) return new Response(null, { status: 404 });
    if (state.started_at) return new Response("Observation already attempted", { status: 409 });
    state.started_at = new Date().toISOString();
    if (!(await Promise.race([latch.promise, Bun.sleep(55_000).then(() => false)])))
      return new Response("Isolated fixture wait expired", { status: 504 });
    state.response_created_at = new Date().toISOString();
    console.log(JSON.stringify(state));
    return new Response(result);
  },
});
