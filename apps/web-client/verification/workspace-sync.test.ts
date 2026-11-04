import { afterEach, expect, test } from "bun:test";
import type { Projection } from "../src/hooks/workspace-events";
import { WorkspaceSync } from "../src/hooks/workspace-sync";
import type { WorkspaceEvent } from "../src/lib/api-client";

let sync: WorkspaceSync | undefined;
afterEach(() => sync?.close());
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 1000;
  while (!predicate() && Date.now() < deadline) await Bun.sleep(2);
  expect(predicate()).toBe(true);
}
function event(cursor: number): WorkspaceEvent {
  return {
    cursor,
    entity_kind: "run",
    entity_id: "run",
    revision: cursor,
    data: { id: "run", kind: "run", revision: cursor, thread_id: "thread" },
  };
}
function stream() {
  const connections: {
    after: number;
    signal: AbortSignal;
    emit: (cursor: number) => void;
    end: () => void;
  }[] = [];
  return {
    connections,
    follow(
      after: number,
      signal: AbortSignal,
      update: (cursor: number, event: WorkspaceEvent) => void,
    ) {
      return new Promise<void>((resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        connections.push({
          after,
          signal,
          emit: (cursor) => update(cursor, event(cursor)),
          end: resolve,
        });
      });
    },
  };
}
function start(
  refresh: (signal: AbortSignal, projections?: Set<Projection>) => Promise<number | undefined>,
  reconcileMs = 10_000,
) {
  const transport = stream();
  const statuses: { online: boolean; error: string }[] = [];
  sync = new WorkspaceSync({
    refresh,
    follow: transport.follow,
    update: () => new Set(["conversation", "activity", "previews"]),
    status: (online, error) => statuses.push({ online, error }),
    batchMs: 5,
    retryMs: 5,
    reconcileMs,
  });
  sync.start();
  return { transport, statuses, sync };
}

test("reconnect retires a hanging snapshot and subsequent events continue without a reload", async () => {
  let requests = 0;
  let held: AbortSignal | undefined;
  const f = start(async (signal) => {
    requests++;
    if (requests === 2) {
      held = signal;
      return new Promise(() => {});
    }
    return requests === 1 ? 10 : 12;
  });
  await until(() => f.transport.connections.length === 1);
  f.transport.connections[0].emit(11);
  await until(() => requests === 2);
  f.sync.reconnect();
  await until(() => f.transport.connections.length === 2);
  expect(held?.aborted).toBe(true);
  expect(f.transport.connections[0].signal.aborted).toBe(true);
  f.transport.connections[1].emit(13);
  await until(() => requests === 4);
  expect(f.statuses.at(-1)?.online).toBe(true);
});

test("a failed projection read automatically reconciles and reconnects from authoritative state", async () => {
  let requests = 0;
  const f = start(async () => {
    requests++;
    if (requests === 2) throw new Error("Snapshot temporarily unavailable");
    return requests === 1 ? 10 : 12;
  });
  await until(() => f.transport.connections.length === 1);
  f.transport.connections[0].emit(11);
  await until(() => f.transport.connections.length === 2);
  expect(f.statuses.some((state) => !state.online && state.error.includes("temporarily"))).toBe(
    true,
  );
  expect(f.transport.connections[1].after).toBe(12);
});

test("bounded reconciliation repairs a missed terminal event while the event stream remains open", async () => {
  let reads = 0;
  let backend = "running";
  let rendered = "";
  const f = start(async () => {
    reads++;
    rendered = backend;
    return 10;
  }, 25);
  await until(() => f.transport.connections.length === 1);
  backend = "succeeded";
  await until(() => rendered === "succeeded");
  expect(reads).toBeGreaterThan(1);
  expect(f.transport.connections).toHaveLength(1);
});

test("event bursts coalesce projection reads and normal stream expiry retains the applied cursor", async () => {
  const reads: (Set<Projection> | undefined)[] = [];
  const f = start(async (_signal, projections) => {
    reads.push(projections);
    return 10;
  });
  await until(() => f.transport.connections.length === 1);
  for (let cursor = 11; cursor <= 26; cursor++) f.transport.connections[0].emit(cursor);
  await until(() => reads.length === 2);
  expect(reads[1]?.has("conversation")).toBe(true);
  await Bun.sleep(10);
  f.transport.connections[0].end();
  await until(() => f.transport.connections.length === 2);
  expect(f.transport.connections[1].after).toBe(26);
  expect(reads).toHaveLength(2);
});

test("events arriving during an in-flight projection trigger one following refresh", async () => {
  let reads = 0;
  let release: (cursor: number) => void = () => {};
  const f = start(async () => {
    reads++;
    if (reads === 2)
      return new Promise<number>((resolve) => {
        release = resolve;
      });
    return 10;
  });
  await until(() => f.transport.connections.length === 1);
  f.transport.connections[0].emit(11);
  await until(() => reads === 2);
  f.transport.connections[0].emit(12);
  f.transport.connections[0].emit(13);
  release(11);
  await until(() => reads === 3);
  await Bun.sleep(10);
  expect(reads).toBe(3);
});

test("retired connection callbacks and late refresh results cannot advance the new connection", async () => {
  let reads = 0;
  let late: (cursor: number) => void = () => {};
  const f = start(async () => {
    reads++;
    if (reads === 2)
      return new Promise<number>((resolve) => {
        late = resolve;
      });
    return reads === 1 ? 10 : 12;
  });
  await until(() => f.transport.connections.length === 1);
  f.transport.connections[0].emit(11);
  await until(() => reads === 2);
  f.sync.reconnect();
  await until(() => f.transport.connections.length === 2);
  late(999);
  f.transport.connections[0].emit(1000);
  await Bun.sleep(10);
  f.transport.connections[1].end();
  await until(() => f.transport.connections.length === 3);
  expect(f.transport.connections[2].after).toBe(12);
  expect(reads).toBe(3);
});

test("foreground resume reconciles without creating another event connection", async () => {
  let reads = 0;
  const f = start(async () => {
    reads++;
    return 10;
  });
  await until(() => f.transport.connections.length === 1);
  f.sync.resume();
  await until(() => reads === 2);
  expect(f.transport.connections).toHaveLength(1);
  f.sync.close();
  f.transport.connections[0].emit(11);
  await Bun.sleep(15);
  expect(reads).toBe(2);
  expect(f.transport.connections[0].signal.aborted).toBe(true);
});
