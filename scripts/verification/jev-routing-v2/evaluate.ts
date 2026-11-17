import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { JevRouter, type RoutingDecision } from "../../../apps/server/src/groups/router";
import {
  ROUTING_POLICY_VERSION,
  type RoutingVariant,
  routingEvidence,
} from "../../../apps/server/src/groups/routing-policy";
import { routingCases } from "./cases";

assert(process.env.TYPESAFE_API_KEY, "The TypeSafe API key is required.");
const output = resolve(process.argv[2] ?? ".dev/verification/jev-routing-v2/evaluation.json");
const limit = Number(process.argv[3] ?? "220");
const variants: RoutingVariant[] = ["single", "batch"];
const cases = routingCases().slice(0, limit);
const results: object[] = [];
const summaries: object[] = [];
const report = {
  captured_at: new Date().toISOString(),
  policy_version: ROUTING_POLICY_VERSION,
  model: "jev-1.14.0",
  sdk: "@typesafe-ai/sdk@0.6.0",
  dataset_sha256: createHash("sha256").update(JSON.stringify(cases)).digest("hex"),
  cases: cases.length,
  results,
  summaries,
};
const save = async () => {
  mkdirSync(dirname(output), { recursive: true });
  await Bun.write(output, JSON.stringify(report, null, 2) + "\n");
};
for (const variant of variants) {
  const router = new JevRouter(process.env.TYPESAFE_API_KEY, 1500, undefined, variant);
  let cursor = 0;
  const rows: {
    split: string;
    duration_ms: number;
    correct: boolean;
    expected: string | null;
    accepted: boolean;
    error: boolean;
  }[] = [];
  await Promise.all(
    Array.from({ length: 2 }, async () => {
      while (cursor < cases.length) {
        const sample = cases[cursor++];
        const started = performance.now();
        let decision: RoutingDecision | undefined;
        try {
          decision = await router.choose(sample.packet, new AbortController().signal);
        } catch {}
        const evidence = decision ? routingEvidence(decision) : null;
        const row = {
          split: sample.split,
          duration_ms: Math.round(performance.now() - started),
          correct: decision?.agent_id === sample.expected,
          expected: sample.expected,
          accepted: evidence?.reason === "accepted",
          error: !decision,
        };
        rows.push(row);
        results.push({
          variant,
          id: sample.id,
          category: sample.category,
          ...row,
          actual: decision?.agent_id ?? null,
          confidence: decision?.confidence ?? null,
          probabilities: decision?.probabilities ?? null,
          routing_kind: decision?.routing_kind,
          recipient_probability: decision?.recipient_probability,
          evidence,
          input_tokens: decision?.input_tokens,
        });
      }
    }),
  );
  for (const split of ["all", "calibration", "held_out"]) {
    const selected = rows.filter((row) => split === "all" || row.split === split),
      durations = selected.map((r) => r.duration_ms).sort((a, b) => a - b);
    const accepted = selected.filter((r) => r.accepted);
    summaries.push({
      variant,
      split,
      cases: selected.length,
      correct: selected.filter((r) => r.correct).length,
      accepted: accepted.length,
      accepted_correct: accepted.filter((r) => r.correct).length,
      fallback: selected.filter((r) => !r.accepted).length,
      clear_cases: selected.filter((r) => r.expected !== null).length,
      clear_fallback: selected.filter((r) => r.expected !== null && !r.accepted).length,
      errors: selected.filter((r) => r.error).length,
      p50_ms: durations[Math.ceil(durations.length * 0.5) - 1],
      p95_ms: durations[Math.ceil(durations.length * 0.95) - 1],
    });
  }
  await save();
}
await save();
console.log(JSON.stringify({ output, summaries }, null, 2));
