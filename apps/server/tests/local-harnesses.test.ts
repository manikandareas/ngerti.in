import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApi } from "../src/api";
import { Background } from "../src/background";
import { schemas } from "../src/contracts";
import { manifests } from "../src/harness/availability";
import { codexModels } from "../src/harness/codex/models";
import { Connections } from "../src/harness/connections";
import { CredentialContexts } from "../src/harness/context";
import { LocalAccounts } from "../src/harness/local-accounts";
import { LocalProfiles } from "../src/harness/local-profile";
import type { HarnessDetector } from "../src/harness/runtime";
import { ProductTools } from "../src/harness/tools";
import { organizationFixture } from "./organizations/helpers";

test("local profile discovery binds personal connections to the installation and refreshes their model IDs", async () => {
  const fixture = await organizationFixture();
  const { lifecycle, dir, owner } = fixture.domain;
  const home = join(dir, "local-profile");
  mkdirSync(join(home, ".pi", "agent"), { recursive: true });
  const file = join(home, ".pi", "agent", "models.json");
  function configure(ids: string[]) {
    writeFileSync(
      file,
      JSON.stringify({
        providers: {
          example: {
            baseUrl: "http://127.0.0.1:1/v1",
            api: "openai-completions",
            apiKey: "local-fixture-credential",
            models: ids.map((id) => ({ id })),
          },
        },
      }),
    );
  }
  const profiles = new LocalProfiles(owner, {}, home);
  const credentials = new CredentialContexts(join(dir, "harness"), undefined, undefined, profiles);
  const connections = new Connections(lifecycle);
  const detect: HarnessDetector = async (harness) => ({
    harness,
    manifest: manifests[harness],
    state: harness === "pi" ? "supported" : "missing",
    executable: null,
    version: null,
  });
  const accounts = new LocalAccounts(
    profiles,
    connections,
    {
      async inspect(id) {
        const connection = await connections.get(id);
        const launch = credentials.create(connection);
        const models = (launch.nativeConfiguration?.models ?? []).map(({ id }) => ({
          id: `example/${id}`,
          reasoning: [],
        }));
        return connections.update(connection, {
          models,
          login: "authenticated",
          effective_billing_source: "api_key",
          discovery: "succeeded",
        });
      },
      async login() {},
      async cancel() {},
    },
    detect,
  );
  const tools = await ProductTools.open(lifecycle);
  const api = await createApi(lifecycle, new Background(lifecycle), {
    authentication: fixture.auth,
    connections,
    tools,
    localAccounts: accounts,
  });
  const request = (cookie: string, path: string, body?: unknown) =>
    api.handle(
      new Request(`${fixture.origin}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Cookie: cookie,
          Origin: fixture.origin,
          "Content-Type": "application/json",
          "X-Ngertiin-Organization": fixture.initial.organization.id,
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  const refresh = "/v1/connections/local/refresh";
  const entities = "/v1/entities/connection";
  try {
    configure(["one", "two"]);
    const other = await fixture.account("local-harness-reader@example.test");
    await fixture.join(other);
    expect(await fixture.success(request(other.cookie, refresh, {}))).toEqual({ available: false });

    await Promise.all([
      fixture.success(request(fixture.owner.cookie, refresh, {})),
      fixture.success(request(fixture.owner.cookie, refresh, {})),
    ]);
    const initial = schemas.connection
      .array()
      .parse(await fixture.success(request(fixture.owner.cookie, entities)));
    expect(initial).toHaveLength(1);
    expect(initial[0].authentication).toEqual({
      method: "local_config",
      billing_source: "api_key",
      device_id: owner,
    });
    expect(initial[0].models.map(({ id }) => id)).toEqual(["example/one", "example/two"]);
    expect(JSON.stringify(initial)).not.toContain("local-fixture-credential");
    expect(await fixture.success(request(other.cookie, entities))).toEqual([]);

    const forged = await request(fixture.owner.cookie, "/v1/connections", {
      harness: "pi",
      provider_id: "forged",
      authentication: initial[0].authentication,
    });
    expect(forged.status).toBe(403);

    configure(["two", "three"]);
    await fixture.success(request(fixture.owner.cookie, refresh, {}));
    const updated = schemas.connection
      .array()
      .parse(await fixture.success(request(fixture.owner.cookie, entities)));
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe(initial[0].id);
    expect(updated[0].grant_revision).toBe(initial[0].grant_revision);
    expect(updated[0].models.map(({ id }) => id)).toEqual(["example/two", "example/three"]);

    configure([]);
    await fixture.success(request(fixture.owner.cookie, refresh, {}));
    const missing = schemas.connection
      .array()
      .parse(await fixture.success(request(fixture.owner.cookie, entities)));
    expect(missing[0].models).toEqual([]);
    expect(missing[0].effective_billing_source).toBe("unknown");

    await fixture.success(
      request(fixture.owner.cookie, `/v1/connections/${initial[0].id}/revoke`, {}),
    );
    configure(["four"]);
    await fixture.success(request(fixture.owner.cookie, refresh, {}));
    const disconnected = schemas.connection
      .array()
      .parse(await fixture.success(request(fixture.owner.cookie, entities)));
    expect(disconnected.filter((item) => item.state === "active")).toEqual([]);
    expect(disconnected[0].grant_revision).toBeGreaterThan(missing[0].grant_revision);
  } finally {
    await fixture.close();
  }
});

test("Codex catalog retains valid models when the runtime adds input modalities", async () => {
  const models = await codexModels(async () => ({
    data: [
      {
        model: "fixture-codex",
        inputModalities: ["text", "image", "future-modality"],
        supportedReasoningEfforts: [{ reasoningEffort: "high" }],
      },
    ],
    nextCursor: null,
  }));
  expect(models).toEqual([
    {
      id: "fixture-codex",
      input_modalities: ["text", "image"],
      reasoning: ["high"],
    },
  ]);
});
