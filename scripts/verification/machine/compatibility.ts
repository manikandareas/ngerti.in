import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { machineConfiguration } from "../../../apps/server/src/machines/config";
import { CuaMachine } from "../../../apps/server/src/machines/cua";

const configuration = machineConfiguration.parse(JSON.parse(
  await readFile(resolve(process.argv[2] ?? ".dev/harness-first/machine.json"), "utf8"),
));
const machine = new CuaMachine(configuration);
const client = await machine.client();
const capabilities = JSON.parse(await client.callJson("SystemService/GetCapabilities", "{}", undefined));
console.log(JSON.stringify({ check: "capabilities", machine_id: configuration.id, capabilities }));
await client.makeDir(configuration.root, undefined);
await machine.files().write("compatibility.txt", new TextEncoder().encode("Ngertiin machine round trip\n"));
const content = new TextDecoder().decode(await machine.files().read("compatibility.txt"));
if (content !== "Ngertiin machine round trip\n") throw new Error("File round trip failed.");
console.log(JSON.stringify({ check: "files", passed: true }));
const requestId = crypto.randomUUID();
const child = await machine.spawn("cat compatibility.txt", { requestId, tag: `compatibility-${requestId}` });
const output = await child.wait();
console.log(
  JSON.stringify({
    check: "process_stream",
    pid: child.pid(),
    stdout: new TextDecoder().decode(output.stdout),
    exit: output.exit,
  }),
);
const screenshot = await client.screenshot(undefined);
console.log(JSON.stringify({ check: "screenshot", width: screenshot.width, height: screenshot.height }));
const registry = JSON.parse(await client.callJson("DriverService/ListTools", "{}", undefined));
console.log(JSON.stringify({ check: "driver", contract: registry.contractVersion, tools: registry.tools }));
const viewer = await fetch(`${configuration.endpoint}/viewer/`);
console.log(
  JSON.stringify({
    check: "viewer",
    status: viewer.status,
    content_type: viewer.headers.get("content-type"),
    content_security_policy: viewer.headers.get("content-security-policy"),
  }),
);
