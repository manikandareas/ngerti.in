import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "../../../apps/server/node_modules/zod";
import { domainEvent, kindSchema, schemas } from "../../../apps/server/src/contracts";

const tickets = [49, 50, 52, 53, 54, 55, 56, 57, 58, 59];
const report = {
  evidence_level: "retained_evidence_integrity_and_read_only_schema_validation",
  captured_at: new Date().toISOString(),
  native_requests: 0,
  manifests: [] as {
    ticket: string;
    retained_files: number;
    retained_verified: number;
    source_files: number;
    source_changed_since_capture: string[];
  }[],
  database: {
    path: process.argv[2] ?? ".dev/nma049-native/ngertiin.sqlite",
    readonly: true,
    event_count: 0,
    entity_count: 0,
    event_kinds: {} as Record<string, number>,
    unknown_effects: {} as Record<string, number>,
    schema_failures: [] as unknown[],
  },
};
for (const number of tickets) {
  const ticket = `NMA-${String(number).padStart(3, "0")}`;
  const prefix = `docs/verification/${ticket.toLowerCase()}/`;
  const entry = {
    ticket,
    retained_files: 0,
    retained_verified: 0,
    source_files: 0,
    source_changed_since_capture: [] as string[],
  };
  const lines = readFileSync(`${prefix}SHA256SUMS`, "utf8").trim().split("\n");
  for (const line of lines) {
    const [, expected, path] = line.match(/^([a-f0-9]{64})  (.+)$/) ?? [];
    assert(expected && path, `${ticket} manifest syntax`);
    const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
    if (path.startsWith(prefix)) {
      entry.retained_files++;
      assert.equal(actual, expected, `${ticket} retained evidence changed: ${path}`);
      entry.retained_verified++;
    } else {
      entry.source_files++;
      if (actual !== expected) entry.source_changed_since_capture.push(path);
    }
  }
  report.manifests.push(entry);
}
const database = new Database(report.database.path, { readonly: true, strict: true });
const published = z.fromJSONSchema((await Bun.file("docs/contracts/1.11.0.json").json()).event);
try {
  for (const { cursor, body } of database
    .query<{ cursor: number; body: string }, []>("SELECT cursor, body FROM events ORDER BY cursor")
    .iterate()) {
    const input = { ...JSON.parse(body), cursor };
    const parsed = domainEvent.safeParse(input);
    report.database.event_count++;
    report.database.event_kinds[input.entity_kind] =
      (report.database.event_kinds[input.entity_kind] ?? 0) + 1;
    if (!parsed.success)
      report.database.schema_failures.push({
        cursor,
        kind: input.entity_kind,
        issues: parsed.error.issues.map(({ code, path }) => ({ code, path })),
      });
    const jsonSchema = published.safeParse(input);
    if (!jsonSchema.success)
      report.database.schema_failures.push({
        cursor,
        kind: input.entity_kind,
        validator: "published_json_schema",
        issues: jsonSchema.error.issues.map(({ code, path }) => ({ code, path })),
      });
    assert.equal(input.entity_kind, input.data.kind);
    assert.equal(input.entity_id, input.data.id);
    assert.equal(input.owner_id, input.data.owner_id);
    assert.equal(input.revision, input.data.revision);
  }
  for (const { kind, body } of database
    .query<{ kind: string; body: string }, []>("SELECT kind, body FROM entities ORDER BY seq")
    .iterate()) {
    const parsedKind = kindSchema.parse(kind),
      input = JSON.parse(body);
    const result = schemas[parsedKind].safeParse(input);
    report.database.entity_count++;
    if (!result.success)
      report.database.schema_failures.push({
        entity_kind: kind,
        issues: result.error.issues.map(({ code, path }) => ({ code, path })),
      });
    if (["browser_action", "app_effect"].includes(kind) && input.state === "unknown")
      report.database.unknown_effects[kind] = (report.database.unknown_effects[kind] ?? 0) + 1;
  }
} finally {
  database.close();
}
await Bun.write("docs/verification/nma-060/retained.json", `${JSON.stringify(report, null, 2)}\n`);
assert.equal(
  report.database.schema_failures.length,
  0,
  "Retained payloads do not match the published contract.",
);
console.log(
  JSON.stringify({
    manifests: report.manifests.length,
    retained_files: report.manifests.reduce((n, m) => n + m.retained_verified, 0),
    ...report.database,
  }),
);
