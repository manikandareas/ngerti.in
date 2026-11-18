import { expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { httpContract } from "../src/api-contract";
import { ApiKeyChecks } from "../src/harness/api-key-checks";
import { manifests } from "../src/harness/availability";
import type { HarnessAdapter, HarnessClient } from "../src/harness/client";
import { apiKeyConnectionInput, unknownCapabilities } from "../src/harness/contracts";
import type { HarnessDetector } from "../src/harness/runtime";

const detect: HarnessDetector = async (harness) => ({
  harness,
  state: "supported",
  version: "2.6.0",
  executable: "/fixture/runtime",
  manifest: manifests[harness],
});

for (const outcome of [
  "success",
  "rejected",
  "wrong_billing",
  "empty_catalog",
  "aborted",
] as const) {
  test(`candidate key check isolates and removes native state: ${outcome}`, async () => {
    let directory = "";
    let closed = false;
    let discovered = false;
    const controller = new AbortController();
    const adapter: HarnessAdapter = {
      harness: "codex",
      async connect(context) {
        directory = context.state_directory;
        expect(context.env.OPENAI_API_KEY).toBe("fixture-key-never-save");
        expect(context.env.HOME).toStartWith(directory);
        writeFileSync(join(directory, "native-auth-state"), "fixture-key-never-save", {
          mode: 0o600,
        });
        const client: HarnessClient = {
          inspect: async () => {
            if (outcome === "aborted") controller.abort();
            return {
              login: outcome === "rejected" ? "rejected" : "authenticated",
              auth_method: "api_key",
              account_id: null,
              billing_source: outcome === "wrong_billing" ? "subscription" : "api_key",
              capabilities: { ...unknownCapabilities },
            };
          },
          discoverModels: async () => {
            discovered = true;
            return outcome === "empty_catalog" ? [] : [{ id: "fixture-model", reasoning: [] }];
          },
          close: async () => {
            closed = true;
          },
          start: async () => {
            throw new Error("Checks must not start a conversation.");
          },
          resume: async () => {
            throw new Error("Checks must not resume a conversation.");
          },
          settings: async () => {
            throw new Error("Checks must not change settings.");
          },
          prompt: async () => {
            throw new Error("Checks must not prompt.");
          },
          stop: async () => ({ confirmed: true }),
        };
        return client;
      },
    };
    const check = new ApiKeyChecks(
      { codex: adapter },
      detect,
      async () => new Response("{}", { status: 200 }),
    ).checkCandidate(
      { harness: "codex", provider_id: "openai", api_key: "fixture-key-never-save" },
      controller.signal,
    );
    if (outcome === "success") expect(await check).toEqual({ checked: true, model_count: 1 });
    else await expect(check).rejects.toThrow();
    expect(closed).toBe(true);
    expect(existsSync(directory)).toBe(false);
    if (outcome === "rejected" || outcome === "wrong_billing") expect(discovered).toBe(false);
  });
}

test("provider rejection cannot pass through a cached native catalog", async () => {
  let launched = false;
  const adapter: HarnessAdapter = {
    harness: "codex",
    connect: async () => {
      launched = true;
      throw new Error("Native launch must not run after rejection.");
    },
  };
  const checks = new ApiKeyChecks(
    { codex: adapter },
    detect,
    async () => new Response("invalid", { status: 401 }),
  );
  await expect(
    checks.checkCandidate({
      harness: "codex",
      provider_id: "openai",
      api_key: "invalid-fixture-key",
    }),
  ).rejects.toThrow("AUTH_REJECTED");
  expect(launched).toBe(false);
});

test("candidate checks have an exported transient HTTP operation contract", () => {
  const contract = httpContract([
    {
      method: "POST",
      path: "/v1/connections/api-key/check",
      hooks: {
        body: apiKeyConnectionInput.pick({ harness: true, provider_id: true, api_key: true }),
      },
    },
  ]);
  expect(JSON.stringify(contract)).toContain("model_count");
  expect(contract[0].semantics).toBe("operation");
  expect(contract[0].idempotency).toBe("not_applicable");
});
