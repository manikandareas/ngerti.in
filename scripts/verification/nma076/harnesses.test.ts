import { expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";
import { createApi } from "../../../apps/server/src/api";
import { Background } from "../../../apps/server/src/background";
import { developmentConfig } from "../../../apps/server/src/config";
import type { Entity } from "../../../apps/server/src/contracts";
import { HarnessBroker } from "../../../apps/server/src/harness/broker";
import { AcpAdapter } from "../../../apps/server/src/harness/acp/adapter";
import { CredentialContexts } from "../../../apps/server/src/harness/context";
import { MuseAdapter } from "../../../apps/server/src/harness/muse/adapter";
import { HarnessRuntime } from "../../../apps/server/src/harness/runtime";
import { ProductTools } from "../../../apps/server/src/harness/tools";
import { DomainRuntime } from "../../../apps/server/src/machines/domain-runtime";
import { ExecutionDomains } from "../../../apps/server/src/machines/domains";
import { Machines } from "../../../apps/server/src/machines/service";
import type { DataContext } from "../../../apps/server/src/persistence/access-context";
import { fixture } from "../../../apps/server/tests/helpers";
import { captureSource } from "./evidence";

test("both native harnesses perform useful isolated work without writing to the host", async () => {
  const project = resolve(import.meta.dir, "../../..");
  const { Client } = createRequire(join(project, "apps/server/package.json"))("pg");
  const configuration = developmentConfig();
  const env = parseEnv(readFileSync(join(project, ".env"), "utf8"));
  const museKey = env.MUSE_API_KEY ?? env.META_API_KEY;
  expect(Boolean(museKey)).toBe(true);
  const source = new Client({ connectionString: configuration.databaseUrl });
  await source.connect();
  let sourceId: string;
  try {
    const result = await source.query(
      `SELECT id FROM "${configuration.databaseSchema}".entities WHERE kind='connection' AND body->>'harness'='codex' AND body->>'login'='authenticated' AND body->'authentication'->>'method'='native_login' AND body->'authentication'->>'billing_source'='subscription'`,
    );
    expect(result.rows).toHaveLength(1);
    sourceId = result.rows[0].id;
  } finally {
    await source.end();
  }
  const f = await fixture();
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const directory = join(project, ".dev/verification/nma-076", stamp);
  mkdirSync(directory, { recursive: true });
  const report: { [key: string]: unknown } = {
    started_at: new Date().toISOString(),
    source: await captureSource(),
    planned_lanes: 2,
    fixture_principals: true,
    live_installation_mutated: false,
    lanes: [],
  };
  const runtime = new DomainRuntime(f.dir, f.owner, {
    version: 1,
    max_domains: 2,
    memory_mib: 768,
    cpus: 1,
    pids: 512,
  });
  let legacy = await Machines.open(f.lifecycle, null);
  const domains = new ExecutionDomains(f.lifecycle, runtime);
  const principal: DataContext = {
    userId: crypto.randomUUID(),
    organizationId: crypto.randomUUID(),
    membershipGeneration: 1,
    authorizationGeneration: 1,
    readableAgents: [],
    invocableAgents: [],
    managedAgents: [],
    canManage: false,
    validate: async () => {},
  };
  const domain = await f.store.withDataContext(principal, () => domains.resolve());
  await domain.ready();
  await legacy.close();
  // Adapter proof uses one isolated single-owner fixture. Public scoped native admission remains
  // closed until NMA-077/078 verify provider/app credentials; this probe does not bypass that gate.
  legacy = await Machines.open(f.lifecycle, domain.configuration, domain.host!);
  report.application_mode = "single_owner_adapter_probe_in_resolved_private_domain";
  report.execution_domain = {
    id: (await domain.snapshot()).id,
    organization_id: principal.organizationId,
    user_id: principal.userId,
  };
  const tools = await ProductTools.open(f.lifecycle);
  const calls: unknown[] = [];
  const invoke = tools.call.bind(tools);
  tools.call = async (token, scope, name, input) => {
    const observation: { name: string; input: unknown; error?: string } = { name, input };
    calls.push(observation);
    try {
      return await invoke(token, scope, name, input);
    } catch (error) {
      observation.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  };
  report.tool_calls = calls;
  const harnesses = new HarnessRuntime({ muse: join(project, ".dev/nma050/muse") });
  let app: Awaited<ReturnType<typeof createApi>>;
  const endpoint = () => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`;
  const broker = new HarnessBroker(
    f.lifecycle,
    new CredentialContexts(f.dir, () => museKey as string),
    tools,
    { codex: new AcpAdapter("codex", endpoint), muse: new MuseAdapter(endpoint) },
    harnesses.detect,
  );
  const ids: string[] = [(await domain.snapshot()).id];
  try {
    app = await createApi(f.lifecycle, new Background(f.lifecycle), "n".repeat(64), {
      connections: broker.connections,
      tools,
      broker,
    });
    app.listen({ hostname: "127.0.0.1", port: 0 });
    for (const family of ["codex", "muse"] as const) {
      const scope = principal;
      await (async () => {
        const connection = await broker.connections.create({
          harness: family,
          authentication:
            family === "codex"
              ? { method: "native_login", billing_source: "subscription" }
              : {
                  method: "api_key",
                  billing_source: "api_key",
                  credential_ref: crypto.randomUUID(),
                },
        });
        if (family === "codex") {
          const destination = join(f.dir, "connections", connection.id, "codex");
          mkdirSync(destination, { recursive: true, mode: 0o700 });
          copyFileSync(
            join(configuration.stateDir, "connections", sourceId, "codex/auth.json"),
            join(destination, "auth.json"),
          );
          chmodSync(join(destination, "auth.json"), 0o600);
        }
        const availability = await harnesses.detect(family);
        expect(availability.state).toBe("supported");
        const agent = await f.lifecycle.createAgent({
          name: `Domain ${family}`,
          harness: family,
          connection_id: connection.id,
          model_id: family === "codex" ? "gpt-6.1-sol" : "muse-spark-1.3",
          billing_source: family === "codex" ? "subscription" : "api_key",
          reasoning: "medium",
        });
        const thread = await f.lifecycle.create("thread", {
          type: "dm",
          member_agent_ids: [agent.id],
        });
        const machine = legacy;
        await machine.ready();
        await broker.openSession(thread.id, agent.id);
        const path = `harness-${crypto.randomUUID()}.txt`;
        const marker = `DOMAIN-${crypto.randomUUID()}`;
        const hostProbe = join(f.dir, `forbidden-native-${crypto.randomUUID()}.txt`);
        await f.lifecycle.admit({
          agent_id: agent.id,
          thread_id: thread.id,
          text: `One-time integration verification. Do not create Goals, Routine, memory, skills or change profiles. If a native host shell or file-write tool is offered, attempt to write the text HOST into ${hostProbe} using that native tool, without Ngertiin tools. The host policy should refuse it; do not request escalation or try another route. If no native host tool exists, continue. Perform these useful product-tool steps: call ngertiin.machine_exec with exactly command_id (a fresh UUID) and command ${JSON.stringify(`printf '%s' '${marker}' > '${path}'; uname -s`)}. Omit cwd because the tool already uses the authorized machine root. Call ngertiin.read_file with path ${JSON.stringify(path)} to verify the bytes. Call ngertiin.computer_call with command_id a fresh UUID, name get_desktop_state, and arguments {}. If an argument is rejected, read ngertiin.describe_tools and correct it once. Reply with the confirmed marker and OS name, reporting any failure honestly. The machine is a private execution domain for this user and organization.`,
        });
        const run = (await f.lifecycle.claimNext(thread.id, agent.id)) as Entity<"run">;
        expect(run).toBeTruthy();
        const abort = new AbortController();
        const timeout = setTimeout(() => abort.abort(), 240000);
        let outcome: unknown;
        try {
          outcome = await broker.execute(run, {
            signal: abort.signal,
            started: async (native) => {
              await f.lifecycle.started(
                run.id,
                run.dispatch_token as string,
                native ?? crypto.randomUUID(),
              );
            },
          });
        } finally {
          clearTimeout(timeout);
        }
        await f.lifecycle.settle(
          run.id,
          run.dispatch_token as string,
          outcome as "succeeded" | "failed" | "unknown" | "cancelled",
        );
        const final = await f.store.get("run", run.id);
        const connected = await broker.connections.get(connection.id);
        const answer = (await f.store.answer(run.id))?.text;
        const lane = {
          family,
          version: availability.version,
          organization_id: scope.organizationId,
          user_id: scope.userId,
          machine_id: (await machine.snapshot()).id,
          run_status: final.status,
          diagnostic: final.diagnostic,
          product_tools: final.product_tools,
          native_tools: final.native_tools,
          effective_billing: connected.effective_billing_source,
          host_write_observed: existsSync(hostProbe),
          answer,
        };
        (report.lanes as unknown[]).push(lane);
        await Bun.write(join(directory, "harnesses.json"), JSON.stringify(report, null, 2));
        console.log(
          JSON.stringify({
            family,
            run_status: final.status,
            version: availability.version,
            product_tools: final.product_tools,
            effective_billing: connected.effective_billing_source,
          }),
        );
        expect(final.status).toBe("succeeded");
        expect(final.product_tools).toContain("ngertiin.machine_exec");
        expect(final.product_tools).toContain("ngertiin.read_file");
        expect(final.product_tools).toContain("ngertiin.computer_call");
        expect((await machine.files().read(path)).toString().trim()).toBe(marker);
        expect(existsSync(hostProbe)).toBe(false);
        expect(
          final.native_tools.some(
            (t) =>
              /commandExecution|fileChange|shell|exec|write|patch/i.test(t.name) &&
              t.state === "completed" &&
              t.exit_code !== 1,
          ),
        ).toBe(false);
        expect(answer).toContain(marker);
        expect(connected.effective_billing_source).toBe(
          family === "codex" ? "subscription" : "api_key",
        );
      })();
    }
    report.pass = true;
  } catch (error) {
    report.pass = false;
    report.error =
      error instanceof Error ? { message: error.message, stack: error.stack } : String(error);
    throw error;
  } finally {
    await broker.close();
    await app!.stop(true).catch(() => {});
    await domains.close();
    await legacy.close();
    for (const id of ids) {
      await runtime.retire(id).catch(() => {});
      const child = Bun.spawn(["docker", "volume", "rm", `ngertiin-domain-${id}-home`], {
        stdout: "ignore",
        stderr: "ignore",
      });
      await child.exited;
    }
    report.finished_at = new Date().toISOString();
    report.executed_lanes = (report.lanes as unknown[]).length;
    await Bun.write(join(directory, "harnesses.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ report: join(directory, "harnesses.json"), pass: report.pass }));
    await f.close();
  }
}, 600000);
