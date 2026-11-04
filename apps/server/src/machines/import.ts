import { Database } from "bun:sqlite";
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { developmentConfig } from "../config";
import { workspace } from "../workspaces/contracts";
import { WorkspaceFiles } from "../workspaces/files";
import { readMachineConfiguration } from "./config";
import { CuaMachine, sha256 } from "./cua";

// Explicit, hash-verified import of managed legacy working files. Host files remain intact.
const config = developmentConfig();
const machine = readMachineConfiguration(config.stateDir);
if (!machine) throw new Error("Set up the retained machine before importing files.");
if (!existsSync(config.database)) throw new Error("No application database exists to import.");
const db = new Database(config.database, { readonly: true });
const sources = db
  .query<{ body: string }, []>("SELECT body FROM entities WHERE kind='workspace'")
  .all()
  .map((row) => workspace.parse(JSON.parse(row.body)));
db.close();
const files = new CuaMachine(machine).files();
const entries: { workspace_id: string; source: string; destination: string; sha256: string }[] = [];
const skipped: { workspace_id: string; reason: string }[] = [];
for (const source of sources) {
  if (source.machine_id || source.project_path || !source.root_device || !source.root_inode) {
    skipped.push({
      workspace_id: source.id,
      reason: source.project_path
        ? "External projects require a separate explicit import."
        : "No managed legacy root.",
    });
    continue;
  }
  const root = resolve(config.stateDir, "workspaces", source.id, "files");
  if (!existsSync(root)) {
    skipped.push({ workspace_id: source.id, reason: "Legacy root missing." });
    continue;
  }
  const old = new WorkspaceFiles(root, source.root_device, source.root_inode);
  const walk = async (path: string) => {
    let after = "";
    do {
      const page = old.list(path, after, 200);
      for (const entry of page.entries) {
        if (entry.type === "directory") await walk(entry.path);
        else if (entry.type === "file") {
          const bytes = old.read(entry.path);
          const destination = `imports/${source.id}/${entry.path}`;
          try {
            await files.create(destination, bytes);
          } catch (error) {
            if (sha256(await files.read(destination)) !== sha256(bytes)) throw error;
          }
          entries.push({
            workspace_id: source.id,
            source: entry.path,
            destination,
            sha256: sha256(bytes),
          });
        }
      }
      after = page.next_after ?? "";
    } while (after);
  };
  await walk("");
}
const manifest = join(config.stateDir, "machine-import.json");
writeFileSync(
  manifest,
  JSON.stringify(
    { machine_id: machine.id, date: new Date().toISOString(), entries, skipped },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    event: "machine.imported",
    files: entries.length,
    skipped_workspaces: skipped.length,
    manifest,
  }),
);
