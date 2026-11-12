import { Database } from "bun:sqlite";
import type { Store } from "../../src/store";

/** Named disposable legacy data; no retained installation is inspected or changed. */
export async function exportLegacyFixture(store: Store, path: string) {
  const db = new Database(path, { create: true });
  try {
    db.exec(`PRAGMA application_id=1313294385; PRAGMA user_version=1;
      CREATE TABLE installation(id INTEGER PRIMARY KEY, owner_id TEXT);
      CREATE TABLE entities(seq INTEGER PRIMARY KEY,kind TEXT,id TEXT,body TEXT);
      CREATE TABLE events(cursor INTEGER PRIMARY KEY,body TEXT);
      CREATE TABLE commands(id TEXT PRIMARY KEY,fingerprint TEXT,receipt TEXT);
      CREATE TABLE routing_traces(seq INTEGER PRIMARY KEY,route_id TEXT,attempt_id TEXT,body TEXT);
      CREATE TABLE conversation_parts(sequence INTEGER PRIMARY KEY,id TEXT,thread_id TEXT,body TEXT);
      CREATE TABLE conversation_projection(id INTEGER PRIMARY KEY,cursor INTEGER);`);
    db.query("INSERT INTO installation VALUES(1,?)").run(store.ownerId);
    await store.transaction(async () => {
      for (const table of [
        "entities",
        "events",
        "commands",
        "routing_traces",
        "conversation_parts",
        "conversation_projection",
      ]) {
        const rows = (await store.query(`SELECT * FROM ${table}`)).rows;
        for (const row of rows) {
          const columns = Object.keys(row).filter(
            (key) => !["scope", "owner_id", "organization_id", "actor_id"].includes(key),
          );
          db.query(
            `INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
          ).run(
            ...columns.map((key) =>
              typeof row[key] === "object" ? JSON.stringify(row[key]) : row[key],
            ),
          );
        }
      }
    });
  } finally {
    db.close();
  }
}
