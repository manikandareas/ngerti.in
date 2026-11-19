import { afterEach, expect, test } from "bun:test";
import { CuaMachine } from "../../src/machines/cua";
import { Machines } from "../../src/machines/service";
import { MachineViews } from "../../src/machines/view";
import { fixture } from "../helpers";

let f: Awaited<ReturnType<typeof fixture>>;
let machine: Machines;
let views: MachineViews;
afterEach(async () => {
  await views?.close();
  await machine?.close();
  await f?.close();
});
class Host extends CuaMachine {
  override async tools() {
    return { contractVersion: "fixture", tools: [] };
  }
  tickets = 0;
  beforeTicket?: () => Promise<void>;
  override async rpc(name: string): Promise<unknown> {
    if (name.endsWith("CreateViewerTicket")) {
      await this.beforeTicket?.();
      return { ticket: `ticket-${++this.tickets}` };
    }
    return {
      version: "fixture",
      features: ["driver", "pty", "process.exec_ledger"].map((name) => ({ name, supported: true })),
    };
  }
}
async function setup(endpoint = "http://127.0.0.1:3211") {
  f = await fixture();
  const config = {
    id: crypto.randomUUID(),
    endpoint,
    token: "x".repeat(64),
    root: "/home/cua/workspace" as const,
    generation: 1,
    project: "ngertiin-machine-1234abcd",
  };
  const host = new Host(config);
  machine = await Machines.open(f.lifecycle, config, host);
  await machine.ready();
  views = new MachineViews(machine);
  return host;
}
test("viewer renewals keep the gateway identity and independent consumers cannot revoke each other", async () => {
  await setup();
  const card = await views.issue("http://localhost");
  const panel = await views.issue("http://localhost");
  const original = await views.authorize(new Request(`http://localhost${card.viewer_url}`));
  const ticket = original.ticket;
  const renewed = await views.renew(card.viewer_id, "http://localhost");
  expect(renewed.viewer_id).toBe(card.viewer_id);
  expect(original.ticket).not.toBe(ticket);
  await views.remove(panel.viewer_id);
  expect(await views.authorize(new Request(`http://localhost${card.viewer_url}`))).toBe(original);
  await views.remove(card.viewer_id);
  await expect(views.renew(card.viewer_id, "http://localhost")).rejects.toThrow("UNAUTHORIZED");
});
test("a renewal racing explicit revocation never resurrects the view", async () => {
  const host = await setup();
  const view = await views.issue("http://localhost");
  const ready = Promise.withResolvers<void>();
  const proceed = Promise.withResolvers<void>();
  host.beforeTicket = async () => {
    ready.resolve();
    await proceed.promise;
  };
  const renewing = views.renew(view.viewer_id, "http://localhost").catch((error) => error);
  await ready.promise;
  await views.remove(view.viewer_id);
  proceed.resolve();
  expect((await renewing).message).toBe("UNAUTHORIZED");
  await expect(
    (async () => views.authorize(new Request(`http://localhost${view.viewer_url}`)))(),
  ).rejects.toThrow("UNAUTHORIZED");
});

test("the viewer bridge preserves input and video frame order during authorization", async () => {
  const received: string[] = [];
  const displayed: string[] = [];
  const twoInputs = Promise.withResolvers<void>();
  const twoFrames = Promise.withResolvers<void>();
  const desktop = Promise.withResolvers<Bun.ServerWebSocket<undefined>>();
  const upstream = Bun.serve<undefined>({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, server) {
      if (server.upgrade(request, { data: undefined })) return;
      return new Response(null, { status: 400 });
    },
    websocket: {
      open(peer) {
        desktop.resolve(peer);
        peer.send("ready");
      },
      message(_peer, payload) {
        received.push(String(payload));
        if (received.length === 2) twoInputs.resolve();
      },
    },
  });
  const ready = Promise.withResolvers<void>();
  const peer = {
    send(data: string | ArrayBuffer | Uint8Array) {
      if (data === "ready") return ready.resolve();
      displayed.push(String(data));
      if (displayed.length === 2) twoFrames.resolve();
    },
    close() {},
  };
  let releaseValidation: (() => void) | undefined;
  try {
    await setup(upstream.url.origin);
    const view = await views.issue("http://localhost");
    const issued = await views.authorize(new Request(`http://localhost${view.viewer_url}`));
    issued.media.set("fixture-media-ticket", "fixture-media-session");
    await views.open(
      new Request(
        `http://localhost/v1/machine/viewer/${view.viewer_id}/media?ticket=fixture-media-ticket`,
      ),
      peer,
      false,
    );
    await ready.promise;
    const assertViewer = machine.assertViewer.bind(machine);
    function pauseNextFrame() {
      const validating = Promise.withResolvers<void>();
      const resume = Promise.withResolvers<void>();
      releaseValidation = resume.resolve;
      machine.assertViewer = async (...args) => {
        machine.assertViewer = assertViewer;
        validating.resolve();
        await resume.promise;
        return await assertViewer(...args);
      };
      return { entered: validating.promise, release: resume.resolve };
    }
    const inputGate = pauseNextFrame();
    const down = views.message(peer, "key-down");
    await inputGate.entered;
    const up = views.message(peer, "key-up");
    await Promise.race([up, Bun.sleep(30)]);
    inputGate.release();
    await Promise.all([down, up, twoInputs.promise]);
    expect(received).toEqual(["key-down", "key-up"]);

    const stream = await desktop.promise;
    const videoGate = pauseNextFrame();
    stream.send("video-frame-1");
    await videoGate.entered;
    stream.send("video-frame-2");
    await Bun.sleep(30);
    videoGate.release();
    await twoFrames.promise;
    expect(displayed).toEqual(["video-frame-1", "video-frame-2"]);
  } finally {
    releaseValidation?.();
    views?.closePeer(peer);
    void upstream.stop(true);
    upstream.unref();
  }
});
