/** Protocol fixture only. This is not Muse Code and performs no model inference. */
import { createInterface } from "node:readline";
import { EXPECTED_SCHEMA_FINGERPRINT } from "@muse-code/sdk";

let initialized = false;
const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "initialized") {
    initialized = true;
    return;
  }
  let result: unknown;
  if (request.method === "initialize")
    result = {
      schema: { version: 1, fingerprint: EXPECTED_SCHEMA_FINGERPRINT },
      serverInfo: { name: "ngertiin-fixture", version: "1" },
      experimentalApi: false,
      grantedCapabilities: [],
      museHome: "/fixture",
      platformFamily: "unix",
      platformOs: "linux",
      sessionDurability: "durable",
      userAgent: "ngertiin-fixture",
    };
  else if (initialized && request.method === "fixture/echo") result = { text: request.params.text };
  else {
    process.stdout.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Unsupported fixture method" } })}\n`,
    );
    return;
  }
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, result })}\n`);
});
