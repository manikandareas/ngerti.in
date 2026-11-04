import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type RuntimeRecord = {
  pid: number;
  instance_id: string;
  owner_id: string;
  url: string;
  contract_version: string;
  manager_id: string | null;
};

/** Discovery only. The Store authority lock remains the lifecycle authority. */
export function publishRuntime(stateDirectory: string, value: RuntimeRecord) {
  const path = join(stateDirectory, "runtime.json");
  const temporary = `${path}.${value.instance_id}`;
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600, flag: "wx" });
  renameSync(temporary, path);
  return {
    value,
    remove() {
      try {
        if (JSON.parse(readFileSync(path, "utf8")).instance_id === value.instance_id)
          unlinkSync(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
  };
}
