import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const machineConfiguration = z.strictObject({
  id: z.uuid(),
  endpoint: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  }, "The initial machine must use a local loopback endpoint."),
  token: z.string().min(32).max(512),
  root: z.literal("/home/cua/workspace"),
  generation: z.int().positive().default(1),
  project: z.string().regex(/^ngertiin-machine-[a-f0-9-]+$/),
});
export type MachineConfiguration = z.infer<typeof machineConfiguration>;

export function readMachineConfiguration(stateDirectory: string): MachineConfiguration | null {
  try {
    const path = join(stateDirectory, "machine.json");
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || info.size > 4096)
      throw new Error("Invalid private configuration.");
    return machineConfiguration.parse(
      JSON.parse(readFileSync(join(stateDirectory, "machine.json"), "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("The private machine configuration is invalid.");
  }
}
