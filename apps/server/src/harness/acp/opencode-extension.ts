import { createHash } from "node:crypto";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// OpenCode 1.19.5's public plugin event hook exposes actionable quota retries that
// its ACP event projection omits. Do not parse provider prose or interrupt transient retries.
const source = `
const emit = event => process.stderr.write(process.env.NGERTIIN_OPENCODE_EVENTS + " " + JSON.stringify(event) + "\\n");
export default async () => {
  emit({type: "ready"});
  return {event: async ({event}) => {
    if (event.type !== "session.status") return;
    const {sessionID, status} = event.properties;
    if (status.type !== "retry" || !["free_tier_limit", "account_rate_limit"].includes(status.action?.reason)) return;
    emit({type: "failure", sessionId: sessionID, code: "PROVIDER_LIMIT"});
  }};
};
`;

export function opencodeExtension(directory: string) {
  const hash = createHash("sha256").update(source).digest("hex");
  const cache = join(directory, "acp-adapters");
  mkdirSync(cache, { recursive: true, mode: 0o700 });
  const path = join(cache, `${hash}-opencode.mjs`);
  const temporary = join(cache, `${hash}-${crypto.randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, source, { mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
  return { path, prefix: `NGERTIIN_OPENCODE_${crypto.randomUUID()}` };
}
