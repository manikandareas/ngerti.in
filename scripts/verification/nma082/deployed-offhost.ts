import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { verifyBackup } from "../../../apps/server/src/operations/recovery";
import { sha256 } from "../../../apps/server/src/operations/files";

if (process.env.NGERTIIN_NMA082_DEPLOYED !== "demo.ngerti.in")
  throw new Error("Select the explicitly authorized NMA-082 deployment.");
process.umask(0o077);
const name = process.argv[2] ?? "deployed-accepted.ngb";
if (!["deployed-accepted.ngb", "deployed-complete.ngb"].includes(name))
  throw new Error("Select a declared deployed snapshot.");
const source = resolve(".dev/nma082-live/offhost", name);
const sidecar = JSON.parse(readFileSync(`${source}.json`, "utf8"));
if (sha256(source) !== sidecar.backup_sha256)
  throw new Error("Finish the off-host transfer and match its published ciphertext digest first.");
const root = mkdtempSync(resolve(".dev/nma082-live/offhost/verify-"));
try {
  const state = join(root, "state");
  const trust = join(root, "trust");
  const environment = join(root, "verify.env");
  const config = join(root, "operations.json");
  writeFileSync(environment, `NGERTIIN_STATE_DIR=${JSON.stringify(state)}\nNGERTIIN_PROVIDER_MASTER_KEY_FILE=${JSON.stringify(join(trust, "provider.key"))}\nNGERTIIN_PROVIDER_REVOCATIONS_DIR=${JSON.stringify(join(trust, "revocations"))}\nNGERTIIN_DATABASE_URL=postgresql://ngertiin@localhost/ngertiin\n`, { mode: 0o600 });
  writeFileSync(config, JSON.stringify({ version: 1, environment_file: environment, state_dir: state, trust_dir: trust, backup_key_file: join(homedir(), ".ssh/mamvps-ngertiin-backup.key"), database_container: "ngertiin-server-postgres-1", database_name: "ngertiin", database_user: "ngertiin", service: "ngertiin.service", service_user: "ngertiin" }), { mode: 0o600 });
  const report = { ...await verifyBackup(config, source), verification_host: "operator-mac", independently_escrowed_key: true, authenticated_inventory: true };
  writeFileSync(`.dev/nma082-live/offhost-${name === "deployed-complete.ngb" ? "complete" : "accepted"}.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report));
} finally { rmSync(root, { recursive: true, force: true }); }
