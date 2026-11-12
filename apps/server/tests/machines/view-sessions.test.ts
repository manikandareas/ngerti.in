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
async function setup() {
  f = await fixture();
  const config = {
    id: crypto.randomUUID(),
    endpoint: "http://127.0.0.1:3211",
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
