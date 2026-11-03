import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { JevRouter, type RoutingDecision } from "../../../apps/server/src/groups/router";
import {
  type RoutingVariant,
  routingEvidence,
} from "../../../apps/server/src/groups/routing-policy";
import { datasetHash, perturb, routingCases } from "./cases";
import { JevRouter as LegacyRouter } from "./legacy/router";
import { routingEvidence as legacyEvidence } from "./legacy/routing-policy";

const variant = process.argv[2] ?? "semantic";
const split = process.argv[3] ?? "development";
const output = process.argv[4] ?? `docs/verification/jev-routing-v3/${variant}-${split}.json`;
assert(["legacy", "single", "batch", "semantic"].includes(variant));
assert(process.env.TYPESAFE_API_KEY);
const base = routingCases().filter((sample) =>
  split === "all" || split === "invariance"
    ? split === "all" || sample.split === "test"
    : sample.split === split,
);
const cases =
  split === "invariance"
    ? base
        .filter((sample) => sample.expected.length === 1)
        .flatMap((sample) => [
          perturb(sample, "reverse"),
          perturb(sample, "rename"),
          perturb(sample, "irrelevant_history"),
        ])
    : base;
const router =
  variant === "legacy"
    ? new LegacyRouter(process.env.TYPESAFE_API_KEY)
    : new JevRouter(process.env.TYPESAFE_API_KEY, 1500, undefined, variant as RoutingVariant);
const results: {
  id: string;
  family: string;
  expected: string[];
  actual: string | null;
  correct: boolean;
  accepted: boolean;
  duration_ms: number;
  decision?: RoutingDecision;
  error?: string;
}[] = [];
const report: Record<string, unknown> = {
  captured_at: new Date().toISOString(),
  variant,
  split,
  dataset_sha256: datasetHash(),
  cases: cases.length,
  model: "jev-1.14.0",
  sdk: "0.6.0",
  results,
};
const sourcePaths =
  variant === "legacy"
    ? [
        "scripts/verification/jev-routing-v3/legacy/router.ts",
        "scripts/verification/jev-routing-v3/legacy/routing-policy.ts",
      ]
    : [
        "apps/server/src/groups/router.ts",
        "apps/server/src/groups/routing-policy.ts",
        "apps/server/src/groups/routing-context.ts",
        "apps/server/src/groups/routing-judgments.ts",
      ];
report.source_sha256 = Object.fromEntries(
  await Promise.all(
    sourcePaths.map(async (path) => [
      path,
      createHash("sha256")
        .update(await Bun.file(path).text())
        .digest("hex"),
    ]),
  ),
);
mkdirSync(dirname(output), { recursive: true });
let cursor = 0;
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (cursor < cases.length) {
      const sample = cases[cursor++],
        started = performance.now();
      try {
        const decision = await router.choose(sample.packet, new AbortController().signal);
        const accepted =
          (variant === "legacy"
            ? legacyEvidence({
                agent_id: decision.agent_id,
                model: decision.model,
                confidence: decision.confidence,
                probabilities: decision.probabilities,
                input_tokens: decision.input_tokens,
              })
            : routingEvidence(decision)
          ).reason === "accepted";
        results.push({
          id: sample.id,
          family: sample.family,
          expected: sample.expected,
          actual: decision.agent_id,
          correct:
            decision.agent_id === null
              ? sample.expected.length === 0
              : sample.expected.includes(decision.agent_id),
          accepted,
          duration_ms: Math.round(performance.now() - started),
          decision,
        });
      } catch (error) {
        results.push({
          id: sample.id,
          family: sample.family,
          expected: sample.expected,
          actual: null,
          correct: false,
          accepted: false,
          duration_ms: Math.round(performance.now() - started),
          error: error instanceof Error ? error.name : "Error",
        });
      }
    }
  }),
);
results.sort((a, b) => a.id.localeCompare(b.id));
const summarize = (rows: typeof results) => {
  const durations = rows.map((row) => row.duration_ms).sort((a, b) => a - b);
  return {
    cases: rows.length,
    correct: rows.filter((row) => row.correct).length,
    accepted: rows.filter((row) => row.accepted).length,
    accepted_correct: rows.filter((row) => row.accepted && row.correct).length,
    accepted_wrong: rows.filter((row) => row.accepted && !row.correct).length,
    resolvable: rows.filter((row) => row.expected.length > 0).length,
    resolvable_accepted: rows.filter((row) => row.expected.length > 0 && row.accepted).length,
    errors: rows.filter((row) => row.error).length,
    model_calls: rows.reduce((n, row) => n + (row.decision?.model_calls ?? (row.error ? 0 : 1)), 0),
    input_tokens: rows.reduce((n, row) => n + (row.decision?.input_tokens ?? 0), 0),
    p50_ms: durations[Math.ceil(rows.length * 0.5) - 1],
    p95_ms: durations[Math.ceil(rows.length * 0.95) - 1],
  };
};
report.summary = summarize(results);
report.families = Object.fromEntries(
  [...new Set(results.map((row) => row.family))].map((family) => [
    family,
    summarize(results.filter((row) => row.family === family)),
  ]),
);
report.finished_at = new Date().toISOString();
report.scenario_source_sha256 = createHash("sha256")
  .update(await Bun.file(import.meta.dir + "/scenarios.ts").text())
  .digest("hex");
await Bun.write(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ output, summary: report.summary }));
