import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { developmentConfig } from "../config";
import { domainPolicy } from "./domain-runtime";

// Explicit operator setup. This does not start, replace or delete any retained machine.
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2)
  args.set(process.argv[i] as string, process.argv[i + 1] ?? "");
const policy = domainPolicy.parse({
  version: 1,
  max_domains: Number(args.get("--max-domains")),
  memory_mib: Number(args.get("--memory-mib")),
  cpus: Number(args.get("--cpus")),
  pids: Number(args.get("--pids")),
});
const config = developmentConfig();
writeFileSync(join(config.stateDir, "execution-domains.json"), JSON.stringify(policy, null, 2), {
  mode: 0o600,
  flag: "wx",
});
console.log(JSON.stringify({ event: "execution_domains.configured", ...policy }));
