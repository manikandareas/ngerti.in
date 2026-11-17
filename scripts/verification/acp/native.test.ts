import { expect, test } from "bun:test";
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { Background } from "../../../apps/server/src/background";
import type { Entity } from "../../../apps/server/src/contracts";
import { AcpAdapter } from "../../../apps/server/src/harness/acp/adapter";
import {
  acpProfiles,
  type AcpHarness,
  type PiCandidate,
} from "../../../apps/server/src/harness/acp/profiles";
import { manifests } from "../../../apps/server/src/harness/availability";
import { HarnessBroker } from "../../../apps/server/src/harness/broker";
import { Connections } from "../../../apps/server/src/harness/connections";
import { CredentialContexts } from "../../../apps/server/src/harness/context";
import { HarnessError } from "../../../apps/server/src/harness/contracts";
import { ProductTools } from "../../../apps/server/src/harness/tools";
import { fixture } from "../../../apps/server/tests/helpers";
import { fixtureApi } from "../../../apps/server/tests/http-fixture";
import { retainedCodex, selectedProbeKey } from "./native-credentials";

test.skipIf(process.env.NGERTIIN_ACP_NATIVE !== "1")(
  "record native ACP selected-billing inference, scoped tool, reload and receipt recovery separately from account isolation",
  async () => {
    const root = resolve(import.meta.dir, "../../..");
    const directory = join(root, ".dev/acp-native");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const report = {
      timestamp: new Date().toISOString(),
      scope:
        "disposable owner-mode PostgreSQL and real HTTP ProductTools; explicit provider/billing; no production mutations, account-mode privacy or UI claims",
      results: [] as Record<string, unknown>[],
    };
    const reportName = process.env.NGERTIIN_ACP_NATIVE_PROFILE ?? "all";
    if (!/^[a-z-]+$/.test(reportName)) throw new Error("Invalid verification profile.");
    const save = () =>
      Bun.write(join(directory, `${reportName}.json`), `${JSON.stringify(report, null, 2)}\n`);
    const binaries = join(import.meta.dir, "runtime/node_modules/.bin");
    for (const [harness, executable, candidate] of [
      ["codex", "codex-acp", undefined],
      ["opencode", "opencode", undefined],
      ["pi", "pi-acp", "upstream"],
      ["pi", "openma-pi-acp", "openma"],
    ] as [AcpHarness, string, PiCandidate | undefined][]) {
      const subscription = reportName === "codex-subscription";
      if (
        process.env.NGERTIIN_ACP_NATIVE_PROFILE &&
        process.env.NGERTIIN_ACP_NATIVE_PROFILE !== (candidate ?? harness) &&
        !(subscription && harness === "codex")
      )
        continue;
      const row: Record<string, unknown> = {
        harness,
        candidate,
        adapter: candidate === "openma" ? "0.1.8" : acpProfiles[harness].version,
        runtime: acpProfiles[harness].runtime_version,
        provider: "openai",
        billing: "api_key",
        inference: "not_attempted",
        useful_tool: "not_attempted",
        reload: "not_attempted",
      };
      report.results.push(row);
      row.billing = subscription ? "subscription" : "api_key";
      const key = subscription ? undefined : selectedProbeKey("openai");
      let tokens: Awaited<ReturnType<typeof retainedCodex>> | undefined;
      if (subscription) {
        try {
          tokens = await retainedCodex();
        } catch (error) {
          row.skip =
            error instanceof Error ? error.message : "Selected native authority unavailable.";
          await save();
          continue;
        }
      } else if (!key) {
        row.skip = "Explicit project OPENAI_API_KEY unavailable.";
        await save();
        continue;
      }
      const f = await fixture();
      let background: Background | undefined;
      let broker: HarnessBroker | undefined;
      let app: Awaited<ReturnType<typeof fixtureApi>> | undefined;
      let tools: ProductTools | undefined;
      const diagnostics: string[] = [];
      const updates: Record<string, number> = {};
      const phases: Record<string, number> = {};
      let observedRunId: string | undefined;
      try {
        const connections = new Connections(f.lifecycle);
        const connection = await connections.create({
          harness,
          provider_id: "openai",
          authentication: subscription
            ? { method: "native_login", billing_source: "subscription" }
            : { method: "api_key", billing_source: "api_key", credential_ref: crypto.randomUUID() },
        });
        const model = harness === "codex" ? "gpt-6.1-sol" : harness === "pi" ? "openai/gpt-5.4" : "openai/gpt-6.1-sol";
        const agent = (await f.lifecycle.create("agent", {
          name: "Native verification",
          harness,
          connection_id: connection.id,
          model_id: model,
          reasoning: null,
        })) as Entity<"agent">;
        const thread = (await f.lifecycle.create("thread", {
          type: "dm",
          member_agent_ids: [agent.id],
        })) as Entity<"thread">;
        tools = await ProductTools.open(f.lifecycle);
        const adapter = new AcpAdapter(
          harness,
          () => `http://127.0.0.1:${app?.server?.port}/v1/harness/tools`,
          {
            native_codex: join(binaries, "codex"),
            native_pi: join(binaries, "pi"),
            pi_candidate: candidate,
            diagnostic: (line) => {
              if (diagnostics.length < 40) diagnostics.push(line);
            },
            observeUpdate: (kind, phase) => {
              updates[kind] = (updates[kind] ?? 0) + 1;
              if (phase) phases[phase] = (phases[phase] ?? 0) + 1;
            },
          },
        );
        const detector = async () => ({
          harness,
          executable: join(binaries, executable),
          state: "supported" as const,
          version: acpProfiles[harness].version,
          manifest: manifests[harness],
        });
        const credentials = new CredentialContexts(f.dir, () => {
          if (!key) throw new Error("No selected API key.");
          return key;
        });
        if (tokens)
          credentials.codexTokens = async (_id, refresh) => {
            if (refresh) {
              row.native_refresh_required = true;
              // This probe reads a retained access token only; its existing authority owns renewal.
              throw new HarnessError("AUTH_REJECTED");
            }
            return tokens;
          };
        broker = new HarnessBroker(
          f.lifecycle,
          credentials,
          tools,
          { [harness]: adapter },
          detector,
        );
        background = new Background(f.lifecycle, broker.executors());
        app = (
          await fixtureApi(f.lifecycle, background, "v".repeat(64), { tools, broker, connections })
        ).listen({ hostname: "127.0.0.1", port: 0 });
        const marker = `ACP-${crypto.randomUUID()}`;
        for (let turn = 0; turn < 2; turn++) {
          const admitted = await f.lifecycle.admit({
            thread_id: thread.id,
            agent_id: agent.id,
            text:
              turn === 0
                ? `Call ngertiin.read_run_context with empty arguments. Reply with its thread_id and this marker: ${marker}. Do not create a Goal or Routine. Do not use host tools.`
                : "Call ngertiin.read_run_context again. Return the exact marker from the previous turn and the current thread_id. Do not create a Goal or Routine. Do not use host tools.",
          });
          observedRunId = admitted.run.id;
          await background.tick();
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              background.idle(),
              new Promise<never>((_, reject) => {
                timer = setTimeout(
                  () => reject(new Error("Native inference observation deadline reached.")),
                  120_000,
                );
              }),
            ]);
          } finally {
            clearTimeout(timer);
          }
          const run = await f.store.get("run", admitted.run.id);
          row[`turn_${turn + 1}`] = {
            status: run.status,
            diagnostic: run.diagnostic,
            timings: run.timings,
            native_turn_id: run.native_run_id !== null,
            dispatch_receipt: run.native_dispatch_id !== null,
            product_tools: run.product_tools,
            tool_errors: run.tool_errors.map((error) => error.code),
          };
          await save();
          if (run.status !== "succeeded") {
            row.inference = run.status === "unknown" ? "unknown" : "failed";
            row.useful_tool = run.product_tools.includes("ngertiin.read_run_context")
              ? "observed_before_failure"
              : "not_observed";
            row.diagnostics = diagnostics;
            row.answer_excerpt = (await f.store.answer(run.id))?.text.slice(0, 2000);
            await save();
          }
          expect(run.status).toBe("succeeded");
          expect(run.product_tools).toContain("ngertiin.read_run_context");
          const currentConnection = await connections.get(connection.id);
          expect(currentConnection.provider_id).toBe("openai");
          expect(currentConnection.effective_billing_source).toBe(row.billing as string);
          row.selection_scope = run.provider_selection
            ? "admitted_snapshot"
            : "owner_configuration";
          const answer = await f.store.answer(run.id);
          expect(answer?.text).toContain(marker);
          expect(answer?.text).toContain(thread.id);
          const binding = await f.store.get("binding", run.binding_id!);
          row[`binding_${turn + 1}`] = {
            transport: binding.transport,
            adapter: binding.adapter_version,
            runtime: binding.native_runtime_version,
            protocol: binding.protocol_version,
            process_generation: binding.process_generation,
            instruction_revision: binding.instruction_revision,
            native_session_id: binding.native_session_id,
          };
          if (harness === "codex" && run.native_dispatch_id) {
            const selected = await connections.get(connection.id);
            const recovery = await adapter.connect({
              ...credentials.create(selected, undefined, { externalCodexTokens: subscription }),
              executable: join(binaries, executable),
              connection_id: connection.id,
              agent_id: agent.id,
              thread_id: thread.id,
            });
            try {
              const receipt = await recovery.reconcile!(
                { native_session_id: binding.native_session_id },
                run.native_dispatch_id,
              );
              expect(receipt.status).toBe("succeeded");
              expect(receipt.text).toBe(answer?.text);
              row.receipt_recovery = "pass";
            } finally {
              await recovery.close();
            }
          }
          row.inference = "pass";
          row.useful_tool = "pass";
          if (turn === 1) row.reload = "pass";
        }
        expect(await f.store.list("goal", { thread_id: thread.id })).toHaveLength(0);
      } catch (error) {
        row.failure =
          error instanceof Error
            ? (key ? error.message.replaceAll(key, "[REDACTED]") : error.message).slice(0, 500)
            : "Native verification failed.";
      } finally {
        if (observedRunId) {
          const current = await f.store.get("run", observedRunId);
          row.final_observation = {
            status: current.status,
            diagnostic: current.diagnostic,
            preparation: current.preparation,
            timings: current.timings,
            native_turn_id: current.native_run_id !== null,
            dispatch_receipt: current.native_dispatch_id !== null,
            product_tools: current.product_tools,
          };
        }
        row.diagnostics = diagnostics;
        row.update_counts = updates;
        row.message_phase_counts = phases;
        await background?.stop(1000);
        await broker?.close();
        tools?.revokeAll();
        await app?.stop(true);
        let persisted = false;
        let skipped = 0;
        const secrets = [key, tokens?.accessToken]
          .filter((value): value is string => !!value)
          .map((value) => Buffer.from(value));
        const scan = (directory: string) => {
          for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) scan(path);
            else if (entry.isFile()) {
              if (statSync(path).size > 16_777_216) {
                skipped++;
                continue;
              }
              const bytes = readFileSync(path);
              if (secrets.some((secret) => bytes.includes(secret))) persisted = true;
            }
          }
        };
        scan(f.dir);
        row.provider_credential_bytes_persisted = persisted;
        row.credential_scan_skipped_files = skipped;
        await f.close();
        await save();
      }
    }
    report.results.push({
      harness: "claude",
      inference: "unverified",
      useful_tool: "unverified",
      skip: "Owner chose to retain unverified status; project Anthropic credential unavailable.",
    });
    await save();
    expect(
      report.results.filter((result) => result.harness !== "claude" && !result.skip).length,
    ).toBeGreaterThan(0);
    expect(
      report.results
        .filter((result) => result.harness !== "claude" && !result.skip)
        .every(
          (result) =>
            result.inference === "pass" &&
            result.provider_credential_bytes_persisted === false &&
            result.useful_tool === "pass" &&
            result.reload === "pass",
        ),
    ).toBe(true);
  },
  600_000,
);
