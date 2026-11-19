import { createHash } from "node:crypto";

const debuggerEndpoint = new URL(process.env.HERMES_VERIFY_CDP_HTTP ?? "http://127.0.0.1:9222");
const origin = new URL(process.env.HERMES_VERIFY_WEB_ORIGIN ?? "http://127.0.0.1:4172");
const marker = process.env.HERMES_VERIFY_SUBMIT_MARKER;
if (
  debuggerEndpoint.hostname !== "127.0.0.1" ||
  origin.hostname !== "127.0.0.1" ||
  !marker || !/^QUEUE-[A-F0-9]{8}$/.test(marker)
)
  throw new Error("Use a loopback verification browser, web origin, and fixture marker.");

const targetUrl = new URL("/v1/runs", origin).href;
const pages = (await (await fetch(new URL("/json/list", debuggerEndpoint))).json()) as {
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}[];
const targets = pages.filter((page) => page.type === "page" && new URL(page.url).origin === origin.origin);
if (targets.length !== 1 || !targets[0].webSocketDebuggerUrl)
  throw new Error("The isolated browser must have exactly one Ngertiin tab.");

const socket = new WebSocket(targets[0].webSocketDebuggerUrl);
const pending = new Map<number, { resolve: (result: unknown) => void; reject: (reason: unknown) => void }>();
let nextId = 0;
function command(method: string, params: object = {}) {
  const id = ++nextId;
  return new Promise<unknown>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

let handled = process.env.HERMES_VERIFY_OBSERVE_RETRY === "1" ? 1 : 0;
const finished = Promise.withResolvers<void>();
type Paused = {
  requestId: string;
  request: { method: string; url: string; headers: Record<string, string>; postData?: string };
  responseStatusCode?: number;
};
async function intercept({ requestId, request, responseStatusCode }: Paused) {
  if (request.method !== "POST" || request.url !== targetUrl || !request.postData?.includes(marker as string)) {
    await command("Fetch.continueRequest", { requestId });
    return;
  }
  if (responseStatusCode !== 200) {
    await command("Fetch.continueRequest", { requestId });
    throw new Error(`The submit did not reach a committed response: ${responseStatusCode}.`);
  }
  const { body, base64Encoded } = await command("Fetch.getResponseBody", { requestId }) as {
    body: string;
    base64Encoded: boolean;
  };
  const receipt = JSON.parse(base64Encoded ? Buffer.from(body, "base64").toString("utf8") : body);
  const operation = Object.entries(request.headers).find(([name]) => name.toLowerCase() === "idempotency-key")?.[1];
  if (!operation || !receipt.run?.id || !receipt.message?.id)
    throw new Error("The submit response did not contain a keyed run and message receipt.");
  handled += 1;
  const event = {
    key: operation,
    body_sha256: createHash("sha256").update(request.postData).digest("hex"),
    status: responseStatusCode,
    run: receipt.run.id,
    message: receipt.message.id,
    at: new Date().toISOString(),
  };
  if (handled === 1) {
    await command("Fetch.failRequest", { requestId, errorReason: "InternetDisconnected" });
    console.log(JSON.stringify({ event: "committed_ack_dropped", ...event }));
  } else {
    await command("Fetch.continueRequest", { requestId });
    console.log(JSON.stringify({ event: "retry_ack_delivered", ...event }));
    finished.resolve();
  }
}

socket.addEventListener("message", ({ data }) => {
  const envelope = JSON.parse(String(data));
  if (typeof envelope.id === "number") {
    const handler = pending.get(envelope.id);
    pending.delete(envelope.id);
    if (envelope.error) handler?.reject(envelope.error);
    else handler?.resolve(envelope.result);
  } else if (envelope.method === "Fetch.requestPaused") {
    void intercept(envelope.params).catch(finished.reject);
  }
});
await new Promise<void>((resolve, reject) => {
  socket.addEventListener("open", () => resolve(), { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let timer: ReturnType<typeof setTimeout> | undefined;
try {
  await command("Fetch.enable", { patterns: [{ urlPattern: targetUrl, requestStage: "Response" }] });
  console.log(JSON.stringify({ event: "armed", marker }));
  timer = setTimeout(() => finished.reject(new Error("The expected submit response did not arrive.")), 180_000);
  await finished.promise;
} finally {
  if (timer) clearTimeout(timer);
  await command("Fetch.disable");
  socket.close();
}
