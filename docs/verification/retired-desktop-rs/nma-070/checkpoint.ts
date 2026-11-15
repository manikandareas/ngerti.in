/** Read-only native journey checkpoints. Never copy installation credentials or viewer URLs. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

const repository = resolve(import.meta.dir, "../../../..");
const state = resolve(repository, ".dev/harness-first");
const runtime = JSON.parse(await readFile(resolve(state, "runtime.json"), "utf8"));
const installation = JSON.parse(await readFile(resolve(state, "installation.json"), "utf8"));
const api = async (path: string) => {
  const response = await fetch(runtime.url + path, {
    headers: { Authorization: `Bearer ${installation.token}` },
  });
  if (!response.ok) throw new Error(`Checkpoint ${path}: HTTP ${response.status}`);
  return response.json();
};
const label = process.argv[2] ?? "checkpoint";
if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Select a checkpoint label.");
const profile = process.argv[3] ?? "nma070-proof";
if (!/^[a-z0-9-]+$/.test(profile)) throw new Error("Select an isolated proof profile.");
const counts: Record<string, number> = {};
for (const kind of ["run", "message", "goal", "routine"]) {
  const value = await api(`/v1/entities/${kind}`);
  const entries = Array.isArray(value) ? value : (value.items ?? value.entities);
  if (!Array.isArray(entries)) throw new Error(`No ${kind} collection`);
  counts[kind] = entries.length;
}
const result = {
  captured_at: new Date().toISOString(),
  backend_pid: runtime.pid,
  backend_instance: runtime.instance_id,
  contract_version: runtime.contract_version,
  counts,
  machine: await api("/v1/machine"),
  native: await readFile(
    resolve(
      homedir(),
      "Library/Application Support/Ngertiin Rust Development/profiles",
      profile,
      "computer-status.json",
    ),
    "utf8",
  )
    .then(JSON.parse)
    .catch(() => null),
  binary_sha256: await readFile(
    resolve(
      repository,
      "apps/desktop-rs/dist/Ngertiin Rust Development.app/Contents/MacOS/ngertiin-desktop",
    ),
  ).then((bytes) => createHash("sha256").update(bytes).digest("hex")),
};
const output = resolve(repository, `docs/verification/nma-070/${label}.json`);
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(output);
