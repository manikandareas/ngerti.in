import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DomainError, type DomainEvent, type Entity, type Kind, schemas } from "./contracts";
import { ConversationJournal } from "./conversations/journal";
import { type RoutingDecisionTrace, routingDecisionTrace } from "./groups/decision-trace";

const APPLICATION_ID = 0x4e474831;
const SCHEMA_VERSION = 1;
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** A single writer owns both domain state and the durable event log. No provider imports. */
export class Store {
  readonly #db: Database;
  readonly #lock: Database;
  readonly journal: ConversationJournal;
  #closed = false;
  #transactionDepth = 0;
  #notificationPending = false;
  readonly #listeners = new Set<() => void>();
  readonly #pendingCommands = new Map<string, Promise<unknown>>();
  constructor(
    readonly path: string,
    readonly ownerId: string,
  ) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.#lock = new Database(`${path}.authority`, { create: true, strict: true });
    try {
      // Held for the process lifetime in a separate database. The OS releases it on a crash.
      this.#lock.exec("PRAGMA busy_timeout=0; BEGIN EXCLUSIVE");
    } catch {
      this.#lock.close();
      throw new Error("Another application authority owns this state directory.");
    }
    try {
      this.#db = new Database(path, { create: true, strict: true });
    } catch (error) {
      this.#lock.close();
      throw error;
    }
    try {
      chmodSync(path, 0o600);
      chmodSync(`${path}.authority`, 0o600);
      this.#db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON");
      this.#db
        .transaction(() => {
          const version = this.#db
            .query<{ user_version: number }, []>("PRAGMA user_version")
            .get()?.user_version;
          const app = this.#db
            .query<{ application_id: number }, []>("PRAGMA application_id")
            .get()?.application_id;
          const tables = this.#db
            .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table'")
            .all();
          if (
            (version !== 0 && version !== SCHEMA_VERSION) ||
            (version !== 0 && app !== APPLICATION_ID) ||
            (version === 0 && app !== 0) ||
            (version === 0 && tables.length > 0)
          )
            throw new Error("Unsupported database. Use a new development state directory.");
          this.#db.exec(`
          CREATE TABLE IF NOT EXISTS installation (id INTEGER PRIMARY KEY CHECK(id=1), owner_id TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS entities (
            seq INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, id TEXT NOT NULL,
            body TEXT NOT NULL CHECK(json_valid(body))
              CHECK(json_extract(body, '$.kind')=kind AND json_extract(body, '$.id')=id), UNIQUE(kind, id)
          );
          CREATE TABLE IF NOT EXISTS events (
            cursor INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL CHECK(json_valid(body))
          );
          CREATE TABLE IF NOT EXISTS commands (
            id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, receipt TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS routing_traces (
            seq INTEGER PRIMARY KEY AUTOINCREMENT, route_id TEXT NOT NULL, attempt_id TEXT NOT NULL UNIQUE,
            body TEXT NOT NULL CHECK(json_valid(body))
          );
          CREATE UNIQUE INDEX IF NOT EXISTS active_lane ON entities (
            json_extract(body, '$.thread_id'), json_extract(body, '$.agent_id')
          ) WHERE kind='run' AND json_extract(body, '$.status') IN ('dispatching','running','cancel_requested','unknown');
          CREATE UNIQUE INDEX IF NOT EXISTS native_session ON entities (
            json_extract(body, '$.harness'), json_extract(body, '$.connection_id'), json_extract(body, '$.native_session_id')
          ) WHERE kind='binding';
          DROP INDEX IF EXISTS thread_binding;
          CREATE UNIQUE INDEX thread_binding ON entities (
            json_extract(body, '$.thread_id'), json_extract(body, '$.agent_id')
          ) WHERE kind='binding' AND COALESCE(json_extract(body, '$.active'), 1)=1;
          CREATE UNIQUE INDEX IF NOT EXISTS agent_handle ON entities (json_extract(body, '$.handle')) WHERE kind='agent';
          CREATE UNIQUE INDEX IF NOT EXISTS system_agent ON entities (json_extract(body, '$.system_role')) WHERE kind='agent';
          CREATE UNIQUE INDEX IF NOT EXISTS primary_dm ON entities (json_extract(body, '$.member_agent_ids[0]'))
            WHERE kind='thread' AND json_extract(body, '$.type')='dm';
          CREATE UNIQUE INDEX IF NOT EXISTS routine_occurrence ON entities (
            json_extract(body, '$.routine_id'), json_extract(body, '$.routine_generation'), json_extract(body, '$.scheduled_for')
          ) WHERE kind='occurrence';
          DROP INDEX IF EXISTS run_answer;
          CREATE UNIQUE INDEX run_answer ON entities (json_extract(body, '$.run_id'))
            WHERE kind='message' AND json_extract(body, '$.author')='agent' AND json_extract(body, '$.run_id') IS NOT NULL AND COALESCE(json_extract(body, '$.purpose'), 'conversation')='conversation';
          CREATE UNIQUE INDEX IF NOT EXISTS lane_workspace ON entities (json_extract(body, '$.thread_id'), json_extract(body, '$.agent_id')) WHERE kind='workspace' AND json_extract(body, '$.state')='active';
          CREATE UNIQUE INDEX IF NOT EXISTS artifact_publication ON entities (json_extract(body, '$.run_id'), json_extract(body, '$.source_path'), json_extract(body, '$.sha256')) WHERE kind='artifact' AND json_extract(body, '$.origin')='native_output';
          CREATE UNIQUE INDEX IF NOT EXISTS skill_name ON entities (json_extract(body, '$.visibility'), CASE WHEN json_extract(body, '$.visibility')='shared' THEN json_extract(body, '$.agent_id') ELSE json_extract(body, '$.thread_id') END, json_extract(body, '$.name')) WHERE kind='skill';
          CREATE UNIQUE INDEX IF NOT EXISTS skill_version ON entities (json_extract(body, '$.skill_id'), json_extract(body, '$.version')) WHERE kind='skill_revision';
          CREATE UNIQUE INDEX IF NOT EXISTS harness_inventory_binding ON entities (json_extract(body, '$.binding_id')) WHERE kind='harness_inventory';
          PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=${SCHEMA_VERSION};
        `);
          const saved = this.#db
            .query<{ owner_id: string }, []>("SELECT owner_id FROM installation WHERE id=1")
            .get();
          if (saved && saved.owner_id !== ownerId)
            throw new Error("State belongs to another owner.");
          if (!saved) this.#db.query("INSERT INTO installation VALUES (1, ?)").run(ownerId);
        })
        .immediate();
      this.#db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL");
      this.journal = new ConversationJournal(this.#db, (kind, id, cursor) => {
        const row =
          cursor === undefined
            ? this.#db
                .query<{ body: string }, [string, string]>(
                  "SELECT body FROM entities WHERE kind=? AND id=?",
                )
                .get(kind, id)
            : this.#db
                .query<{ body: string }, [string, string, number]>(
                  "SELECT json_extract(body,'$.data') AS body FROM events WHERE json_extract(body,'$.entity_kind')=? AND json_extract(body,'$.entity_id')=? AND cursor<=? ORDER BY cursor DESC LIMIT 1",
                )
                .get(kind, id, cursor);
        return row ? (JSON.parse(row.body) as Entity<typeof kind>) : null;
      });
      this.transaction(() => this.journal.replay());
    } catch (error) {
      this.close();
      throw error;
    }
  }

  transaction<T>(fn: () => T): T {
    const outer = this.#transactionDepth === 0;
    const before = outer ? this.cursor : 0;
    this.#transactionDepth++;
    try {
      const result = this.#db.transaction(fn).immediate();
      if (outer && this.cursor > before) this.notify();
      return result;
    } finally {
      this.#transactionDepth--;
    }
  }

  /** Notifications only follow the outer commit. The journal remains the source of truth. */
  subscribe(listener: () => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  private notify() {
    if (this.#notificationPending) return;
    this.#notificationPending = true;
    queueMicrotask(() => {
      this.#notificationPending = false;
      if (this.#closed) return;
      for (const listener of this.#listeners) listener();
    });
  }

  waitForEvents(after: number, signal: AbortSignal, timeoutMs = 10_000): Promise<void> {
    if (this.#closed || signal.aborted || this.cursor > after) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        unsubscribe();
        signal.removeEventListener("abort", finish);
        resolve();
      };
      const unsubscribe = this.subscribe(finish);
      const timer = setTimeout(finish, timeoutMs);
      signal.addEventListener("abort", finish, { once: true });
      // Close the race between the initial read and subscribing.
      if (this.#closed || signal.aborted || this.cursor > after) finish();
    });
  }

  command<T>(commandId: string, input: unknown, fn: () => T): T {
    const fingerprint = createHash("sha256").update(canonical(input)).digest("hex");
    return this.transaction(() => {
      const old = this.#db
        .query<{ fingerprint: string; receipt: string }, [string]>(
          "SELECT fingerprint, receipt FROM commands WHERE id=?",
        )
        .get(commandId);
      if (old) {
        if (old.fingerprint !== fingerprint) throw new DomainError("IDEMPOTENCY_CONFLICT");
        const receipt = JSON.parse(old.receipt);
        if (receipt?.["@ngertiin/command"] === "pending")
          throw new DomainError("RECONCILIATION_REQUIRED");
        return receipt as T;
      }
      const result = fn();
      if (result && typeof (result as { then?: unknown }).then === "function")
        throw new Error("Use asyncCommand for asynchronous command effects.");
      this.#db
        .query("INSERT INTO commands VALUES (?, ?, ?)")
        .run(commandId, fingerprint, JSON.stringify(result));
      return result;
    });
  }

  /** Only for reconcilable file projections: reserve, await I/O, then commit synchronously. */
  async asyncCommand<T, Prepared>(
    commandId: string,
    input: unknown,
    prepare: () => Promise<Prepared>,
    commit: (prepared: Prepared) => T,
    authorize: () => void = () => {},
  ): Promise<T> {
    authorize();
    const fingerprint = createHash("sha256").update(canonical(input)).digest("hex");
    const previous = this.transaction(() => {
      const old = this.#db
        .query<{ fingerprint: string; receipt: string }, [string]>(
          "SELECT fingerprint, receipt FROM commands WHERE id=?",
        )
        .get(commandId);
      if (old) {
        if (old.fingerprint !== fingerprint) throw new DomainError("IDEMPOTENCY_CONFLICT");
        return JSON.parse(old.receipt);
      }
      this.#db
        .query("INSERT INTO commands VALUES (?, ?, ?)")
        .run(commandId, fingerprint, JSON.stringify({ "@ngertiin/command": "pending" }));
      return null;
    });
    if (previous && previous["@ngertiin/command"] !== "pending") return previous as T;
    const active = this.#pendingCommands.get(commandId);
    if (active) return active as Promise<T>;
    const pending = Promise.resolve()
      .then(async () => {
        const prepared = await prepare();
        return this.transaction(() => {
          authorize();
          const result = commit(prepared);
          this.#db
            .query("UPDATE commands SET receipt=? WHERE id=? AND fingerprint=?")
            .run(JSON.stringify(result), commandId, fingerprint);
          return result;
        });
      })
      .finally(() => this.#pendingCommands.delete(commandId));
    this.#pendingCommands.set(commandId, pending);
    return pending;
  }

  receipt(commandId: string): unknown | null {
    const row = this.#db
      .query<{ receipt: string }, [string]>("SELECT receipt FROM commands WHERE id=?")
      .get(commandId);
    if (!row) return null;
    const result = JSON.parse(row.receipt);
    return result?.["@ngertiin/command"] === "pending" ? null : result;
  }

  recordRoutingTrace(input: RoutingDecisionTrace) {
    const trace = routingDecisionTrace.parse(input);
    this.transaction(() => {
      this.#db
        .query(
          "INSERT INTO routing_traces(route_id,attempt_id,body) VALUES(?,?,?) ON CONFLICT(attempt_id) DO UPDATE SET body=excluded.body",
        )
        .run(trace.route_id, trace.attempt_id, JSON.stringify(trace));
      // Bound diagnostic retention without changing domain history or command receipts.
      this.#db.exec(
        "DELETE FROM routing_traces WHERE seq NOT IN (SELECT seq FROM routing_traces ORDER BY seq DESC LIMIT 1000)",
      );
    });
  }

  routingTrace(routeId: string): RoutingDecisionTrace | null {
    const row = this.#db
      .query<{ body: string }, [string]>(
        "SELECT body FROM routing_traces WHERE route_id=? ORDER BY seq DESC LIMIT 1",
      )
      .get(routeId);
    return row ? routingDecisionTrace.parse(JSON.parse(row.body)) : null;
  }

  get<K extends Kind>(kind: K, id: string | null): Entity<K> {
    if (id === null) throw new DomainError("NOT_FOUND", 404);
    const row = this.#db
      .query<{ body: string }, [string, string]>("SELECT body FROM entities WHERE kind=? AND id=?")
      .get(kind, id);
    if (!row) throw new DomainError("NOT_FOUND", 404);
    return schemas[kind].parse(JSON.parse(row.body)) as Entity<K>;
  }

  list<K extends Kind>(kind: K): Entity<K>[] {
    return this.#db
      .query<{ body: string }, [string]>("SELECT body FROM entities WHERE kind=? ORDER BY seq")
      .all(kind)
      .map((row) => schemas[kind].parse(JSON.parse(row.body)) as Entity<K>);
  }

  answer(runId: string): Entity<"message"> | null {
    const row = this.#db
      .query<{ body: string }, [string]>(
        "SELECT body FROM entities WHERE kind='message' AND json_extract(body,'$.author')='agent' AND json_extract(body,'$.run_id')=? AND COALESCE(json_extract(body,'$.purpose'), 'conversation')='conversation'",
      )
      .get(runId);
    return row ? schemas.message.parse(JSON.parse(row.body)) : null;
  }

  put<T extends Entity>(entity: T, expectedRevision: number | null = null): T {
    if (entity.kind === "skill_revision" && expectedRevision !== null)
      throw new DomainError("CONFLICT");
    const validated = schemas[entity.kind].parse(entity);
    if (validated.owner_id !== this.ownerId) throw new DomainError("SCOPE_DENIED", 403);
    return this.transaction(() => {
      const previous = expectedRevision === null ? null : this.get(entity.kind, entity.id);
      const body = JSON.stringify(validated);
      if (expectedRevision === null) {
        this.#db
          .query("INSERT INTO entities (kind,id,body) VALUES (?,?,?)")
          .run(entity.kind, entity.id, body);
      } else {
        if (entity.revision !== expectedRevision + 1) throw new DomainError("CONFLICT");
        const result = this.#db
          .query(
            "UPDATE entities SET body=? WHERE kind=? AND id=? AND json_extract(body,'$.revision')=?",
          )
          .run(body, entity.kind, entity.id, expectedRevision);
        if (result.changes !== 1) throw new DomainError("CONFLICT");
      }
      const event = {
        schema_version: 1,
        owner_id: this.ownerId,
        type: `${entity.kind}.${expectedRevision === null ? "created" : "updated"}`,
        entity_kind: entity.kind,
        entity_id: entity.id,
        revision: entity.revision,
        created_at: entity.updated_at,
        data: validated,
      };
      const inserted = this.#db
        .query("INSERT INTO events (body) VALUES (?)")
        .run(JSON.stringify(event));
      this.journal.record(validated as Entity, previous, Number(inserted.lastInsertRowid));
      return validated as T;
    });
  }

  events(after: number, limit = 100): DomainEvent[] {
    return this.#db
      .query<{ cursor: number; body: string }, [number, number]>(
        "SELECT cursor, body FROM events WHERE cursor>? ORDER BY cursor LIMIT ?",
      )
      .all(after, limit)
      .map(({ cursor, body }) => ({ ...JSON.parse(body), cursor }));
  }

  get cursor(): number {
    return (
      this.#db
        .query<{ cursor: number }, []>("SELECT COALESCE(MAX(cursor),0) AS cursor FROM events")
        .get()?.cursor ?? 0
    );
  }

  close() {
    this.#closed = true;
    for (const listener of this.#listeners) listener();
    this.#listeners.clear();
    this.#db.close();
    this.#lock.close();
  }
  get closed() {
    return this.#closed;
  }
}
