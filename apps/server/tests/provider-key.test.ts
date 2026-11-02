import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { chmodSync, lstatSync, mkdirSync, readdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { createApi } from "../src/api";
import { Background } from "../src/background";
import { schemas } from "../src/contracts";
import { Connections } from "../src/harness/connections";
import { CredentialContexts } from "../src/harness/context";
import { CredentialStorage } from "../src/harness/credential-storage";
import { ProductTools } from "../src/harness/tools";
import { fixture } from "./helpers";

const token = "a".repeat(64);
const secret = "provider-proof-key-do-not-publish-9d42824c";
let f: ReturnType<typeof fixture>;
afterEach(() => f?.close());
function request(body: unknown, key: string | null = crypto.randomUUID(), bearer = token) {
  return new Request("http://localhost/v1/connections/api-key", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: JSON.stringify(body),
  });
}
function setup() {
  f = fixture();
  return createApi(f.lifecycle, new Background(f.lifecycle), token);
}

test("provider key onboarding stores only a private host key and replays across restart", async () => {
  let app = setup();
  const key = crypto.randomUUID();
  const body = { harness: "muse", api_key: secret };
  const response = await app.handle(request(body, key));
  expect(response.status).toBe(200);
  const connection = schemas.connection.parse(await response.json());
  expect(connection.harness).toBe("muse");
  expect(connection.authentication.method).toBe("api_key");
  expect(connection.authentication.billing_source).toBe("api_key");
  expect(connection.effective_billing_source).toBe("unknown");
  expect(connection.login).toBe("unknown");
  expect(connection.inference).toBe("not_attempted");
  if (connection.authentication.method !== "api_key") throw new Error("Expected API key.");
  const directory = join(f.dir, "credentials");
  const credential = join(directory, connection.authentication.credential_ref);
  expect(lstatSync(directory).mode & 0o777).toBe(0o700);
  expect(lstatSync(credential).mode & 0o777).toBe(0o600);
  expect(readFileSync(credential, "utf8")).toBe(secret);
  const cursor = f.store.cursor;
  expect(await (await app.handle(request(body, key))).json()).toEqual(connection);
  expect(f.store.cursor).toBe(cursor);
  expect(readdirSync(directory)).toHaveLength(1);
  const changed = await app.handle(request({ ...body, api_key: "a-different-key" }, key));
  expect(changed.status).toBe(409);
  expect((await changed.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
  expect(readdirSync(directory)).toHaveLength(1);
  const read = new Database(f.store.path, { readonly: true });
  try {
    const commands = read.query("SELECT fingerprint,receipt FROM commands").all();
    expect(JSON.stringify(commands)).not.toContain(secret);
    expect(JSON.stringify(commands)).not.toContain("a-different-key");
    expect(JSON.stringify(f.store.events(0))).not.toContain(secret);
    expect(JSON.stringify(f.store.list("connection"))).not.toContain(secret);
  } finally {
    read.close();
  }
  f.restart();
  app = createApi(f.lifecycle, new Background(f.lifecycle), token);
  expect(await (await app.handle(request(body, key))).json()).toEqual(connection);
  const launch = new CredentialContexts(f.dir).create(f.store.get("connection", connection.id));
  expect(launch.env.META_API_KEY).toBe(secret);
  expect(launch.env.OPENAI_API_KEY).toBeUndefined();
  expect(readdirSync(directory)).toHaveLength(1);
});

test("key onboarding preserves explicit Codex API billing and published request/response schemas", async () => {
  const app = setup();
  const response = await app.handle(request({ harness: "codex", api_key: secret }));
  const connection = schemas.connection.parse(await response.json());
  const launch = new CredentialContexts(f.dir).create(connection);
  expect(launch.env.OPENAI_API_KEY).toBe(secret);
  expect(launch.env.META_API_KEY).toBeUndefined();
  const contract = await (
    await app.handle(
      new Request("http://localhost/v1/contracts", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
  ).json();
  expect(contract.version).toBe("1.19.0");
  const route = contract.http.find(
    (item: { path: string; method: string }) =>
      item.method === "POST" && item.path === "/v1/connections/api-key",
  );
  expect(route.idempotency).toBe("required_uuid");
  expect(route.authentication).toBe("installation_bearer");
  z.fromJSONSchema(route.request.body).parse({ harness: "codex", api_key: secret });
  z.fromJSONSchema(route.response.schema).parse(connection);
  expect(JSON.stringify(contract)).not.toContain(secret);
});

test("unauthorized, malformed and missing-key requests never write credentials or domain state", async () => {
  const app = setup();
  const cursor = f.store.cursor;
  expect(
    (await app.handle(request({ harness: "muse", api_key: secret }, undefined, "wrong"))).status,
  ).toBe(401);
  for (const body of [
    { harness: "muse", api_key: "" },
    { harness: "muse", api_key: "   " },
    { harness: "muse", api_key: `key\n${secret}` },
    { harness: "muse", api_key: `key\r${secret}` },
    { harness: "muse", api_key: `key\0${secret}` },
    { harness: "muse", api_key: "k".repeat(16385) },
    { harness: "unsupported", api_key: secret },
    { harness: "muse", api_key: secret, billing_source: "subscription" },
  ]) {
    const response = await app.handle(request(body));
    expect(response.status).toBe(422);
    expect(await response.text()).not.toContain(secret);
  }
  expect((await app.handle(request({ harness: "muse", api_key: secret }, null))).status).toBe(422);
  expect(f.store.cursor).toBe(cursor);
  expect(readdirSync(f.dir)).not.toContain("credentials");
});

test("credential onboarding rejects symlinked credential directories", async () => {
  const app = setup();
  const outside = join(f.dir, "outside");
  mkdirSync(outside, { mode: 0o700 });
  symlinkSync(outside, join(f.dir, "credentials"));
  const cursor = f.store.cursor;
  const response = await app.handle(request({ harness: "muse", api_key: secret }));
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain(secret);
  expect(readdirSync(outside)).toEqual([]);
  expect(f.store.cursor).toBe(cursor);
});

test("credential onboarding rejects publicly readable credential storage", async () => {
  const app = setup();
  mkdirSync(join(f.dir, "credentials"), { mode: 0o700 });
  chmodSync(join(f.dir, "credentials"), 0o755);
  const response = await app.handle(request({ harness: "muse", api_key: secret }));
  expect(response.status).toBe(500);
  expect(readdirSync(join(f.dir, "credentials"))).toEqual([]);
});

test("a rejected connection transaction removes its new host key", async () => {
  f = fixture();
  const connections = new Connections(f.lifecycle);
  connections.create = () => {
    throw new Error("Simulated transaction failure.");
  };
  const app = createApi(f.lifecycle, new Background(f.lifecycle), token, {
    connections,
    tools: new ProductTools(f.lifecycle),
    credentialStorage: new CredentialStorage(f.dir),
  });
  const response = await app.handle(request({ harness: "muse", api_key: secret }));
  expect(response.status).toBe(500);
  expect(readdirSync(join(f.dir, "credentials"))).toEqual([]);
});
