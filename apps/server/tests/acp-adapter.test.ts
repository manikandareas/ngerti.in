import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Background } from "../src/background";
import type { Entity } from "../src/contracts";
import { AcpAccounts } from "../src/harness/acp/accounts";
import { AcpAdapter } from "../src/harness/acp/adapter";
import { manifests } from "../src/harness/availability";
import { HarnessBroker } from "../src/harness/broker";
import { assertScopedCatalog } from "../src/harness/catalog-policy";
import { Connections } from "../src/harness/connections";
import { CredentialContexts } from "../src/harness/context";
import { sessionInstructions } from "../src/harness/instructions";
import { ProductTools } from "../src/harness/tools";
import { RunControls } from "../src/run-controls";
import { Workspaces } from "../src/workspaces/service";
import { fixture } from "./helpers";
import { fixtureApi } from "./http-fixture";

const cleanups: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

for (const harness of ["claude", "opencode"] as const) {
  test(`${harness} ACP adapter completes a scoped product-tool run and reloads with binding metadata`, async () => {
    const f = await fixture();
    cleanups.push(() => f.close());
    const script = join(f.dir, `${harness}-acp`);
    writeFileSync(
      script,
      `#!/usr/bin/env bun\nprocess.env.NGERTIIN_TEST_ACP_PROFILE=${JSON.stringify(harness)};\nawait import(${JSON.stringify(pathToFileURL(join(import.meta.dir, "fixtures/acp-agent.ts")).href)});\n`,
      { mode: 0o700 },
    );
    const connections = new Connections(f.lifecycle);
    const connection = await connections.create({
      harness,
      provider_id: harness === "claude" ? "anthropic" : "openai",
      authentication: {
        method: "api_key",
        billing_source: "api_key",
        credential_ref: crypto.randomUUID(),
      },
    });
    const model = harness === "opencode" ? "openai/model-b" : "model-b";
    const agent = (await f.lifecycle.create("agent", {
      name: "ACP helper",
      harness,
      connection_id: connection.id,
      model_id: model,
      reasoning: "low",
    })) as Entity<"agent">;
    const thread = (await f.lifecycle.create("thread", {
      type: "dm",
      member_agent_ids: [agent.id],
    })) as Entity<"thread">;
    const credentials = new CredentialContexts(f.dir, () => "selected-profile-key");
    const tools = await ProductTools.open(f.lifecycle);
    let app: Awaited<ReturnType<typeof fixtureApi>> | undefined;
    const adapter = new AcpAdapter(
      harness,
      () => `http://127.0.0.1:${app?.server?.port}/v1/harness/tools`,
    );
    const detector = async () => ({
      harness,
      executable: script,
      state: "supported" as const,
      version: manifests[harness].minimum_version,
      manifest: manifests[harness],
    });
    const broker = new HarnessBroker(
      f.lifecycle,
      credentials,
      tools,
      { [harness]: adapter },
      detector,
    );
    cleanups.push(() => broker.close());
    const accounts = new AcpAccounts(connections, credentials, adapter, detector);
    cleanups.push(() => accounts.close());
    const inspected = await accounts.inspect(connection.id);
    expect(inspected).toMatchObject({
      harness,
      provider_id: connection.provider_id,
      login: "authenticated",
      discovery: "succeeded",
      inference: "not_attempted",
      effective_billing_source: "api_key",
    });
    const background = new Background(f.lifecycle, broker.executors());
    cleanups.push(() => background.stop());
    app = (
      await fixtureApi(f.lifecycle, background, "k".repeat(64), { tools, broker, connections })
    ).listen({ hostname: "127.0.0.1", port: 0 });
    cleanups.push(() => app?.stop(true));
    const generations: string[] = [];
    const bindings: string[] = [];
    for (let turn = 0; turn < 2; turn++) {
      const binding = await broker.openSession(thread.id, agent.id);
      expect(binding).toMatchObject({
        transport: "acp",
        protocol_version: 1,
        adapter_version: manifests[harness].minimum_version,
      });
      expect(binding.instruction_revision).toMatch(/^[a-f0-9]{64}$/);
      generations.push(binding.process_generation as string);
      bindings.push(binding.id);
      const admitted = await f.lifecycle.admit({
        thread_id: thread.id,
        agent_id: agent.id,
        text: "tool",
      });
      await background.tick();
      await background.idle();
      const run = await f.store.get("run", admitted.run.id);
      expect(run.status).toBe("succeeded");
      expect(run.native_run_id).toBeNull();
      expect((await f.store.answer(run.id))?.text).toBe("Hello world");
      expect(run.product_tools).toContain("ngertiin.read_run_context");
      expect(run.native_progress?.plans[0]?.entries[0]?.state).toBe("completed");
      expect(run.native_progress?.usage).toMatchObject({ used: 12, size: 1000 });
      expect(await f.store.list("goal", { thread_id: thread.id })).toHaveLength(0);
    }
    expect(bindings[0]).toBe(bindings[1]);
    expect(generations[0]).not.toBe(generations[1]);
    expect(
      (await f.store.list("message", { thread_id: thread.id })).filter(
        (message) => message.author === "agent",
      ),
    ).toHaveLength(2);
  });
}

test("transport migration retains only authorized settled conversation history and fences unsettled work", async () => {
  const f = await fixture();
  cleanups.push(() => f.close());
  const original = await f.bind();
  const admitted = await f.admit("Retained question");
  const run = await f.lifecycle.claimNext(f.thread.id, f.agent.id);
  if (!run?.dispatch_token) throw new Error("Missing dispatch.");
  await f.lifecycle.started(run.id, run.dispatch_token);
  const workspaces = new Workspaces(f.lifecycle);
  const workspace = await workspaces.ensure(f.thread.id, f.agent.id);
  const metadata = {
    transport: "acp" as const,
    adapter_version: "2.6.0",
    native_runtime_version: "0.169.0",
    protocol_version: 1,
    process_generation: crypto.randomUUID(),
    instruction_revision: "a".repeat(64),
  };
  await expect(
    f.lifecycle.bind(f.thread.id, f.agent.id, "acp-new-session", workspace, undefined, metadata),
  ).rejects.toThrow("CONFLICT");
  expect((await f.store.get("binding", original.id)).active).toBe(true);
  await f.lifecycle.appendAnswer(run.id, "Retained answer");
  const controls = new RunControls(f.lifecycle);
  const correction = await f.admit("Delivered steering correction");
  const accepted = await controls.requestSteer(run.id, { queued_run_id: correction.run.id });
  await controls.settleSteer(accepted.id, "accepted");
  const uncertain = await f.admit("Unknown steering delivery must stay private");
  const unconfirmed = await controls.requestSteer(run.id, { queued_run_id: uncertain.run.id });
  await controls.settleSteer(unconfirmed.id, "unknown");
  await f.lifecycle.settle(run.id, run.dispatch_token, "succeeded");
  const queued = await f.admit("Must not be replayed into history");
  const instructions = await sessionInstructions(
    f.lifecycle,
    await f.store.get("agent", f.agent.id),
    f.thread.id,
    workspaces,
    workspace.id,
    workspaces.path(workspace),
    "acp",
  );
  expect(instructions).toContain(admitted.message.text);
  expect(instructions).toContain("Retained answer");
  expect(instructions).toContain(correction.message.text);
  expect(instructions).not.toContain(uncertain.message.text);
  expect(instructions).not.toContain(queued.message.text);
  const replacement = await f.lifecycle.bind(
    f.thread.id,
    f.agent.id,
    "acp-new-session",
    workspace,
    undefined,
    metadata,
  );
  expect(replacement).toMatchObject({
    replaces_binding_id: original.id,
    replacement_reason: "transport_changed",
    native_session_id: "acp-new-session",
    transport: "acp",
  });
  expect((await f.store.get("binding", original.id)).active).toBe(false);
  expect((await f.store.get("run", run.id)).binding_id).toBe(original.id);
  expect((await f.store.answer(run.id))?.text).toBe("Retained answer");
});

test("additive native discovery preserves admission authority while capability or catalog loss retires it", async () => {
  const f = await fixture();
  cleanups.push(() => f.close());
  const connections = new Connections(f.lifecycle);
  const created = await connections.create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  let current = await connections.update(created, {
    login: "authenticated",
    account_id: "selected-account",
    effective_billing_source: "subscription",
    models: [{ id: "model-a", reasoning: ["high"] }],
  });
  const admittedGeneration = current.grant_revision;
  current = await connections.update(current, {
    account_plan: "plus",
    capabilities: {
      ...current.capabilities,
      product_tools: "supported",
      permission_requests: "supported",
    },
    models: [...current.models, { id: "model-b", reasoning: [] }],
  });
  expect(current.grant_revision).toBe(admittedGeneration);
  current = await connections.update(current, {
    models: [
      { id: "model-a", reasoning: [] },
      { id: "model-b", reasoning: [] },
    ],
  });
  expect(current.grant_revision).toBe(admittedGeneration + 1);
  current = await connections.update(current, {
    capabilities: { ...current.capabilities, product_tools: "unsupported" },
  });
  expect(current.grant_revision).toBe(admittedGeneration + 2);
  current = await connections.update(current, { account_id: "different-account" });
  expect(current.grant_revision).toBe(admittedGeneration + 3);
  current = await connections.update(current, { state: "revoked" });
  expect(current.grant_revision).toBe(admittedGeneration + 4);
});

test("multi-provider connections require a provider and never route new keys through Muse", async () => {
  const f = await fixture();
  cleanups.push(() => f.close());
  const connections = new Connections(f.lifecycle);
  for (const harness of ["opencode", "pi"] as const) {
    await expect(
      connections.create({
        harness,
        authentication: {
          method: "api_key",
          billing_source: "api_key",
          credential_ref: crypto.randomUUID(),
        },
      }),
    ).rejects.toMatchObject({ code: "CAPABILITY_UNSUPPORTED" });
    for (const provider of ["anthropic", "openai"]) {
      const connection = await connections.create({
        harness,
        provider_id: provider,
        authentication: {
          method: "api_key",
          billing_source: "api_key",
          credential_ref: crypto.randomUUID(),
        },
      });
      const context = new CredentialContexts(f.dir, () => "selected-key").create(connection);
      expect(context.env[provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"]).toBe(
        "selected-key",
      );
      expect(context.env.META_API_KEY).toBeUndefined();
      expect(
        context.env[provider === "anthropic" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"],
      ).toBeUndefined();
    }
  }
  await expect(
    connections.create({
      harness: "claude",
      provider_id: "openai",
      authentication: {
        method: "api_key",
        billing_source: "api_key",
        credential_ref: crypto.randomUUID(),
      },
    }),
  ).rejects.toMatchObject({ code: "BILLING_MISMATCH" });
});

test("Pi trusted configuration permits only empty native auth and refuses symlink/settings inheritance", async () => {
  const f = await fixture();
  cleanups.push(() => f.close());
  const connection = await new Connections(f.lifecycle).create({
    harness: "pi",
    provider_id: "openai",
    authentication: {
      method: "api_key",
      billing_source: "api_key",
      credential_ref: crypto.randomUUID(),
    },
  });
  const context = {
    ...new CredentialContexts(f.dir, () => "selected-key").create(connection),
    scoped: true,
  };
  mkdirSync(context.env.PI_CODING_AGENT_DIR, { recursive: true });
  const trusted = {
    nativeMcpPath: join(context.env.PI_CODING_AGENT_DIR, "mcp.json"),
    nativeSettingsPath: join(context.env.PI_CODING_AGENT_DIR, "settings.json"),
    emptyNativeAuthPath: join(context.env.PI_CODING_AGENT_DIR, "auth.json"),
  };
  writeFileSync(trusted.emptyNativeAuthPath, "{}");
  expect(() => assertScopedCatalog(context, trusted)).not.toThrow();
  writeFileSync(trusted.emptyNativeAuthPath, '{"other-provider":{"type":"api_key"}}');
  expect(() => assertScopedCatalog(context, trusted)).toThrow("BILLING_MISMATCH");
  writeFileSync(trusted.emptyNativeAuthPath, "{}");
  const other = join(f.dir, "unrelated.json");
  writeFileSync(other, "{}");
  symlinkSync(other, trusted.nativeSettingsPath);
  expect(() => assertScopedCatalog(context, trusted)).toThrow("CAPABILITY_UNSUPPORTED");
  expect(readFileSync(other, "utf8")).toBe("{}");
});
