import { resolve } from "node:path";
import { fixture } from "../../../apps/server/tests/helpers";

const f = await fixture();
try {
  const samples: Record<string, number[]> = {
    transaction: [],
    admission: [],
    event_replay: [],
    commit_notification: [],
  };
  const measure = async (name: string, operation: () => Promise<unknown>) => {
    const before = performance.now();
    await operation();
    samples[name].push(performance.now() - before);
  };
  for (let i = 0; i < 5; i++) await f.store.transaction(() => {});
  for (let i = 0; i < 30; i++) await measure("transaction", () => f.store.transaction(() => {}));
  const cursor = await f.store.cursor;
  for (let i = 0; i < 30; i++) {
    const before = performance.now(),
      notification = Promise.withResolvers<void>();
    const unsubscribe = f.store.subscribe(() => {
      samples.commit_notification.push(performance.now() - before);
      notification.resolve();
    });
    await measure("admission", () => f.admit(`Latency fixture ${i}`));
    await notification.promise;
    unsubscribe();
  }
  for (let i = 0; i < 30; i++) await measure("event_replay", () => f.store.events(cursor, 1000));
  const summary = Object.fromEntries(
    Object.entries(samples).map(([name, values]) => {
      values.sort((a, b) => a - b);
      return [
        name,
        {
          n: values.length,
          p50_ms: values[Math.floor(values.length * 0.5)],
          p95_ms: values[Math.floor(values.length * 0.95)],
          max_ms: values.at(-1),
        },
      ];
    }),
  );
  const root = resolve(import.meta.dir, "../../..");
  const pg = JSON.parse(
    await Bun.file(Bun.resolveSync("pg/package.json", resolve(root, "apps/server"))).text(),
  );
  console.log(
    JSON.stringify(
      {
        measured_at: new Date().toISOString(),
        bun: Bun.version,
        pg: pg.version,
        postgres: (await f.store.query("SHOW server_version")).rows[0].server_version,
        workload: {
          warmup_transactions: 5,
          transaction_samples: 30,
          admissions: 30,
          events: (await f.store.events(cursor, 1000)).length,
          concurrent_lifecycle_authorities: 1,
          providers: "none",
          database: "disposable loopback PostgreSQL",
        },
        latency: summary,
        limitations: [
          "Local fixture timings, no production capacity or SQLite overload claim.",
          "commit_notification measures command start through notification; it is not isolated database COMMIT wire latency.",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await f.close();
}
