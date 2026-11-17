import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  OpenMediaRequestSchema,
  OpenMediaResponseSchema,
  SessionPolicy,
} from "../../../apps/server/src/machines/protocol/stream_pb";

if (process.env.NGERTIIN_NMA083_DEPLOYED !== "demo.ngerti.in")
  throw new Error("Select the explicitly authorized NMA-083 acceptance target.");
process.umask(0o077);
const require = createRequire(new URL("../../../apps/server/package.json", import.meta.url));
const { create, fromBinary, toBinary } = await import(require.resolve("@bufbuild/protobuf"));
const fixture = JSON.parse(readFileSync(".dev/nma082-live/isolation.json", "utf8"));
const origin = "https://demo.ngerti.in";
const phase = "nma083_post_fix";
const report: any = { phase, checks: [], completed: false };
function check(name: string, pass: boolean) {
  report.checks.push({ name, pass });
  writeFileSync(
    ".dev/verification/nma-083/deployed-transport.json",
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  if (!pass) throw new Error(`Public transport check failed: ${name}.`);
}
async function login() {
  const response = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ email: fixture.email, password: fixture.password }),
  });
  if (!response.ok) throw new Error("Synthetic transport actor sign-in failed.");
  return response.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
}
const cookie = await login();
const otherDevice = await login();
const headers = {
  Origin: origin,
  Cookie: cookie,
  "X-Ngertiin-Organization": fixture.organization_id,
};
const stream = await fetch(`${origin}/v1/events/stream`, {
  headers,
  signal: AbortSignal.timeout(15000),
});
const reader = stream.body!.getReader();
check(
  "SSE flushes through Cloudflare and Traefik",
  stream.ok && new TextDecoder().decode((await reader.read()).value).includes("retry:"),
);
await reader.cancel();
const response = await fetch(`${origin}/v1/machine/view`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json", "Idempotency-Key": randomUUID() },
  body: JSON.stringify({ interactive: false }),
  signal: AbortSignal.timeout(120000),
});
check("authenticated viewer issuance", response.ok);
const view: any = await response.json();
const root = view.viewer_url.split("viewer/#")[0];
check(
  "viewer document requires its session",
  (await fetch(`${origin}${view.viewer_url.split("#")[0]}`)).status === 401,
);
check(
  "viewer document loads for issuing session",
  (await fetch(`${origin}${view.viewer_url.split("#")[0]}`, { headers })).ok,
);
const payload = toBinary(
  OpenMediaRequestSchema,
  create(OpenMediaRequestSchema, {
    target: { target: { case: "displayId", value: "primary" } },
    maxFps: 1,
    maxDimension: 640,
    policy: SessionPolicy.VIEW_ONLY,
  }),
);
const frame = new Uint8Array(5 + payload.length);
new DataView(frame.buffer).setUint32(1, payload.length);
frame.set(payload, 5);
const rpc = await fetch(`${origin}${root}cua.env.v1.StreamService/OpenMedia`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/grpc-web+proto" },
  body: frame,
  signal: AbortSignal.timeout(30000),
});
const bytes = new Uint8Array(await rpc.arrayBuffer());
check("authenticated media negotiation", rpc.ok && bytes.length > 5);
const media = fromBinary(
  OpenMediaResponseSchema,
  bytes.subarray(5, 5 + new DataView(bytes.buffer).getUint32(1)),
);
const url = new URL(media.wsPath, `${origin.replace(/^http/, "ws")}${root}`).href;
check("media uses certificate-validated public WSS", url.startsWith("wss://demo.ngerti.in/"));
function connect(cookie: string, expectOpen: boolean) {
  return new Promise<WebSocket>((resolve, reject) => {
    // Bun supports handshake headers; the DOM constructor type only describes browser protocols.
    const HeaderWebSocket = WebSocket as unknown as new (
      url: string,
      options: { headers: Record<string, string> },
    ) => WebSocket;
    const socket = new HeaderWebSocket(url, {
      headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("Public WSS outcome timed out."));
    }, 10000);
    socket.onopen = () => {
      clearTimeout(timer);
      if (expectOpen) resolve(socket);
      else {
        socket.close();
        reject(new Error("Unintended session opened media."));
      }
    };
    const denied = () => {
      clearTimeout(timer);
      if (expectOpen) reject(new Error("Issuing session WSS was denied."));
      else resolve(socket);
    };
    socket.onclose = denied;
    socket.onerror = denied;
  });
}
await connect("", false);
check("WSS rejects missing session", true);
await connect(otherDevice, false);
check("WSS rejects another device session", true);
const socket = await connect(cookie, true);
check("public proxy upgrades issuing-session WSS", socket.readyState === WebSocket.OPEN);
const closed = new Promise<boolean>((resolve) => {
  const timer = setTimeout(() => resolve(false), 10000);
  socket.onclose = () => {
    clearTimeout(timer);
    resolve(true);
  };
});
const removed = await fetch(`${origin}/v1/machine/views/${view.viewer_id}`, {
  method: "DELETE",
  headers,
});
check("viewer revocation closes established WSS", removed.ok && (await closed));
for (const path of ["/health/ready", "/v1/harness/tools", "/v1/machine/native/state"]) {
  const response = await fetch(`${origin}${path}`, { headers });
  check(`private route is denied: ${path}`, [401, 403, 404].includes(response.status));
}
report.completed = true;
writeFileSync(
  ".dev/verification/nma-083/deployed-transport.json",
  JSON.stringify(report, null, 2),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    phase,
    pass: report.checks.length,
    fail: 0,
    tls_verification: "platform trust store",
  }),
);
