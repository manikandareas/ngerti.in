import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
const directory = join(root, "docs/verification/nma-083");
const read = (name: string) => JSON.parse(readFileSync(join(directory, name), "utf8"));
const hash = (path: string) =>
  createHash("sha256")
    .update(readFileSync(join(root, path)))
    .digest("hex");
function requireProof(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const actors = read("actor-matrix.json");
requireProof(
  actors.completed && actors.checks.length === 10,
  "Complete the ten actor-matrix cases.",
);
for (const name of ["desktop", "mobile"]) {
  const browser = read(`browser-${name}.json`);
  requireProof(
    browser.completed && browser.checks.length === 6 && browser.page_errors.length === 0,
    `Complete ${name} browser acceptance.`,
  );
}
const tauri = read("tauri-journeys.json");
requireProof(tauri.pass === 9 && tauri.fail === 0, "Complete native actor journeys.");
const native = read("deployed-native.json");
const selectedProviders = JSON.parse(
  readFileSync(join(root, ".dev/nma082-live/provider-target.json"), "utf8"),
);
requireProof(native.completed, "Complete both final deployed native lanes.");
for (const harness of ["codex", "muse"]) {
  const lane = native.lanes[harness];
  requireProof(
    lane.account_fingerprint === selectedProviders[harness].account_fingerprint &&
      lane.model === selectedProviders[harness].model_id,
    "Preserve the explicitly selected provider account and model.",
  );
  requireProof(
    lane.status === "succeeded" &&
      lane.native_accepted &&
      lane.selected_connection_preserved &&
      lane.replay_same_run &&
      lane.working_bytes_verified &&
      lane.artifact_bytes_verified &&
      lane.grounded_marker_in_answer &&
      lane.actual_computer_observation,
    `Verify the ${harness} native file/Computer workflow.`,
  );
  requireProof(
    lane.billing === (harness === "codex" ? "subscription" : "api_key"),
    "Preserve each explicitly selected billing lane.",
  );
  if (!lane.explicit_attachment_read) {
    const followup = native.codex_attachment_read_followup;
    requireProof(
      harness === "codex" &&
        followup?.successful_read &&
        followup.marker_in_answer &&
        followup.provider_preserved &&
        followup.billing === "subscription",
      "Retain an explicit successful attachment-read receipt.",
    );
    requireProof(
      lane.attachment_observations.some(
        (entry: { artifact_id: string; source_sha256: string }) =>
          entry.artifact_id === followup.artifact_id &&
          entry.source_sha256 === followup.source_sha256,
      ),
      "Bind the read follow-up to the original immutable attachment.",
    );
  }
}
for (const name of ["deployed-isolation.json", "deployed-transport.json"]) {
  const report = read(name);
  requireProof(
    report.completed &&
      report.checks.length === 13 &&
      report.checks.every((check: { pass: boolean }) => check.pass),
    `Complete ${name}.`,
  );
}
const workload = read("workload.json");
requireProof(
  workload.completed && workload.samples.length === 18 && workload.errors.length === 0,
  "Complete the declared HTTP/SSE workload.",
);
const quit = read("deployed-client-quit.json");
const responsibility = read("responsibility-while-client-closed.json");
const run = responsibility.runs[0];
requireProof(
  run?.status === "succeeded" &&
    run.native_accepted &&
    run.product_tools.includes("ngertiin.read_run_context"),
  "Complete a native responsibility while the client is closed.",
);
requireProof(
  Date.parse(run.created_at) > Date.parse(quit.quit_observed_at) &&
    Date.parse(run.timings.settled_at) < Date.parse(quit.relaunch_requested_at),
  "Prove the responsibility finished before client relaunch.",
);
requireProof(
  read("tauri-human-control.json").lease.holder === "human" &&
    read("tauri-returned-control.json").lease.holder === "none",
  "Verify actual native input handback.",
);
requireProof(
  read("tauri-keychain-after-revocation.json").credential_absent_after_revocation,
  "Clear the revoked native renewal credential.",
);
const baseline = JSON.parse(
  readFileSync(join(root, "docs/verification/nma-082/live/release-r9-manifest.json"), "utf8"),
);
const runtime = Object.fromEntries(
  Object.keys(baseline.files)
    .filter((path) =>
      /^(apps\/(server\/src|web-client\/src|desktop\/src-tauri\/src)|packages\/avatar)\//.test(
        path,
      ),
    )
    .map((path) => [path, hash(path)]),
);
const deltas = Object.keys(runtime)
  .filter((path) => runtime[path] !== baseline.files[path])
  .sort();
const expected = [
  "apps/server/src/artifacts.ts",
  "apps/server/src/harness/broker.ts",
  "apps/server/src/lifecycle.ts",
];
requireProof(
  JSON.stringify(deltas) === JSON.stringify(expected),
  "Review any runtime delta outside the three accepted fixes.",
);
for (const [name, path] of [
  ["deployment-patch.json", expected[0]],
  ["deployment-catalog-patch.json", expected[1]],
  ["deployment-preparation-patch.json", expected[2]],
]) {
  const deployment = read(name!);
  requireProof(
    deployment.backup_verified && deployment.after_sha256 === runtime[path!],
    `Match deployed ${path} to verified local bytes.`,
  );
}
const cohortFiles = [
  "backend.log",
  "attachment-regression.log",
  "preparation-regression.log",
  "muse-catalog-regression.log",
  "api-gate.log",
  "browser-desktop-final.log",
  "browser-mobile-final.log",
  "matrix-final.log",
];
const cohorts = cohortFiles.map((name) => {
  const log = readFileSync(join(directory, name), "utf8");
  const passed = log.match(/\n\s*(\d+) pass\b/);
  const failed = log.match(/\n\s*(\d+) fail\b/);
  const filtered = log.match(/\n\s*(\d+) filtered out\b/);
  requireProof(passed && failed && Number(failed[1]) === 0, `Complete the ${name} cohort.`);
  return { file: name, pass: Number(passed[1]), fail: 0, filtered: Number(filtered?.[1] ?? 0) };
});
const sources = { ...runtime };
for (const path of [
  "bun.lock",
  "package.json",
  "apps/server/package.json",
  "apps/web-client/package.json",
  "apps/desktop/src-tauri/Cargo.lock",
])
  sources[path] = hash(path);
for (const name of readdirSync(join(root, "scripts/verification/nma083")))
  if (name.endsWith(".ts")) {
    const path = `scripts/verification/nma083/${name}`;
    sources[path] = hash(path);
  }
for (const name of ["attachments", "preparation", "muse-catalog", "workspace-access"]) {
  const path = `apps/server/tests/organizations/${name}.test.ts`;
  sources[path] = hash(path);
}
const inherited = [
  "docs/verification/nma-078/README.md",
  "docs/verification/nma-079/native/report.json",
  "docs/verification/nma-079/README.md",
  "docs/verification/nma-080/README.md",
  "docs/verification/nma-081/README.md",
  "docs/verification/nma-082/README.md",
  "docs/verification/nma-082/manifest.json",
  "docs/verification/nma-082/live/release-r9-manifest.json",
];
const manifest = {
  milestone: "NMA-083",
  captured_at: new Date().toISOString(),
  git_head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  source_state:
    "Mixed working tree; unrelated NMA-072 changes retained. No commit or distribution claim.",
  contract: read("api/contract.json").version,
  bun: Bun.version,
  local_host: { platform: process.platform, architecture: process.arch },
  actual_clients: [
    {
      name: "deployed_tauri",
      binary_sha256: hash(".dev/nma082-live/Ngertiin Demo.app/Contents/MacOS/ngertiin-desktop"),
      frontend_index_sha256: hash(
        ".dev/nma082-live/Ngertiin Demo.app/Contents/Resources/web/index.html",
      ),
      server_origin: "https://demo.ngerti.in",
      ui_port: 54985,
    },
    {
      name: "isolated_tauri",
      binary_sha256: hash(".dev/nma083/Ngertiin Acceptance.app/Contents/MacOS/ngertiin-desktop"),
      frontend_index_sha256: hash(
        ".dev/nma083/Ngertiin Acceptance.app/Contents/Resources/web/index.html",
      ),
      server_origin: "https://127.0.0.1:44433",
      ui_port: 54983,
      fixture_scheduler_interval_ms: 100,
    },
  ],
  deployed_target: JSON.parse(readFileSync(join(root, "infra/server/versions.amd64.json"), "utf8")),
  retained_release: baseline.release,
  retained_archive_sha256: baseline.sha256,
  runtime_deltas: deltas.map((path) => ({
    path,
    before_sha256: baseline.files[path],
    after_sha256: runtime[path],
  })),
  unchanged_retained_runtime_files: Object.keys(runtime).length - deltas.length,
  sha256: sources,
  authoritative_documents: [
    "PRODUCT.md",
    "docs/README.md",
    "docs/product/feature-decisions.md",
    "docs/architecture/overview.md",
    "docs/architecture/server-organizations-plan-2026-11-12.md",
    "docs/architecture/server-organizations-api.md",
    "docs/architecture/scoped-agent-data.md",
    "docs/architecture/provider-connections.md",
    "docs/development/acceptance.md",
    "docs/development/source-adoption.md",
    "docs/backlog/NMA-083.md",
    "docs/backlog/README.md",
    "docs/backlog/status.json",
    "docs/verification/nma-083/README.md",
  ].map((path) => ({ path, sha256: hash(path) })),
  inherited_evidence: inherited.map((path) => ({ path, sha256: hash(path) })),
  reused_internal_modules: [
    "apps/server/tests/organizations/readiness-helpers.ts",
    "scripts/verification/nma072/run-tests.ts",
    "scripts/verification/nma082/deployed-isolation.ts",
    "scripts/verification/nma082/deployed-transport.ts",
    "scripts/verification/nma082/tauri-launcher.c",
  ].map((path) => ({ path, sha256: hash(path), revision: baseline.git_head })),
  cohorts,
  overlapping_cohorts_aggregated: false,
  browser_cases: {
    desktop: 6,
    mobile: 6,
    execution: "separate disposable process/database for each viewport",
  },
  tauri_cases: { isolated: 9, deployed: 6 },
  deployed_native_lanes: 2,
  codex_explicit_read_followup: 1,
  actual_client_quit_responsibility: 1,
  public_transport_checks: 13,
  deployed_isolation_checks: 13,
  workload: {
    clients: 3,
    commands: 18,
    p95_command_roundtrip_ms: workload.p95_command_roundtrip_ms,
    p95_command_start_to_sse_delivery_ms: workload.p95_command_start_to_sse_delivery_ms,
    rss_bytes: workload.rss_bytes,
    native_inference: false,
  },
  private_material_excluded: true,
};
await Bun.write(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  JSON.stringify({
    milestone: "NMA-083",
    result: "pass",
    contract: manifest.contract,
    runtime_deltas: deltas.length,
    native_lanes: 2,
    tauri: 9,
    browser: 12,
    cohorts,
    production_capacity_claim: false,
  }),
);
