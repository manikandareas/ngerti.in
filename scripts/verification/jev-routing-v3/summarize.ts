import assert from "node:assert/strict";
import { datasetHash } from "./cases";

type Row = {
  id: string;
  family: string;
  actual: string | null;
  correct: boolean;
  accepted: boolean;
  expected: string[];
  duration_ms: number;
  decision: { confidence: number; model_calls: number };
};
type Native = {
  id: string;
  actual: string | null;
  correct: boolean;
  duration_ms: number;
  status: string;
  error: string | null;
};
const test = await Bun.file(".dev/verification/jev-routing-v3/semantic-test.json").json();
const invariance = await Bun.file(
  ".dev/verification/jev-routing-v3/semantic-invariance.json",
).json();
const fallback = await Bun.file(".dev/verification/jev-routing-v3/fallback-quality.json").json();
for (const report of [test, invariance, fallback])
  assert.equal(report.dataset_sha256, datasetHash());
const native = new Map<string, Native>(fallback.results.map((row: Native) => [row.id, row]));
const final = (rows: Row[]) =>
  rows.map((row) => {
    const next = native.get(row.id);
    assert(row.accepted || next, "Every withheld result must have an observed fallback result.");
    return {
      ...row,
      final_actual: row.accepted ? row.actual : next!.actual,
      final_correct: row.accepted ? row.correct : next!.correct,
      total_ms: row.duration_ms + (row.accepted ? 0 : next!.duration_ms),
    };
  });
const finalTest = final(test.results),
  finalVariants = final(invariance.results);
const quantiles = (values: number[]) => {
  const sorted = values.toSorted((a, b) => a - b);
  return {
    n: sorted.length,
    p50_ms: sorted[Math.ceil(sorted.length * 0.5) - 1] ?? null,
    p95_ms: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null,
  };
};
const summarize = (rows: ReturnType<typeof final>) => ({
  cases: rows.length,
  jev_accepted: rows.filter((row) => row.accepted).length,
  jev_accepted_wrong: rows.filter((row) => row.accepted && !row.correct).length,
  fallbacks: rows.filter((row) => !row.accepted).length,
  final_correct: rows.filter((row) => row.final_correct).length,
  unnecessary_clarifications: rows.filter(
    (row) => row.final_actual === null && row.expected.length > 0,
  ).length,
  wrong_member_selections: rows.filter(
    (row) => row.final_actual !== null && !row.expected.includes(row.final_actual),
  ).length,
  jev_latency: quantiles(rows.map((row) => row.duration_ms)),
  single_call_jev_latency: quantiles(
    rows.filter((row) => row.decision.model_calls === 1).map((row) => row.duration_ms),
  ),
  two_call_jev_latency: quantiles(
    rows.filter((row) => row.decision.model_calls === 2).map((row) => row.duration_ms),
  ),
  native_fallback_latency: quantiles(
    rows.filter((row) => !row.accepted).map((row) => native.get(row.id)!.duration_ms),
  ),
  combined_sequential_latency: quantiles(rows.map((row) => row.total_ms)),
});
const baseline = new Map(finalTest.map((row) => [row.id, row]));
const consistency = finalVariants.map((row) => {
  const original = baseline.get(row.id.split(":")[0])!;
  assert(original);
  return {
    id: row.id,
    raw_jev_consistent: row.actual === original.actual,
    accepted_path_consistent:
      row.accepted && original.accepted ? row.actual === original.actual : null,
    final_consistent: row.final_actual === original.final_actual,
  };
});
const bins = [
  [0, 0.5],
  [0.5, 0.6],
  [0.6, 0.7],
  [0.7, 0.8],
  [0.8, 0.9],
  [0.9, 1.001],
].map(([low, high]) => {
  const rows = (test.results as Row[]).filter(
    (row) =>
      row.actual !== null && row.decision.confidence >= low && row.decision.confidence < high,
  );
  return {
    confidence_min: low,
    confidence_max: Math.min(1, high),
    cases: rows.length,
    mean_confidence: rows.length
      ? rows.reduce((sum, row) => sum + row.decision.confidence, 0) / rows.length
      : null,
    observed_correct: rows.filter((row) => row.correct).length,
  };
});
const n = finalTest.filter((row) => row.accepted).length;
const report = {
  captured_at: new Date().toISOString(),
  dataset_sha256: datasetHash(),
  protocol:
    "520 authored scenarios, split 216 development / 104 diagnostic validation / 40 fresh calibration / 160 frozen final test. Perturbations are dependent checks, not independent scenarios. Parameters and prompts were frozen before final inference. No final-test tuning.",
  test: summarize(finalTest),
  invariance: summarize(finalVariants),
  consistency: {
    baselines: baseline.size,
    unique_actor_baselines: new Set(consistency.map((row) => row.id.split(":")[0])).size,
    variants: consistency.length,
    raw_jev_consistent: consistency.filter((row) => row.raw_jev_consistent).length,
    final_consistent: consistency.filter((row) => row.final_consistent).length,
    rows: consistency,
  },
  families: Object.fromEntries(
    [...new Set(finalTest.map((row) => row.family))].map((family) => [
      family,
      summarize(finalTest.filter((row) => row.family === family)),
    ]),
  ),
  confidence_bins: bins,
  uncertainty: {
    accepted_wrong: 0,
    accepted_cases: n,
    nominal_one_sided_95_percent_binomial_error_upper: 1 - 0.05 ** (1 / n),
    limitation:
      "This nominal bound assumes independent representative Bernoulli trials. Authored family-related scenarios do not establish that assumption or a production error rate. Confidence is model self-assessment, not a calibrated success probability.",
  },
  remaining: finalTest
    .filter((row) => !row.final_correct)
    .map((row) => ({
      id: row.id,
      expected: row.expected,
      actual: row.final_actual,
      native: native.get(row.id),
    })),
  scope:
    "Measured Jev wall time plus separately measured isolated native classification time. Not production task latency or a provider SLO. Native fallback classification executed no scenario work or tools.",
};
await Bun.write(
  ".dev/verification/jev-routing-v3/quality.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    test: report.test,
    invariance: report.invariance,
    consistency: {
      raw: report.consistency.raw_jev_consistent,
      final: report.consistency.final_consistent,
      total: consistency.length,
    },
  }),
);
