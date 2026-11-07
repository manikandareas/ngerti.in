import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readMachineConfiguration } from "../../../apps/server/src/machines/config";
import { CuaMachine, sha256 } from "../../../apps/server/src/machines/cua";

// Read-only transport smoke. Do not acquire input control, create files or print credentials.
const output = resolve(import.meta.dir, "native-read.json");
const configuration = readMachineConfiguration(
  resolve(import.meta.dir, "../../../.dev/harness-first"),
);
const timer = setTimeout(() => {
  writeFileSync(
    output,
    JSON.stringify({ state: "unavailable", reason: "Read-only probe timed out." }, null, 2) + "\n",
  );
  process.exit(1);
}, 35_000);
let exitCode = 0;
try {
  if (!configuration) throw new Error("The retained machine is not configured.");
  const machine = new CuaMachine(configuration);
  const root = await machine.files().list("", "", 100);
  const projects = root.entries.find(
    (entry) => entry.name === "projects" && entry.type === "directory",
  );
  const children = projects ? await machine.files().list(projects.path, "", 100) : null;
  const proof = children?.entries.find(
    (entry) => entry.name === "desktop-check.txt" && entry.type === "file",
  );
  const bytes = proof ? await machine.files().read(proof.path) : null;
  const result = {
    state: "passed",
    root_entries_in_page: root.entries.length,
    child_listing: children ? "passed" : "skipped: known fixture folder absent",
    existing_fixture_read: bytes
      ? { state: "passed", path: proof?.path, bytes: bytes.length, sha256: sha256(bytes) }
      : { state: "skipped", reason: "Known retained fixture file absent." },
    scope:
      "Existing Cua machine list/stat/read transport only; no UI, input lease, provider inference or machine mutations.",
  };
  writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} catch (error) {
  exitCode = 1;
  const reason =
    error instanceof Error && !/token|http/i.test(error.message)
      ? error.message
      : "The retained machine is unavailable.";
  writeFileSync(output, JSON.stringify({ state: "unavailable", reason }, null, 2) + "\n");
  console.log(
    "Read-only machine transport unavailable; browser machine-boundary fixtures remain separate.",
  );
} finally {
  clearTimeout(timer);
  process.exit(exitCode);
}
