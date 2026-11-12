import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Client, Pool, type PoolClient, type QueryResultRow } from "pg";
import { DomainError, type DomainEvent, type Entity, type Kind, schemas } from "./contracts";
import { ConversationJournal } from "./conversations/journal";
import { type RoutingDecisionTrace, routingDecisionTrace } from "./groups/decision-trace";
import { schemaSql, schemaVersion } from "./persistence/schema";

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
type Transaction = {
  client: PoolClient;
  active: boolean;
  changed: boolean;
  tail: Promise<unknown>;
  root?: Transaction;
};
export type StoreOptions = { connectionString?: string; schema?: string; max?: number };
export type EntityQuery = {
  after?: number;
  limit?: number;
  thread_id?: string | null;
  agent_id?: string | null;
  state?: string;
  status?: string;
  statuses?: string[];
  run_id?: string | null;
  workspace_id?: string | null;
  connection_id?: string | null;
  binding_id?: string | null;
};
const LOCK_CLASS = 0x4e474831;
const pendingReceipt = { "@ngertiin/command": "pending" };

/** Async SQL persistence; a dedicated session owns the sole application lifecycle authority. */
export class Store {
  readonly #pool: Pool;
  readonly #authority: Client;
  readonly #transactions = new AsyncLocalStorage<Transaction>();
  readonly #authorization = new AsyncLocalStorage<() => unknown | Promise<unknown>>();
  readonly #listeners = new Set<() => unknown>();
  readonly #pendingCommands = new Map<
    string,
    { fingerprint: string; verifiedFile: boolean; promise: Promise<unknown> }
  >();
  readonly #lost = new AbortController();
  readonly journal: ConversationJournal;
  readonly schema: string;
  epoch = 0;
  authorityPid = 0;
  #lockKey = 0;
  #closed = false;
  #notificationPending = false;
  #closing?: Promise<void>;
  private constructor(
    readonly path: string,
    readonly ownerId: string,
    options: StoreOptions,
  ) {
    if (existsSync(path))
      throw new Error(
        "SQLite requires an explicit offline import; select a fresh PostgreSQL state path.",
      );
    const connectionString = options.connectionString ?? process.env.NGERTIIN_DATABASE_URL;
    if (!connectionString || !/^postgres(?:ql)?:\/\//.test(connectionString))
      throw new Error(
        "NGERTIIN_DATABASE_URL must select PostgreSQL. SQLite requires an explicit offline import.",
      );
    this.schema = options.schema ?? "ngertiin_app";
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(this.schema)) throw new Error("Invalid application schema.");
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const config = {
      connectionString,
      options: `-c search_path=${this.schema},pg_catalog`,
      connectionTimeoutMillis: 5000,
      application_name: "ngertiin",
    };
    this.#pool = new Pool({ ...config, max: options.max ?? 8 });
    this.#pool.on("error", () => {
      /* A failed idle query connection never acquires authority. */
    });
    this.#authority = new Client({ ...config, application_name: "ngertiin-authority" });
    this.#authority.on("error", () => this.loseAuthority());
    this.#authority.on("end", () => this.loseAuthority());
    this.journal = new ConversationJournal(this, (kind, id, cursor) =>
      this.readAt(kind, id, cursor),
    );
  }
  static async open(path: string, ownerId: string, options: StoreOptions = {}): Promise<Store> {
    const store = new Store(path, ownerId, options);
    try {
      await store.initialize();
      return store;
    } catch (error) {
      await store.close();
      throw error;
    }
  }
  private async initialize() {
    await this.#authority.connect();
    const lock = await this.#authority.query<{ key: number; pid: number }>(
      "SELECT hashtext(current_database() || ':' || $1) AS key,pg_backend_pid() AS pid",
      [this.schema],
    );
    this.#lockKey = lock.rows[0].key;
    this.authorityPid = lock.rows[0].pid;
    const held = await this.#authority.query<{ held: boolean }>(
      "SELECT pg_try_advisory_lock($1,$2) AS held",
      [LOCK_CLASS, this.#lockKey],
    );
    if (!held.rows[0].held)
      throw new Error("Another application authority owns this state directory.");
    await this.#authority.query("BEGIN");
    try {
      await this.#authority.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}"`);
      await this.#authority.query(
        "CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
      );
      const migrations = (
        await this.#authority.query<{ version: number; sha256: string }>(
          "SELECT version,sha256 FROM schema_migrations ORDER BY version",
        )
      ).rows;
      const checksum = createHash("sha256").update(schemaSql).digest("hex");
      if (
        migrations.some(
          (migration) => migration.version !== schemaVersion || migration.sha256 !== checksum,
        )
      )
        throw new Error("Unsupported or modified database migration.");
      if (!migrations.length) {
        await this.#authority.query(schemaSql);
        await this.#authority.query("INSERT INTO schema_migrations(version,sha256) VALUES($1,$2)", [
          schemaVersion,
          checksum,
        ]);
      }
      await this.#authority.query(
        "INSERT INTO installation(id,owner_id,installation_id,schema_version) VALUES(1,$1,$2,$3) ON CONFLICT DO NOTHING",
        [this.ownerId, crypto.randomUUID(), schemaVersion],
      );
      const row = (await this.#authority.query("SELECT * FROM installation WHERE id=1 FOR UPDATE"))
        .rows[0];
      if (row.owner_id !== this.ownerId) throw new Error("State belongs to another owner.");
      if (row.schema_version !== schemaVersion)
        throw new Error("Unsupported database schema version.");
      this.epoch = Number(
        (
          await this.#authority.query(
            "UPDATE installation SET authority_epoch=authority_epoch+1 WHERE id=1 RETURNING authority_epoch",
          )
        ).rows[0].authority_epoch,
      );
      await this.#authority.query("COMMIT");
    } catch (error) {
      await this.#authority.query("ROLLBACK");
      throw error;
    }
    await this.transaction(() => this.journal.replay());
  }
  get signal() {
    return this.#lost.signal;
  }
  get closed() {
    return this.#closed || this.#lost.signal.aborted;
  }
  private loseAuthority() {
    if (!this.#lost.signal.aborted) this.#lost.abort();
    this.emitListeners();
  }
  /** Check both the durable epoch and the original dedicated session's lock. Never reacquire. */
  async assertAuthority() {
    if (this.closed) throw new DomainError("STALE_DISPATCH");
    const row = (
      await this.query<{ valid: boolean }>(
        `SELECT authority_epoch=$1 AND EXISTS(
      SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid=$2 AND granted
      AND classid=$3::oid AND objid=($4::bigint & 4294967295)::oid AND objsubid=2
    ) AS valid FROM installation WHERE id=1`,
        [this.epoch, this.authorityPid, LOCK_CLASS, this.#lockKey],
      )
    ).rows[0];
    if (!row?.valid || this.closed) {
      this.loseAuthority();
      throw new DomainError("STALE_DISPATCH");
    }
  }
  async query<R extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
    const context = this.#transactions.getStore();
    if (context && !context.active) throw new Error("Transaction context has expired.");
    return (context?.client ?? this.#pool).query<R>(text, values);
  }
  async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    if (this.closed) throw new DomainError("STALE_DISPATCH");
    const parent = this.#transactions.getStore();
    if (parent) {
      const run = async () => {
        if (!parent.active) throw new Error("Transaction context has expired.");
        const name = `s_${crypto.randomUUID().replaceAll("-", "")}`;
        await parent.client.query(`SAVEPOINT ${name}`);
        const child: Transaction = {
          client: parent.client,
          active: true,
          changed: false,
          tail: Promise.resolve(),
          root: parent.root ?? parent,
        };
        try {
          const result = await this.#transactions.run(child, fn);
          await child.tail;
          await parent.client.query(`RELEASE SAVEPOINT ${name}`);
          parent.changed ||= child.changed;
          return result;
        } catch (error) {
          await child.tail;
          await parent.client.query(`ROLLBACK TO SAVEPOINT ${name}`);
          await parent.client.query(`RELEASE SAVEPOINT ${name}`);
          throw error;
        } finally {
          child.active = false;
        }
      };
      const result = parent.tail.then(run, run);
      parent.tail = result.then(
        () => {},
        () => {},
      );
      return result;
    }
    const client = await this.#pool.connect();
    const context: Transaction = { client, active: true, changed: false, tail: Promise.resolve() };
    try {
      await client.query("BEGIN");
      const result = await this.#transactions.run(context, async () => {
        // The clock row serializes writers through commit, including receipts and projections.
        await client.query("SELECT event_clock FROM installation WHERE id=1 FOR UPDATE");
        await this.assertAuthority();
        const value = await fn();
        await context.tail;
        await this.assertAuthority();
        await client.query("COMMIT");
        return value;
      });
      if (context.changed) this.notify();
      return result;
    } catch (error) {
      await context.tail;
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      context.active = false;
      client.release();
    }
  }
  subscribe(listener: () => unknown) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  private emitListeners() {
    const failed = () => {
      if (!this.closed) console.error(JSON.stringify({ event: "persistence.subscription_failed" }));
    };
    for (const listener of this.#listeners) {
      try {
        void Promise.resolve(listener()).catch(failed);
      } catch {
        failed();
      }
    }
  }
  private notify() {
    if (this.#notificationPending) return;
    this.#notificationPending = true;
    queueMicrotask(() => {
      this.#notificationPending = false;
      if (!this.closed) this.emitListeners();
    });
  }
  async waitForEvents(after: number, signal: AbortSignal, timeoutMs = 10000): Promise<void> {
    if (this.closed || signal.aborted || (await this.cursor) > after) return;
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        unsubscribe();
        signal.removeEventListener("abort", finish);
        resolve();
      };
      const unsubscribe = this.subscribe(finish);
      const timer = setTimeout(finish, timeoutMs);
      signal.addEventListener("abort", finish, { once: true });
      void this.cursor.then((cursor) => {
        if (this.closed || signal.aborted || cursor > after) finish();
      }, finish);
    });
  }
  private commandScope(input: unknown) {
    const value = input as {
      organization_id?: string;
      actor_id?: string;
      method?: string;
      path?: string;
      operation?: string;
    } | null;
    return canonical([
      this.ownerId,
      value?.organization_id ?? null,
      value?.actor_id ?? this.ownerId,
      value?.method ?? value?.operation ?? null,
      value?.path ?? null,
    ]);
  }
  async withAuthorization<T>(
    authorize: () => unknown | Promise<unknown>,
    action: () => T | Promise<T>,
  ): Promise<T> {
    return this.#authorization.run(authorize, action);
  }
  private legacyCommandScope(input: unknown) {
    const scope = input as { organization_id?: string; actor_id?: string } | null;
    return scope?.organization_id || (scope?.actor_id && scope.actor_id !== this.ownerId)
      ? this.commandScope(input)
      : canonical([this.ownerId, null, this.ownerId, null, null]);
  }
  async command<T>(
    commandId: string,
    input: unknown,
    fn: () => T | Promise<T>,
    authorize: () => unknown | Promise<unknown> = this.#authorization.getStore() ?? (() => {}),
  ): Promise<T> {
    const fingerprint = createHash("sha256").update(canonical(input)).digest("hex");
    const scope = this.commandScope(input);
    return this.transaction(async () => {
      await authorize();
      const old = (
        await this.query(
          "SELECT fingerprint,receipt FROM commands WHERE (scope=$1 OR scope=$3) AND id=$2 ORDER BY (scope=$1) DESC LIMIT 1",
          [scope, commandId, this.legacyCommandScope(input)],
        )
      ).rows[0];
      if (old) {
        if (old.fingerprint !== fingerprint) throw new DomainError("IDEMPOTENCY_CONFLICT");
        if (old.receipt?.["@ngertiin/command"] === "pending")
          throw new DomainError("RECONCILIATION_REQUIRED");
        return JSON.parse(canonical(old.receipt)) as T;
      }
      const result = await fn();
      await this.query("INSERT INTO commands VALUES($1,$2,$3,$4)", [
        scope,
        commandId,
        fingerprint,
        JSON.stringify(result),
      ]);
      return JSON.parse(canonical(result)) as T;
    });
  }
  /** External I/O stays outside SQL; ambiguous external reservations require reconciliation. */
  async asyncCommand<T, Prepared>(
    commandId: string,
    input: unknown,
    prepare: () => Promise<Prepared>,
    commit: (prepared: Prepared) => T | Promise<T>,
    authorize: () => unknown | Promise<unknown> = this.#authorization.getStore() ?? (() => {}),
  ): Promise<T> {
    return this.effectCommand(commandId, input, prepare, commit, authorize, false);
  }
  /** Only deterministic file projections with immutable byte verification may reconcile reservations. */
  async fileCommand<T, Prepared>(
    commandId: string,
    input: unknown,
    prepare: () => Promise<Prepared>,
    commit: (prepared: Prepared) => T | Promise<T>,
    authorize: () => unknown | Promise<unknown> = this.#authorization.getStore() ?? (() => {}),
  ): Promise<T> {
    return this.effectCommand(commandId, input, prepare, commit, authorize, true);
  }
  private async effectCommand<T, Prepared>(
    commandId: string,
    input: unknown,
    prepare: () => Promise<Prepared>,
    commit: (prepared: Prepared) => T | Promise<T>,
    authorize: () => unknown | Promise<unknown>,
    verifiedFile: boolean,
  ): Promise<T> {
    await authorize();
    const scope = this.commandScope(input);
    const key = `${scope}:${commandId}`;
    const fingerprint = createHash("sha256").update(canonical(input)).digest("hex");
    const active = this.#pendingCommands.get(key);
    if (active) {
      if (active.fingerprint !== fingerprint || active.verifiedFile !== verifiedFile)
        throw new DomainError("IDEMPOTENCY_CONFLICT");
      const result = (await active.promise) as T;
      await authorize();
      return result;
    }
    const pending = (async () => {
      const previous = await this.transaction(async () => {
        await authorize();
        const old = (
          await this.query(
            "SELECT fingerprint,receipt FROM commands WHERE (scope=$1 OR scope=$3) AND id=$2 ORDER BY (scope=$1) DESC LIMIT 1",
            [scope, commandId, this.legacyCommandScope(input)],
          )
        ).rows[0];
        if (old) {
          if (old.fingerprint !== fingerprint) throw new DomainError("IDEMPOTENCY_CONFLICT");
          if (old.receipt?.["@ngertiin/command"] === "pending") {
            if (!verifiedFile || old.receipt.effect_class !== "verified_file")
              throw new DomainError("RECONCILIATION_REQUIRED");
            return null;
          }
          return { receipt: JSON.parse(canonical(old.receipt)) as T };
        }
        await this.query("INSERT INTO commands VALUES($1,$2,$3,$4)", [
          scope,
          commandId,
          fingerprint,
          JSON.stringify({
            ...pendingReceipt,
            effect_class: verifiedFile ? "verified_file" : "external",
          }),
        ]);
        return null;
      });
      if (previous) return previous.receipt;
      const prepared = await prepare();
      return this.transaction(async () => {
        await authorize();
        const result = await commit(prepared);
        await this.query(
          "UPDATE commands SET receipt=$1 WHERE scope=$2 AND id=$3 AND fingerprint=$4",
          [JSON.stringify(result), scope, commandId, fingerprint],
        );
        return JSON.parse(canonical(result)) as T;
      });
    })().finally(() => this.#pendingCommands.delete(key));
    this.#pendingCommands.set(key, { fingerprint, verifiedFile, promise: pending });
    return pending;
  }
  async receipt(
    commandId: string,
    input: unknown = null,
    authorize: () => unknown | Promise<unknown> = this.#authorization.getStore() ?? (() => {}),
  ): Promise<unknown | null> {
    await authorize();
    const context = input as { organization_id?: string; actor_id?: string } | null;
    const rows = (
      await this.query(
        "SELECT receipt FROM commands WHERE scope::jsonb->>0=$1 AND (scope::jsonb->>1) IS NOT DISTINCT FROM $2::text AND scope::jsonb->>2=$3 AND id=$4 LIMIT 2",
        [
          this.ownerId,
          context?.organization_id ?? null,
          context?.actor_id ?? this.ownerId,
          commandId,
        ],
      )
    ).rows;
    if (rows.length > 1) throw new DomainError("IDEMPOTENCY_CONFLICT");
    const row = rows[0];
    return !row || row.receipt?.["@ngertiin/command"] === "pending" ? null : row.receipt;
  }
  async recordRoutingTrace(input: RoutingDecisionTrace) {
    const trace = routingDecisionTrace.parse(input);
    await this.transaction(async () => {
      await this.query(
        "INSERT INTO routing_traces(route_id,attempt_id,body) VALUES($1,$2,$3) ON CONFLICT(attempt_id) DO UPDATE SET body=excluded.body",
        [trace.route_id, trace.attempt_id, JSON.stringify(trace)],
      );
      await this.query(
        "DELETE FROM routing_traces WHERE seq NOT IN (SELECT seq FROM routing_traces ORDER BY seq DESC LIMIT 1000)",
      );
    });
  }
  async routingTrace(routeId: string): Promise<RoutingDecisionTrace | null> {
    const row = (
      await this.query(
        "SELECT body FROM routing_traces WHERE route_id=$1 ORDER BY seq DESC LIMIT 1",
        [routeId],
      )
    ).rows[0];
    return row ? routingDecisionTrace.parse(row.body) : null;
  }
  private async readAt<K extends Kind>(
    kind: K,
    id: string,
    cursor?: number,
  ): Promise<Entity<K> | null> {
    const row =
      cursor === undefined
        ? (
            await this.query("SELECT body FROM entities WHERE owner_id=$1 AND kind=$2 AND id=$3", [
              this.ownerId,
              kind,
              id,
            ])
          ).rows[0]
        : (
            await this.query(
              "SELECT body->'data' AS body FROM events WHERE owner_id=$1 AND body->>'entity_kind'=$2 AND body->>'entity_id'=$3 AND cursor<=$4 ORDER BY cursor DESC LIMIT 1",
              [this.ownerId, kind, id, cursor],
            )
          ).rows[0];
    return row ? (row.body as Entity<K>) : null;
  }
  async get<K extends Kind>(kind: K, id: string | null): Promise<Entity<K>> {
    if (!id) throw new DomainError("NOT_FOUND", 404);
    const entity = await this.readAt(kind, id);
    if (!entity) throw new DomainError("NOT_FOUND", 404);
    return schemas[kind].parse(entity) as Entity<K>;
  }
  async page<K extends Kind>(kind: K, query: EntityQuery = {}) {
    const limit = Math.max(1, Math.min(query.limit ?? 200, 1000));
    const values: unknown[] = [this.ownerId, kind, query.after ?? 0];
    const filters = ["owner_id=$1", "kind=$2", "seq>$3"];
    for (const field of [
      "thread_id",
      "agent_id",
      "state",
      "status",
      "run_id",
      "workspace_id",
      "connection_id",
      "binding_id",
    ] as const)
      if (query[field] !== undefined) {
        if (query[field] === null) filters.push(`body->>'${field}' IS NULL`);
        else {
          values.push(query[field]);
          filters.push(`body->>'${field}'=$${values.length}`);
        }
      }
    if (query.statuses) {
      values.push(query.statuses);
      filters.push(`body->>'status'=ANY($${values.length}::text[])`);
    }
    values.push(limit + 1);
    const rows = (
      await this.query(
        `SELECT seq,body FROM entities WHERE ${filters.join(" AND ")} ORDER BY seq LIMIT $${values.length}`,
        values,
      )
    ).rows;
    return {
      items: rows.slice(0, limit).map((row) => schemas[kind].parse(row.body) as Entity<K>),
      next_after: rows.length > limit ? Number(rows[limit - 1].seq) : null,
    };
  }
  /** Compatibility traversal for existing service algorithms; SQL reads are keyset-paged. */
  async list<K extends Kind>(
    kind: K,
    query: Omit<EntityQuery, "after" | "limit"> = {},
  ): Promise<Entity<K>[]> {
    const items: Entity<K>[] = [];
    let after = 0;
    let more = true;
    while (more) {
      const page = await this.page(kind, { ...query, after });
      items.push(...page.items);
      more = page.next_after !== null;
      after = page.next_after ?? after;
    }
    return items;
  }
  async answer(runId: string): Promise<Entity<"message"> | null> {
    const row = (
      await this.query(
        "SELECT body FROM entities WHERE owner_id=$1 AND kind='message' AND body->>'author'='agent' AND body->>'run_id'=$2 AND COALESCE(body->>'purpose','conversation')='conversation' LIMIT 1",
        [this.ownerId, runId],
      )
    ).rows[0];
    return row ? schemas.message.parse(row.body) : null;
  }
  async put<T extends Entity>(entity: T, expectedRevision: number | null = null): Promise<T> {
    if (entity.kind === "skill_revision" && expectedRevision !== null)
      throw new DomainError("CONFLICT");
    const validated = schemas[entity.kind].parse(entity);
    if (validated.owner_id !== this.ownerId) throw new DomainError("SCOPE_DENIED", 403);
    return this.transaction(async () => {
      const previous = expectedRevision === null ? null : await this.get(entity.kind, entity.id);
      if (expectedRevision === null)
        await this.query("INSERT INTO entities(kind,id,owner_id,body) VALUES($1,$2,$3,$4)", [
          entity.kind,
          entity.id,
          this.ownerId,
          JSON.stringify(validated),
        ]);
      else {
        if (entity.revision !== expectedRevision + 1) throw new DomainError("CONFLICT");
        const result = await this.query(
          "UPDATE entities SET body=$1 WHERE owner_id=$2 AND kind=$3 AND id=$4 AND (body->>'revision')::int=$5",
          [JSON.stringify(validated), this.ownerId, entity.kind, entity.id, expectedRevision],
        );
        if (result.rowCount !== 1) throw new DomainError("CONFLICT");
      }
      const cursor = Number(
        (
          await this.query(
            "UPDATE installation SET event_clock=event_clock+1 WHERE id=1 RETURNING event_clock",
          )
        ).rows[0].event_clock,
      );
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
      await this.query("INSERT INTO events(cursor,owner_id,body) VALUES($1,$2,$3)", [
        cursor,
        this.ownerId,
        JSON.stringify(event),
      ]);
      await this.journal.record(validated as Entity, previous, cursor);
      const context = this.#transactions.getStore();
      if (context) context.changed = true;
      return validated as T;
    });
  }
  async replay(after: number, options: { limit?: number; thread_id?: string } = {}) {
    return this.transaction(async () => {
      if (options.thread_id) await this.get("thread", options.thread_id);
      const high = await this.cursor;
      const limit = Math.max(1, Math.min(options.limit ?? 100, 1000));
      const values: unknown[] = [this.ownerId, after, high, limit + 1];
      const filter = options.thread_id
        ? " AND (body->'data'->>'thread_id'=$5 OR (body->>'entity_kind'='thread' AND body->>'entity_id'=$5))"
        : "";
      if (options.thread_id) values.push(options.thread_id);
      const rows = (
        await this.query(
          `SELECT cursor,body FROM events WHERE owner_id=$1 AND cursor>$2 AND cursor<=$3${filter} ORDER BY cursor LIMIT $4`,
          values,
        )
      ).rows;
      const events = rows
        .slice(0, limit)
        .map((row) => ({ ...row.body, cursor: Number(row.cursor) })) as DomainEvent[];
      return { events, next_cursor: rows.length > limit ? events[events.length - 1].cursor : high };
    });
  }
  async events(after: number, limit = 100): Promise<DomainEvent[]> {
    return (
      await this.query(
        "SELECT cursor,body FROM events WHERE owner_id=$1 AND cursor>$2 ORDER BY cursor LIMIT $3",
        [this.ownerId, after, Math.max(1, Math.min(limit, 1000))],
      )
    ).rows.map((row) => ({ ...row.body, cursor: Number(row.cursor) }));
  }
  get cursor(): Promise<number> {
    return this.query("SELECT event_clock FROM installation WHERE id=1").then((result) =>
      Number(result.rows[0].event_clock),
    );
  }
  close(): Promise<void> {
    this.#closing ??= (async () => {
      this.#closed = true;
      this.loseAuthority();
      this.#listeners.clear();
      await this.#pool.end();
      await this.#authority.end();
    })();
    return this.#closing;
  }
}
