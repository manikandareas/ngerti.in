import { appendFileSync, existsSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
export function createLog(home: string, secrets: string[] = []) {
  const path = join(home, "desktop.log");
  return (event: string, detail: unknown = {}) => {
    try {
      if (existsSync(path) && statSync(path).size > 2_000_000) renameSync(path, `${path}.previous`);
      let line = JSON.stringify({ at: new Date().toISOString(), event, detail }, (key, value) =>
        /token|password|secret|api.?key|authorization|cookie/i.test(key) ? "[redacted]" : value,
      );
      for (const secret of secrets)
        if (secret.length > 7) line = line.replaceAll(secret, "[redacted]");
      line = line.replace(/Bearer\s+[^\s"\\]+/gi, "Bearer [redacted]");
      appendFileSync(path, `${line.slice(0, 8000)}\n`, { mode: 0o600 });
    } catch {
      /* Logging must not become a second failure during shutdown. */
    }
  };
}
export type Log = ReturnType<typeof createLog>;
