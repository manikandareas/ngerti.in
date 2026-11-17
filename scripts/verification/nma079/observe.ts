import { afterAll, mock } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createApi } from "../../../apps/server/src/api";

// Verification-only observer: no bodies, cookies, tokens, response payloads or production hooks.
const installedCreateApi = createApi;
const root = resolve(import.meta.dir, "../../..");
const inventory = JSON.parse(readFileSync(join(root, "apps/server/tests/organizations/fixtures/http-contract.json"), "utf8")).http as { method: string; path: string }[];
const routes = inventory.map(route => ({ ...route, pattern: new RegExp(`^${route.path.split("/").map(part => part === "*" ? ".*" : part.startsWith(":") ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("/")}$`) }));
const observations = new Map<string, { method: string; path: string; mode: string; status: number; actor: string | null; organization: string | null; count: number }>();
const fingerprint = (value: string | null) => value ? createHash("sha256").update(value).digest("hex").slice(0, 12) : null;
mock.module(join(root, "apps/server/src/api.ts"), () => ({
  createApi: async (...args: Parameters<typeof createApi>) => {
    const api = await installedCreateApi(...args);
    const handle = api.handle.bind(api);
    api.handle = async request => {
      const response = await handle(request);
      const path = new URL(request.url).pathname;
      const route = routes.find(route => (route.method === request.method || route.method === "ALL") && route.pattern.test(path));
      if (route) {
        const value = { method: route.method, path: route.path, mode: args[3]?.authentication ? "accounts" : "legacy",
          status: response.status, actor: fingerprint(request.headers.get("Cookie") ?? request.headers.get("Authorization")),
          organization: fingerprint(request.headers.get("X-Ngertiin-Organization")), count: 0 };
        const key = JSON.stringify(value);
        const previous = observations.get(key);
        if (previous) previous.count++;
        else observations.set(key, { ...value, count: 1 });
      }
      return response;
    };
    return api;
  },
}));
afterAll(() => {
  const directory = process.env.NGERTIIN_NMA079_REPORT_DIR;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "http-observations.json"), `${JSON.stringify({ observer: "verification_only_handle_wrapper", observations: [...observations.values()] }, null, 2)}\n`);
});
