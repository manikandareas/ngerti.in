import { afterEach, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CuaMachine } from "../../src/machines/cua";
import { DomainCuaMachine, DomainRuntime } from "../../src/machines/domain-runtime";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function startup(desktop: boolean) {
  const directory = mkdtempSync(join(tmpdir(), "ngertiin-domain-startup-"));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const runtime = new DomainRuntime(directory, crypto.randomUUID(), null);
  const retained = runtime.configuration(crypto.randomUUID());
  const states: string[] = [];
  const native = {
    callJson: async () =>
      JSON.stringify({
        features: [
          { name: "driver", supported: true },
          { name: "desktop_stream", supported: desktop },
        ],
      }),
    makeDir: async () => {},
  };
  const ensure = spyOn(runtime, "ensure").mockResolvedValue({} as never);
  const client = spyOn(CuaMachine.prototype, "client").mockResolvedValue(native as never);
  const health = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
  cleanups.push(
    () => ensure.mockRestore(),
    () => client.mockRestore(),
    () => health.mockRestore(),
  );
  return {
    machine: new DomainCuaMachine(runtime, retained, async (state) => {
      states.push(state);
    }),
    states,
  };
}

test("healthy control HTTP without the required desktop provider never admits a ready domain", async () => {
  const f = startup(false);
  await expect(f.machine.client()).rejects.toMatchObject({ code: "MACHINE_UNAVAILABLE" });
  expect(f.states).toEqual(["provisioning", "failed"]);
});

test("a domain with native desktop capability completes scoped startup", async () => {
  const f = startup(true);
  await expect(f.machine.client()).resolves.toBeDefined();
  expect(f.states).toEqual(["provisioning", "ready"]);
});
