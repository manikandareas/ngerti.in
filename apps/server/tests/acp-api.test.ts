import { expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createApi } from "../src/api";
import { Background } from "../src/background";
import { CONTRACT_VERSION, control } from "../src/contracts";
import { Connections } from "../src/harness/connections";
import { CredentialContexts } from "../src/harness/context";
import { CredentialStorage } from "../src/harness/credential-storage";
import type { PiProviderConfiguration } from "../src/harness/native-configuration";
import { ProductTools } from "../src/harness/tools";
import { Machines } from "../src/machines/service";
import { organizationFixture } from "./organizations/helpers";

test("authenticated ACP contract and explicit multi-provider key routes preserve private account scope", async () => {
  const f = await organizationFixture();
  const machines = await Machines.open(f.domain.lifecycle, null);
  const storageKey = join(f.domain.dir, "master-key");
  writeFileSync(storageKey, randomBytes(32), { mode: 0o600 });
  const storage = new CredentialStorage(f.domain.dir, storageKey);
  const tools = await ProductTools.open(f.domain.lifecycle);
  const app = await createApi(f.domain.lifecycle, new Background(f.domain.lifecycle), {
    authentication: f.auth,
    connections: new Connections(f.domain.lifecycle),
    tools,
    credentialStorage: storage,
  });
  const request = (cookie: string | null, path: string, body?: unknown) =>
    app.handle(
      new Request(`${f.origin}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          Origin: f.origin,
          "Content-Type": "application/json",
          "X-Ngertiin-Organization": f.initial.organization.id,
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  try {
    const bob = await f.account("acp-reader@example.test");
    await f.join(bob);
    expect((await request(null, "/v1/contracts")).status).toBe(401);
    const exported = await request(f.owner.cookie, "/v1/contracts");
    expect(exported.status).toBe(200);
    const contract = await exported.json();
    expect(contract.version).toBe(CONTRACT_VERSION);
    expect(contract.entities.connection.properties.harness.enum).toEqual([
      "codex",
      "muse",
      "claude",
      "opencode",
      "pi",
    ]);
    expect(contract.entities.connection.properties.provider_id).toBeDefined();
    expect(contract.entities.binding.properties.process_generation).toBeDefined();
    expect(contract.entities.binding.properties.replaces_binding_id).toBeDefined();
    expect(contract.entities.run.properties.native_progress).toBeDefined();
    expect(control.shape.native_run_id.safeParse(null).success).toBe(true);
    const pending = contract.http.find(
      (route: { method: string; path: string }) =>
        route.method === "GET" && route.path === "/v1/runs/:id/interactions",
    );
    const projection = pending.response.schema;
    expect(JSON.stringify(projection)).toContain('"elicitation"');
    expect(JSON.stringify(projection)).toContain('"choices_only"');
    const freeResponse = await request(f.owner.cookie, "/v1/connections", {
      harness: "opencode",
      provider_id: "opencode",
      authentication: { method: "none", billing_source: "free" },
    });
    expect(freeResponse.status).toBe(200);
    const free = await freeResponse.json();
    expect(free.authentication).toEqual({ method: "none", billing_source: "free" });
    const freeContext = new CredentialContexts(f.domain.dir, () => {
      throw new Error("Public provider attempted to read a credential.");
    }).create(free);
    expect(freeContext.connection?.account_id).toBeNull();
    expect(freeContext.env.OPENCODE_API_KEY).toBeUndefined();
    const nativeConfiguration: PiProviderConfiguration = {
      baseUrl: "https://native-models.example.test/v1",
      api: "openai-completions",
      apiKey: "fixture-existing-native-pi-key",
      models: [{ id: "native-model", reasoning: true, contextWindow: 1_000_000 }],
    };
    const imported = await request(f.owner.cookie, "/v1/connections/native-configuration", {
      harness: "pi",
      provider_id: "custom.runtime-one",
      configuration: nativeConfiguration,
    });
    expect(imported.status).toBe(200);
    const native = await imported.json();
    expect(native.authentication.method).toBe("harness_config");
    expect(native.provider_id).toBe("custom.runtime-one");
    expect(native.authentication.billing_source).toBe("api_key");
    expect(JSON.stringify(native)).not.toContain(nativeConfiguration.apiKey);
    expect(
      readFileSync(join(f.domain.dir, "credentials", native.authentication.credential_ref), "utf8"),
    ).not.toContain(nativeConfiguration.apiKey);
    const nativeContext = new CredentialContexts(f.domain.dir, (ref) =>
      storage.read(ref, true),
    ).create(native);
    expect(nativeContext.nativeConfiguration).toEqual(nativeConfiguration);
    expect(nativeContext.env.NGERTIIN_PI_CREDENTIAL).toBeUndefined();
    expect(nativeContext.redactor.text(nativeConfiguration.apiKey)).toBe("[REDACTED]");
    expect((await request(bob.cookie, `/v1/entities/connection/${native.id}`)).status).toBe(404);
    for (const configuration of [
      { ...nativeConfiguration, apiKey: "!untrusted-credential-command" },
      { ...nativeConfiguration, baseUrl: "file:///untrusted-provider" },
      { ...nativeConfiguration, extensions: ["untrusted-code"] },
    ]) {
      const rejected = await request(f.owner.cookie, "/v1/connections/native-configuration", {
        harness: "pi",
        provider_id: "custom.runtime-one",
        configuration,
      });
      expect(rejected.status).toBe(422);
      expect(await rejected.text()).not.toContain(nativeConfiguration.apiKey);
    }
    const anotherProvider = await request(f.owner.cookie, "/v1/connections/native-configuration", {
      harness: "pi",
      provider_id: "another-runtime-provider",
      configuration: { ...nativeConfiguration, baseUrl: "https://another.example.test/v1" },
    });
    expect(anotherProvider.status).toBe(200);
    expect((await anotherProvider.json()).provider_id).toBe("another-runtime-provider");
    for (const [harness, provider] of [
      ["claude", "anthropic"],
      ["opencode", "openai"],
      ["pi", "openai"],
    ]) {
      const created = await request(f.owner.cookie, "/v1/connections/api-key", {
        harness,
        provider_id: provider,
        api_key: "fake-explicit-provider-key",
      });
      expect(created.status).toBe(200);
      const connection = await created.json();
      expect(connection.provider_id).toBe(provider);
      expect(connection.authentication.billing_source).toBe("api_key");
      expect(connection.inference).toBe("not_attempted");
      expect(
        readFileSync(
          join(f.domain.dir, "credentials", connection.authentication.credential_ref),
          "utf8",
        ),
      ).not.toContain("fake-explicit-provider-key");
      expect((await request(bob.cookie, `/v1/entities/connection/${connection.id}`)).status).toBe(
        404,
      );
      const rotated = await request(f.owner.cookie, `/v1/connections/${connection.id}/rotate-key`, {
        api_key: "fake-new-provider-key",
      });
      expect(rotated.status).toBe(200);
      const result = await rotated.json();
      expect(result.replacement.provider_id).toBe(provider);
      expect(result.selection_action).toBe("explicitly_select_replacement");
      expect(
        (
          await request(f.owner.cookie, "/v1/connections", {
            harness,
            authentication: { method: "native_login", billing_source: "subscription" },
          })
        ).status,
      ).toBe(409);
    }
    for (const harness of ["opencode", "pi"]) {
      const missing = await request(f.owner.cookie, "/v1/connections/api-key", {
        harness,
        api_key: "fake-explicit-provider-key",
      });
      expect(missing.status).toBe(409);
      expect((await missing.json()).error.code).toBe("CAPABILITY_UNSUPPORTED");
    }
    await Bun.write(
      resolve(import.meta.dir, `../../../docs/contracts/${CONTRACT_VERSION}.json`),
      `${JSON.stringify(contract, null, 2)}\n`,
    );
  } finally {
    await app.stop(true);
    tools.revokeAll();
    await machines.close();
    await f.close();
  }
});
