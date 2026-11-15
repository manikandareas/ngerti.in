import { afterEach, expect, test } from "bun:test";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { createApi as createAccountApi } from "../../src/api";
import { Background } from "../../src/background";
import { Connections } from "../../src/harness/connections";
import { ProductTools } from "../../src/harness/tools";
import { CuaMachine } from "../../src/machines/cua";
import { DomainRuntime } from "../../src/machines/domain-runtime";
import { ExecutionDomains } from "../../src/machines/domains";
import { OpenMediaResponseSchema } from "../../src/machines/protocol/stream_pb";
import { Machines } from "../../src/machines/service";
import { organizationFixture } from "../organizations/helpers";

let f: Awaited<ReturnType<typeof organizationFixture>>;
let api: Awaited<ReturnType<typeof createAccountApi>>;
let domains: ExecutionDomains;
let legacy: Machines;
let stub: Bun.Server<undefined>;
const closedMedia: string[] = [];
const sockets = new Set<WebSocket>();
afterEach(async () => {
  for (const socket of sockets) socket.close();
  sockets.clear();
  if (api) await Promise.race([api.stop(true).catch(() => {}), Bun.sleep(1000)]);
  await domains?.close();
  await legacy?.close();
  void stub?.stop(true);
  stub?.unref();
  await f?.close();
  closedMedia.length = 0;
});
class Host extends CuaMachine {
  override async tools() {
    return { contractVersion: "fixture", tools: [] };
  }
  override async rpc(name: string, input?: unknown): Promise<unknown> {
    if (name.endsWith("CreateViewerTicket")) return { ticket: `fixture-${crypto.randomUUID()}` };
    if (name.endsWith("CloseMedia")) {
      closedMedia.push((input as { mediaSessionId: string }).mediaSessionId);
      return {};
    }
    return {
      version: "fixture",
      features: ["driver", "pty", "process.exec_ledger"].map((name) => ({ name, supported: true })),
    };
  }
}
async function setup() {
  f = await organizationFixture();
  await f.success(
    f.write(f.owner.cookie, "/v1/data/legacy-binding", {
      organization_id: f.initial.organization.id,
      legacy_owner_id: f.domain.owner,
    }),
  );
  stub = Bun.serve<undefined>({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, server) {
      const url = new URL(request.url);
      if (url.pathname === "/media") {
        if (server.upgrade(request, { data: undefined })) return;
        return new Response(null, { status: 400 });
      }
      if (url.pathname.endsWith("/OpenMedia")) {
        const payload = toBinary(
          OpenMediaResponseSchema,
          create(OpenMediaResponseSchema, {
            ticket: `media-${crypto.randomUUID()}`,
            mediaSessionId: `session-${crypto.randomUUID()}`,
            wsPath: "/media",
          }),
        );
        const frame = new Uint8Array(5 + payload.length);
        new DataView(frame.buffer).setUint32(1, payload.length);
        frame.set(payload, 5);
        return new Response(frame, { headers: { "Content-Type": "application/grpc-web+proto" } });
      }
      return new Response("<html><head></head><body>Fixture viewer</body></html>", {
        headers: { "Content-Type": "text/html" },
      });
    },
    websocket: {
      open(peer) {
        peer.send("fixture-frame");
      },
      message(peer, message) {
        peer.send(message);
      },
    },
  });
  legacy = await Machines.open(f.domain.lifecycle, null);
  domains = new ExecutionDomains(
    f.domain.lifecycle,
    new DomainRuntime(f.domain.dir, f.domain.owner, null),
    (configuration) => new Host({ ...configuration, endpoint: stub.url.origin }),
  );
  api = await createAccountApi(f.domain.lifecycle, new Background(f.domain.lifecycle), {
    authentication: f.auth,
    connections: new Connections(f.domain.lifecycle),
    tools: await ProductTools.open(f.domain.lifecycle),
  });
  await f.listenApi(api);
}
function request(
  cookie: string,
  path: string,
  body?: unknown,
  organization = f.initial.organization.id,
) {
  return api.handle(
    new Request(`${f.origin}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: cookie,
        Origin: f.origin,
        "X-Ngertiin-Organization": organization,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
async function ok(response: Promise<Response>) {
  const value = await response;
  const body = await value.json();
  if (value.status !== 200)
    throw new Error(`Fixture request failed ${value.status}: ${JSON.stringify(body)}`);
  return body;
}
async function viewer(cookie = f.owner.cookie) {
  return ok(request(cookie, "/v1/machine/view", { interactive: false }));
}
async function connect(cookie: string, view: Awaited<ReturnType<typeof viewer>>) {
  const root = view.viewer_url.split("viewer/#")[0];
  const response = await api.handle(
    new Request(`${f.origin}${root}cua.env.v1.StreamService/OpenMedia`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: f.origin, "Content-Type": "application/grpc-web+proto" },
      body: new Uint8Array([0, 0, 0, 0, 0]),
    }),
  );
  expect(response.status).toBe(200);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const media = fromBinary(
    OpenMediaResponseSchema,
    bytes.subarray(5, 5 + new DataView(bytes.buffer).getUint32(1)),
  );
  const frame = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<void>();
  // Bun supports request headers in its native client constructor; DOM declarations omit this overload.
  const NativeSocket = WebSocket as typeof WebSocket &
    (new (
      url: string,
      options: { headers: Record<string, string> },
    ) => WebSocket);
  expect(media.wsPath.startsWith("media?ticket=")).toBe(true);
  const socket = new NativeSocket(
    new URL(media.wsPath, `${f.origin.replace(/^http/, "ws")}${root}`).href,
    {
      headers: { Cookie: cookie, Origin: f.origin },
    },
  );
  sockets.add(socket);
  socket.onmessage = () => frame.resolve();
  socket.onclose = (event) => {
    closed.resolve();
    frame.reject(new Error(`Fixture media closed before a frame (${event.code}).`));
  };
  socket.onerror = () => frame.reject(new Error("Fixture media did not connect."));
  await Promise.race([
    frame.promise,
    Bun.sleep(5000).then(() => {
      throw new Error(`Fixture frame timed out at state ${socket.readyState}.`);
    }),
  ]);
  return { socket, closed: closed.promise, media };
}

test("real user sessions resolve private machines and a copied viewer ticket cannot cross users or devices", async () => {
  await setup();
  const alice = await f.account("alice@example.test");
  await f.join(alice);
  const ownerMachine = await ok(request(f.owner.cookie, "/v1/machine"));
  const aliceMachine = await ok(request(alice.cookie, "/v1/machine"));
  expect(ownerMachine.id).not.toBe(aliceMachine.id);
  expect(ownerMachine.actor_id).not.toBe(aliceMachine.actor_id);
  const view = await viewer();
  expect((await request(f.owner.cookie, view.viewer_url)).status).toBe(200);
  expect((await request(alice.cookie, view.viewer_url)).status).toBe(401);
  const anotherDevice = await f.login();
  expect((await request(anotherDevice.cookie, view.viewer_url)).status).toBe(401);
  expect(
    (await request(f.owner.cookie, view.viewer_url, undefined, crypto.randomUUID())).status,
  ).toBe(403);
});
test("revoking the actual issuing login closes existing media and rejects further viewer RPCs", async () => {
  await setup();
  const view = await viewer();
  const media = await connect(f.owner.cookie, view);
  const self = await f.success(f.http("/v1/auth/session", undefined, f.owner.cookie));
  await f.success(f.write(f.owner.cookie, `/v1/auth/sessions/${self.session_id}/revoke`));
  await Promise.race([
    media.closed,
    Bun.sleep(3000).then(() => {
      throw new Error("Active media survived session revocation.");
    }),
  ]);
  expect(media.socket.readyState).toBe(WebSocket.CLOSED);
  expect(closedMedia).toContain(media.media.mediaSessionId);
  expect((await request(f.owner.cookie, view.viewer_url)).status).toBe(401);
  const replacement = await f.login();
  const nextView = await viewer(replacement.cookie);
  const nextMedia = await connect(replacement.cookie, nextView);
  await Bun.sleep(1500);
  expect(nextMedia.socket.readyState).toBe(WebSocket.OPEN);
  expect((await request(replacement.cookie, nextView.viewer_url)).status).toBe(200);
}, 10000);
test("account HTTP shutdown completes after its authenticated public media socket is closed", async () => {
  await setup();
  let stopped = 0;
  api.onStop(() => {
    stopped++;
  });
  const media = await connect(f.owner.cookie, await viewer());
  const listener = api.server;
  try {
    await Promise.race([
      api.stop(true),
      Bun.sleep(3000).then(() => {
        throw new Error("Account listener shutdown did not complete.");
      }),
    ]);
    await media.closed;
    expect(media.socket.readyState).toBe(WebSocket.CLOSED);
    expect(listener?.pendingRequests).toBe(0);
    expect(stopped).toBe(1);
  } catch (error) {
    console.log(
      JSON.stringify({
        event: "shutdown.fixture",
        requests: listener?.pendingRequests,
        sockets: listener?.pendingWebSockets,
        client_state: media.socket.readyState,
      }),
    );
    throw error;
  } finally {
    listener?.unref();
  }
}, 10000);
test("removing an organization member closes their already-open media and invalidates clipboard/file access", async () => {
  await setup();
  const alice = await f.account("alice@example.test");
  await f.join(alice);
  const view = await viewer(alice.cookie);
  const media = await connect(alice.cookie, view);
  const members = await f.success(f.http(`${f.path}/members`, undefined, f.owner.cookie));
  const member = members.members.find((m: { user_id: string }) => m.user_id === alice.userId);
  expect(member).toBeTruthy();
  await f.success(f.write(f.owner.cookie, `${f.path}/members/${member.id}/remove`));
  await Promise.race([
    media.closed,
    Bun.sleep(3500).then(() => {
      throw new Error("Active media survived member removal.");
    }),
  ]);
  expect(closedMedia).toContain(media.media.mediaSessionId);
  expect((await request(alice.cookie, view.viewer_url)).status).toBe(401);
  expect((await request(alice.cookie, "/v1/machine/files?path=")).status).toBe(403);
});

test("TLS-terminated viewer uses its configured account origin and ignores forged forwarding headers", async () => {
  await setup();
  const origin = "https://central.example.test";
  f.auth.config.origin = origin;
  const headers = {
    Cookie: f.owner.cookie,
    Origin: origin,
    "X-Ngertiin-Organization": f.initial.organization.id,
    "X-Forwarded-Host": "untrusted.example.test",
    "X-Forwarded-Proto": "http",
    "Content-Type": "application/json",
  };
  const view = await ok(
    api.handle(
      new Request("http://central.example.test/v1/machine/view", {
        method: "POST",
        headers,
        body: JSON.stringify({ interactive: false }),
      }),
    ),
  );
  expect(
    (await api.handle(new Request(`http://central.example.test${view.viewer_url}`, { headers })))
      .status,
  ).toBe(200);
  expect(
    (await api.handle(new Request(`http://untrusted.example.test${view.viewer_url}`, { headers })))
      .status,
  ).toBe(401);
  expect(
    (
      await api.handle(
        new Request(`http://central.example.test${view.viewer_url}`, {
          headers: { Origin: origin },
        }),
      )
    ).status,
  ).toBe(401);
});
