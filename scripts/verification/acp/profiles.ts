import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { AcpClient } from "../../../apps/server/src/harness/acp/adapter";
import type { AcpHarness, PiCandidate } from "../../../apps/server/src/harness/acp/profiles";
import { CredentialContexts } from "../../../apps/server/src/harness/context";
import { connection, unknownCapabilities } from "../../../apps/server/src/harness/contracts";
import { HarnessRuntime } from "../../../apps/server/src/harness/runtime";

const binaries = resolve("scripts/verification/acp/runtime/node_modules/.bin");
const managed = process.env.NGERTIIN_ACP_PROFILE_RUNTIME === "managed";
const runtime = managed ? new HarnessRuntime() : undefined;
const results: unknown[] = [];
for (const [harness, executable, candidate] of [
  ["codex", "codex-acp", undefined],
  ["claude", "claude-agent-acp", undefined],
  ["opencode", "opencode", undefined],
  ["pi", "pi-acp", "upstream"],
  ["pi", "openma-pi-acp", "openma"],
] as [AcpHarness, string, PiCandidate | undefined][]) {
  const directory = mkdtempSync(join(tmpdir(), "ngertiin-acp-profile-"));
  const diagnostics: string[] = [];
  const row: Record<string, unknown> = {
    harness,
    candidate,
    credentials: "synthetic_invalid_key",
    inference: "not_attempted",
    useful_tool: "not_attempted",
    installation: managed && candidate !== "openma" ? "app_managed" : "verification_prefix",
  };
  let client: AcpClient | undefined;
  const started = performance.now();
  try {
    const observed = await runtime?.detect(harness);
    if (observed && (observed.state !== "supported" || !observed.executable))
      throw new Error(`Managed ${harness} installation is ${observed.state}.`);
    const adapterExecutable =
      observed && candidate !== "openma" ? observed.executable! : join(binaries, executable);
    row.executable = adapterExecutable;
    row.observed_version = observed?.version;
    const nativeCodex = runtime
      ? ((await runtime.nativeCodex()).executable ?? undefined)
      : join(binaries, "codex");
    const nativePi =
      managed && harness === "pi" && observed?.executable
        ? join(dirname(observed.executable), "pi")
        : join(binaries, "pi");
    const now = new Date().toISOString();
    const selected = connection.parse({
      kind: "connection",
      id: crypto.randomUUID(),
      owner_id: crypto.randomUUID(),
      revision: 1,
      created_at: now,
      updated_at: now,
      harness,
      provider_id: harness === "claude" ? "anthropic" : "openai",
      authentication: {
        method: "api_key",
        billing_source: "api_key",
        credential_ref: crypto.randomUUID(),
      },
      state: "active",
      grant_revision: 1,
      account_id: null,
      login: "unknown",
      discovery: "not_attempted",
      models: [],
      inference: "not_attempted",
      capabilities: unknownCapabilities,
    });
    const context = new CredentialContexts(directory, () => "fixture-catalog-key-not-valid").create(
      selected,
    );
    mkdirSync(join(directory, "control"), { recursive: true });
    client = new AcpClient(
      harness,
      {
        ...context,
        scoped: true,
        executable: adapterExecutable,
        connection_id: selected.id,
        agent_id: crypto.randomUUID(),
        thread_id: crypto.randomUUID(),
        instructions: "Private application instruction probe.",
      },
      () => "http://127.0.0.1:1",
      {
        native_codex: nativeCodex,
        native_pi: nativePi,
        pi_candidate: candidate,
        diagnostic: (line) => {
          if (diagnostics.length < 20) diagnostics.push(line);
        },
      },
    );
    await client.initialize();
    row.initialize = "pass";
    const inspected = await client.inspect();
    row.configured_credential = inspected.login;
    row.billing = inspected.billing_source;
    const models = await client.discoverModels();
    row.catalog = models.length ? "pass" : "empty";
    row.model_count = models.length;
    const model = models.find((model) => /(?:^|\/)gpt-5\.4$/.test(model.id)) ?? models[0];
    if (model) {
      row.model_id = model.id;
      const identity = await client.start({ model_id: model.id, reasoning: null });
      row.new_session = identity.native_session_id ? "pass" : "fail";
    }
  } catch (error) {
    row.error_code =
      error && typeof error === "object" && "code" in error ? error.code : "operation_failed";
    if (error instanceof Error)
      row.error_detail = error.message
        .replaceAll("fixture-catalog-key-not-valid", "[REDACTED]")
        .slice(0, 2000);
    row.diagnostics = diagnostics;
    if (harness === "pi") {
      const files: unknown[] = [];
      const scan = (path: string) => {
        for (const entry of readdirSync(path, { withFileTypes: true })) {
          const file = join(path, entry.name);
          if (entry.isDirectory()) scan(file);
          else if (
            entry.name === "auth.json" ||
            entry.name === "settings.json" ||
            entry.name === "models.json"
          ) {
            try {
              const data = JSON.parse(readFileSync(file, "utf8"));
              files.push({
                path: file.slice(directory.length),
                keys: Object.keys(data),
                empty: Object.keys(data).length === 0,
              });
            } catch {}
          }
        }
      };
      scan(directory);
      row.private_configuration = files;
    }
  } finally {
    await client?.close();
    row.setup_and_cleanup_ms = Math.round(performance.now() - started);
    let persisted = false;
    let skipped = 0;
    const scanCredentialBytes = (path: string) => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const file = join(path, entry.name);
        if (entry.isDirectory()) scanCredentialBytes(file);
        else if (entry.isFile()) {
          if (statSync(file).size > 16_777_216) skipped++;
          else if (readFileSync(file).includes(Buffer.from("fixture-catalog-key-not-valid")))
            persisted = true;
        }
      }
    };
    scanCredentialBytes(directory);
    row.credential_bytes_persisted = persisted;
    row.credential_scan_skipped_files = skipped;
    rmSync(directory, { recursive: true, force: true });
  }
  results.push(row);
}
console.log(
  JSON.stringify(
    { timestamp: new Date().toISOString(), sdk: "2.7.0", protocol: 1, results },
    null,
    2,
  ),
);
