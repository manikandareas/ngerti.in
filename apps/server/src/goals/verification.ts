import type { VerifiedGoalFiles } from "./evidence";
import type { GoalVerification } from "./verification-contracts";

export function textMatches(bytes: Uint8Array, expected: string) {
  const normalize = (text: string) => text.replaceAll("\r\n", "\n").replace(/\n$/, "");
  try {
    return (
      normalize(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) === normalize(expected)
    );
  } catch {
    return false;
  }
}

export function evaluateGoalVerification(
  verification: GoalVerification,
  runId: string,
  files: VerifiedGoalFiles,
) {
  const results = verification.checks.map(({ title, artifact_name, exact_text }) => {
    const file = files.get(artifact_name);
    const status = !file
      ? "missing"
      : exact_text === undefined || (file.bytes && textMatches(file.bytes, exact_text))
        ? "passed"
        : "mismatch";
    return { title, artifact_name, status, artifact_id: file?.id ?? null } as const;
  });
  const saved: GoalVerification = {
    ...verification,
    attempts_used:
      verification.last_check?.run_id === runId
        ? verification.attempts_used
        : Math.min(verification.attempt_limit, verification.attempts_used + 1),
    last_check: { run_id: runId, results },
  };
  const remaining = results.flatMap((result) =>
    result.status === "passed"
      ? []
      : [
          `${result.title}: ${result.artifact_name} ${result.status === "missing" ? "is missing" : "does not match the required text"}.`,
        ],
  );
  const accepted = results.flatMap((result) =>
    result.status === "passed" && result.artifact_id ? [result.artifact_id] : [],
  );
  return { saved, remaining, accepted };
}
