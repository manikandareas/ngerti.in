import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { embedded } from "@trycua/cua";
import { developmentConfig } from "../config";
import { readMachineConfiguration } from "./config";
import { CuaMachine } from "./cua";

const installation = developmentConfig();
let machine = readMachineConfiguration(installation.stateDir);
if (!machine) {
  const id = crypto.randomUUID();
  const port = Number(process.env.NGERTIIN_MACHINE_PORT ?? 3211);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid machine port.");
  machine = {
    id,
    endpoint: `http://127.0.0.1:${port}`,
    token: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
    root: "/home/cua/workspace",
    generation: 1,
    project: `ngertiin-machine-${id.slice(0, 8)}`,
  };
  writeFileSync(join(installation.stateDir, "machine.json"), JSON.stringify(machine, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
}
const environment = join(installation.stateDir, "machine.env");
writeFileSync(
  environment,
  `CUA_ENV_TOKEN=${machine.token}\nNGERTIIN_MACHINE_PORT=${new URL(machine.endpoint).port}\n`,
  { mode: 0o600 },
);
chmodSync(environment, 0o600);
const compose = fileURLToPath(new URL("../../../../infra/machine/compose.yaml", import.meta.url));
const setup = Bun.spawn(
  [
    "docker",
    "compose",
    "--env-file",
    environment,
    "-p",
    machine.project,
    "-f",
    compose,
    "up",
    "-d",
  ],
  {
    stdout: "inherit",
    stderr: "inherit",
  },
);
if (await setup.exited) throw new Error("The retained machine could not be started.");
const deadline = Date.now() + 90_000;
let ready = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${machine.endpoint}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {
    /* The desktop is still starting. */
  }
  await Bun.sleep(500);
}
if (!ready) throw new Error("The retained machine did not become ready.");
const client = await embedded().spacesd(machine.endpoint, machine.token);
for (const directory of [
  machine.root,
  `${machine.root}/inputs`,
  `${machine.root}/downloads`,
  `${machine.root}/projects`,
])
  await client.makeDir(directory, undefined);
const capabilities = await client.capabilities();
const native = new CuaMachine(machine);
const browserDeadline = Date.now() + 45_000;
let browserReady = false;
try {
  await native.call("start_session", { session: "ngertiin-setup" });
  while (Date.now() < browserDeadline) {
    const desktop = await native.call("get_desktop_state", { session: "ngertiin-setup" });
    const state = JSON.parse(desktop.structuredJson ?? "{}");
    if (state.windows?.some((window: { app_name: string }) => window.app_name === "Chromium")) {
      browserReady = true;
      break;
    }
    await Bun.sleep(1000);
  }
} finally {
  await native.call("end_session", { session: "ngertiin-setup" }).catch(() => {});
}
if (!browserReady)
  throw new Error(
    "The machine service is healthy, but the retained browser did not finish starting.",
  );
console.log(
  JSON.stringify({
    event: "machine.ready",
    machine_id: machine.id,
    endpoint: machine.endpoint,
    version: capabilities.version,
    browser_ready: browserReady,
  }),
);
