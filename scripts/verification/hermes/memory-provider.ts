import { readFileSync } from "node:fs";

const seedFile = process.argv[2];
if (!seedFile) throw new Error("Pass the path to an isolated memory fixture seed.");
const seed = JSON.parse(readFileSync(seedFile, "utf8")) as {
  accessToken: string;
  namespace: string;
  records: Record<string, string>;
};

Bun.serve({
  port: 8417,
  hostname: "127.0.0.1",
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/health") return new Response("ok");
    if (request.method !== "POST" || pathname !== "/recall")
      return new Response("Not found", { status: 404 });
    if (request.headers.get("authorization") !== `Bearer ${seed.accessToken}`)
      return new Response("Unauthorized", { status: 401 });
    const { namespace, query } = (await request.json()) as { namespace: string; query: string };
    if (typeof query !== "string" || !/^[a-f0-9]{64}$/.test(namespace))
      return new Response("Invalid lookup", { status: 422 });
    const inScope = namespace === seed.namespace;
    const record = inScope && seed.records[query.toLowerCase()];
    console.log(JSON.stringify({ query, in_scope: inScope, found: Boolean(record) }));
    if (query.toLowerCase() === "memory outage test")
      return new Response("Temporarily unavailable", { status: 503 });
    return Response.json({ memories: record ? [{ text: record }] : [] });
  },
});
