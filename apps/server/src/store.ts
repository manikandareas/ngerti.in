import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Client, Pool, type PoolClient, type QueryResultRow } from "pg";
import { DomainError, type DomainEvent, type Entity, type Kind, schemas } from "./contracts";
import { ConversationJournal } from "./conversations/journal";
import { type RoutingDecisionTrace, routingDecisionTrace } from "./groups/decision-trace";
import type { DataContext } from "./persistence/access-context";
import { executionSchemaSql, executionSchemaVersion } from "./persistence/execution-schema";
import { integrationSchemaSql, integrationSchemaVersion } from "./persistence/integration-schema";
import { providerSchemaSql, providerSchemaVersion } from "./persistence/provider-schema";
import { fenceScopedRun } from "./persistence/run-fence";
import { schemaSql, schemaVersion } from "./persistence/schema";
import { scopedSchemaSql, scopedSchemaVersion } from "./persistence/scoped-schema";

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
  validate?: (privateWork?: boolean) => Promise<unknown>;
};
export type StoreOptions = {
  connectionString?: string;
  runtimeConnectionString?: string;
  schema?: string;
  max?: number;
};
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
  readonly #administration: Pool;
  readonly #authority: Client;
  readonly #transactions = new AsyncLocalStorage<Transaction>();
  readonly #authorization = new AsyncLocalStorage<() => unknown | Promise<unknown>>();
  readonly #data = new AsyncLocalStorage<DataContext>();
  readonly #publication = new AsyncLocalStorage<DataContext>();
  scopeRunner?: (action: () => Promise<void>) => Promise<void>;

  async fenceScopedRun(
    run: Entity<"run">,
    outcome?: "succeeded" | "failed" | "cancelled" | "unknown",
  ) {
    if (run.owner_id !== this.ownerId) throw new DomainError("SCOPE_DENIED", 403);
    await fenceScopedRun(
      this.#administration,
      run,
      (client) => this.checkAuthority(client),
      outcome,
    );
    this.notify();
  }
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
    this.#pool = new Pool({
      ...config,
      connectionString:
        options.runtimeConnectionString ??
        (process.env.NGERTIIN_APPLICATION_DATABASE_URL?.trim() || connectionString),
      max: options.max ?? 8,
    });
    this.#administration = new Pool({
      ...config,
      max: 2,
      application_name: "ngertiin-scope-administration",
    });
    this.#administration.on("error", () => {});
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
      const scopedSql = scopedSchemaSql(this.schema);
      const scopedChecksum = createHash("sha256").update(scopedSql).digest("hex");
      const executionSql = executionSchemaSql(this.schema);
      const executionChecksum = createHash("sha256").update(executionSql).digest("hex");
      const providerSql = providerSchemaSql(this.schema);
      const providerChecksum = createHash("sha256").update(providerSql).digest("hex");
      const integrationSql = integrationSchemaSql();
      const integrationChecksum = createHash("sha256").update(integrationSql).digest("hex");
      if (
        migrations.some(
          (migration) =>
            !(
              (migration.version === schemaVersion && migration.sha256 === checksum) ||
              (migration.version === scopedSchemaVersion && migration.sha256 === scopedChecksum) ||
              (migration.version === integrationSchemaVersion &&
                migration.sha256 === integrationChecksum) ||
              (migration.version === providerSchemaVersion &&
                migration.sha256 === providerChecksum) ||
              (migration.version === executionSchemaVersion &&
                migration.sha256 === executionChecksum)
            ),
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
      if (!migrations.some((migration) => migration.version === scopedSchemaVersion)) {
        await this.#authority.query(scopedSql);
        await this.#authority.query("INSERT INTO schema_migrations(version,sha256) VALUES($1,$2)", [
          scopedSchemaVersion,
          scopedChecksum,
        ]);
      }
      if (!migrations.some((migration) => migration.version === executionSchemaVersion)) {
        await this.#authority.query(executionSql);
        await this.#authority.query("INSERT INTO schema_migrations(version,sha256) VALUES($1,$2)", [
          executionSchemaVersion,
          executionChecksum,
        ]);
      }
      if (!migrations.some((migration) => migration.version === providerSchemaVersion)) {
        await this.#authority.query(providerSql);
        await this.#authority.query("INSERT INTO schema_migrations(version,sha256) VALUES($1,$2)", [
          providerSchemaVersion,
          providerChecksum,
        ]);
      }
      if (!migrations.some((migration) => migration.version === integrationSchemaVersion)) {
        await this.#authority.query(integrationSql);
        await this.#authority.query("INSERT INTO schema_migrations(version,sha256) VALUES($1,$2)", [
          integrationSchemaVersion,
          integrationChecksum,
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
    await this.checkAuthority();
  }
  private async checkAuthority(client?: PoolClient) {
    if (this.closed) throw new DomainError("STALE_DISPATCH");
    const sql = `SELECT authority_epoch=$1 AND EXISTS(
      SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid=$2 AND granted
      AND classid=$3::oid AND objid=($4::bigint & 4294967295)::oid AND objsubid=2
    ) AS valid FROM installation WHERE id=1`;
    const values = [this.epoch, this.authorityPid, LOCK_CLASS, this.#lockKey];
    // Receipt settlement needs application authority after the requesting member loses
    // access. Its bounded administrative transaction must not re-enter actor authorization.
    const row = (
      client
        ? await client.query<{ valid: boolean }>(sql, values)
        : await this.query<{ valid: boolean }>(sql, values)
    ).rows[0];
    if (!row?.valid || this.closed) {
      this.loseAuthority();
      throw new DomainError("STALE_DISPATCH");
    }
  }
  async query<R extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
    const context = this.#transactions.getStore();
    if (context && !context.active) throw new Error("Transaction context has expired.");
    await this.validateDataContext();
    if (context) return context.client.query<R>(text, values);
    const release = await this.dataContext?.acquire?.();
    let client: PoolClient;
    try {
      client = await this.#pool.connect();
    } catch (error) {
      await release?.();
      throw error;
    }
    try {
      await client.query("BEGIN");
      await this.configureScope(client, release?.validate);
      const result = await client.query<R>(text, values);
      await (release?.validate ?? this.dataContext?.validate)?.();
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
      await release?.();
    }
  }
  outsideDataContext<T>(action: () => T): T {
    return this.#data.exit(action);
  }
  get publishing() {
    return this.dataContext !== undefined && this.#publication.getStore() === this.dataContext;
  }
  get dataContext() {
    return this.#data.getStore();
  }
  withDataContext<T>(context: DataContext, action: () => T): T {
    if (this.#transactions.getStore())
      throw new Error("Data scope must be selected before a transaction.");
    return this.#data.run(context, action);
  }
  async validateDataContext(privateWork = false) {
    return (this.#transactions.getStore()?.validate ?? this.dataContext?.validate)?.(privateWork);
  }
  async publishShared<T>(action: () => Promise<T>): Promise<T> {
    if (!this.dataContext?.canManage) throw new DomainError("SCOPE_DENIED", 403);
    const transaction = this.#transactions.getStore();
    if (this.publishing) return action();
    try {
      return await this.#publication.run(this.dataContext, async () => {
        if (transaction) await this.configureScope(transaction.client);
        return action();
      });
    } finally {
      if (transaction) await this.configureScope(transaction.client);
    }
  }
  async assertInvocation(agentId: string) {
    const context = this.dataContext;
    if (!context) return;
    await this.validateDataContext(true);
    const agent = await this.get("agent", agentId);
    if (agent.ownership === "organization" && !context.invocableAgents.includes(agentId))
      throw new DomainError("SCOPE_DENIED", 403);
  }
  /** Bounded service read used only after account membership has been authenticated. */
  async teamGrants(organizationId: string): Promise<{ agent_id: string; audience_id: string }[]> {
    return (
      await this.#administration.query(
        "SELECT agent_id,audience_id FROM team_agent_grants WHERE organization_id=$1",
        [organizationId],
      )
    ).rows;
  }
  async connectionGrants(
    organizationId: string,
    kind: "connection" | "app_connection" = "connection",
  ): Promise<{ id: string; audience_id: string | null }[]> {
    return (
      await this.#administration.query(
        "SELECT id,body->>'audience_id' AS audience_id FROM entities WHERE organization_id=$1 AND actor_id IS NULL AND kind=$2",
        [organizationId, kind],
      )
    ).rows;
  }
  async legacyScopeMapped() {
    return Boolean(
      (await this.#administration.query("SELECT 1 FROM legacy_scope_binding WHERE id=1")).rowCount,
    );
  }
  /** Only a previously reserved app effect can be settled after its actor is revoked.
   * This narrow authority retains the real outcome without returning it to that actor. */
  async settleAppEffect(
    effect: Entity<"app_effect">,
    fields: Pick<
      Entity<"app_effect">,
      "state" | "log_id" | "request_id" | "sdk_error" | "error_code" | "result"
    >,
  ) {
    const client = await this.#administration.connect();
    try {
      await client.query("BEGIN");
      // Match ordinary writer lock order and fence stale application authorities.
      await client.query("SELECT event_clock FROM installation WHERE id=1 FOR UPDATE");
      await this.checkAuthority(client);
      const row = (
        await client.query(
          "SELECT body FROM entities WHERE owner_id=$1 AND kind='app_effect' AND id=$2 FOR UPDATE",
          [this.ownerId, effect.id],
        )
      ).rows[0];
      const current = row ? schemas.app_effect.parse(row.body) : null;
      if (
        !current ||
        current.fingerprint !== effect.fingerprint ||
        current.account_id !== effect.account_id ||
        current.generation !== effect.generation ||
        !["dispatched", "unknown"].includes(current.state)
      )
        throw new DomainError("CONFLICT");
      const receipt = schemas.app_effect.parse({
        ...current,
        state: fields.state,
        log_id: fields.log_id,
        request_id: fields.request_id,
        sdk_error: fields.sdk_error,
        error_code: fields.error_code,
        result: fields.result,
        revision: current.revision + 1,
        updated_at: new Date().toISOString(),
      });
      await client.query("UPDATE entities SET body=$1 WHERE kind='app_effect' AND id=$2", [
        JSON.stringify(receipt),
        receipt.id,
      ]);
      const cursor = Number(
        (
          await client.query(
            "UPDATE installation SET event_clock=event_clock+1 WHERE id=1 RETURNING event_clock",
          )
        ).rows[0].event_clock,
      );
      await client.query(
        "INSERT INTO events(cursor,owner_id,body,organization_id,actor_id) VALUES($1,$2,$3,$4,$5)",
        [
          cursor,
          this.ownerId,
          JSON.stringify({
            schema_version: 1,
            owner_id: this.ownerId,
            type: "app_effect.updated",
            entity_kind: "app_effect",
            entity_id: receipt.id,
            revision: receipt.revision,
            created_at: receipt.updated_at,
            data: receipt,
          }),
          receipt.organization_id ?? null,
          receipt.actor_id ?? null,
        ],
      );
      if (["succeeded", "failed"].includes(receipt.state))
        await client.query(
          "DELETE FROM app_account_holds WHERE owner_id=$1 AND account_id=$2 AND effect_id=$3",
          [this.ownerId, receipt.account_id, receipt.id],
        );
      await this.checkAuthority(client);
      await client.query("COMMIT");
      this.notify();
      return receipt;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async recoverAppEffects() {
    const rows = (
      await this.#administration.query(
        "SELECT body FROM entities WHERE owner_id=$1 AND kind='app_effect' AND body->>'state'='dispatched'",
        [this.ownerId],
      )
    ).rows;
    for (const row of rows) {
      const effect = schemas.app_effect.parse(row.body);
      await this.settleAppEffect(effect, {
        ...effect,
        state: "unknown",
        error_code: "APP_UNKNOWN",
      });
    }
  }
  async legacyScopeReady() {
    return !(
      await this.#administration.query(
        "SELECT 1 FROM entities WHERE organization_id IS NULL LIMIT 1",
      )
    ).rowCount;
  }
  /** Offline import only: sequence maintenance never broadens application-role privileges. */
  async assertEmptyImportTarget() {
    if (this.dataContext || !this.#transactions.getStore())
      throw new DomainError("SCOPE_DENIED", 403);
    const result = await this.#administration.query(
      "SELECT (SELECT count(*) FROM entities)+(SELECT count(*) FROM events)+(SELECT count(*) FROM commands)+(SELECT count(*) FROM legacy_scope_binding) AS count",
    );
    if (Number(result.rows[0].count) !== 0)
      throw new Error("Import requires an empty PostgreSQL target.");
  }
  async restoreLegacySequences() {
    if (this.dataContext || !this.#transactions.getStore())
      throw new DomainError("SCOPE_DENIED", 403);
    for (const [table, column] of [
      ["entities", "seq"],
      ["routing_traces", "seq"],
      ["conversation_parts", "sequence"],
    ] as const) {
      const maximum = (
        await this.query(`SELECT COALESCE(MAX(${column}),0)::text AS maximum FROM ${table}`)
      ).rows[0].maximum;
      await this.#administration.query(
        "SELECT setval(pg_get_serial_sequence($1,$2),GREATEST($3::bigint,1),$3::bigint>0)",
        [`${this.schema}.${table}`, column, maximum],
      );
    }
  }
  /** Caller must prove the guarded owner binding and current organization Owner role. */
  async bindLegacyScope(organizationId: string, userId: string, membershipGeneration: number) {
    if (this.dataContext || this.#transactions.getStore())
      throw new Error("Legacy binding requires the administrative boundary.");
    const client = await this.#administration.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT event_clock FROM installation WHERE id=1 FOR UPDATE");
      await this.assertAuthority();
      const previous = (
        await client.query("SELECT organization_id,user_id FROM legacy_scope_binding WHERE id=1")
      ).rows[0];
      if (previous) {
        if (previous.organization_id !== organizationId || previous.user_id !== userId)
          throw new DomainError("SCOPE_DENIED", 403);
      } else {
        if (
          (
            await client.query(
              "SELECT 1 FROM entities WHERE organization_id IS NULL AND kind='run' AND body->>'status' IN ('dispatching','running','cancel_requested','unknown') LIMIT 1",
            )
          ).rowCount
        )
          throw new DomainError("RECONCILIATION_REQUIRED");
        await client.query("ALTER TABLE entities DISABLE TRIGGER entity_scope_guard");
        await client.query(
          "UPDATE entities SET organization_id=$1::uuid,actor_id=$2::uuid,body=body || jsonb_build_object('organization_id',$1::text,'actor_id',$2::text) WHERE organization_id IS NULL",
          [organizationId, userId],
        );
        // Flush the additive execution-reference guard before changing trigger state.
        await client.query("SET CONSTRAINTS ALL IMMEDIATE");
        await client.query("ALTER TABLE entities ENABLE TRIGGER entity_scope_guard");
        await client.query("SET CONSTRAINTS ALL DEFERRED");
        await client.query(
          "UPDATE events SET organization_id=$1::uuid,actor_id=$2::uuid,body=jsonb_set(body,'{data}',(body->'data') || jsonb_build_object('organization_id',$1::text,'actor_id',$2::text)) WHERE organization_id IS NULL",
          [organizationId, userId],
        );
        for (const table of ["conversation_parts", "routing_traces"])
          await client.query(
            `UPDATE ${table} SET organization_id=$1,actor_id=$2 WHERE organization_id IS NULL`,
            [organizationId, userId],
          );
        for (const row of (
          await client.query(
            "SELECT scope,id,fingerprint,receipt FROM commands WHERE scope::jsonb->>1 IS NULL",
          )
        ).rows) {
          const previous = JSON.parse(row.scope);
          const mapped = canonical([
            this.ownerId,
            organizationId,
            userId,
            previous[3],
            previous[4],
          ]);
          const inserted = await client.query(
            "INSERT INTO commands(scope,id,fingerprint,receipt,membership_generation) VALUES($1,$2,$3,$4,$5) ON CONFLICT(scope,id) DO UPDATE SET scope=excluded.scope WHERE commands.fingerprint=excluded.fingerprint AND commands.receipt=excluded.receipt RETURNING scope",
            [mapped, row.id, row.fingerprint, JSON.stringify(row.receipt), membershipGeneration],
          );
          if (!inserted.rowCount) throw new DomainError("IDEMPOTENCY_CONFLICT");
        }
        await client.query("INSERT INTO legacy_scope_binding VALUES(1,$1,$2,now())", [
          organizationId,
          userId,
        ]);
      }
      await client.query("COMMIT");
      return { organization_id: organizationId, user_id: userId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  private async configureScope(client: PoolClient, validate?: () => Promise<unknown>) {
    const context = this.dataContext;
    await (validate ?? this.#transactions.getStore()?.validate ?? context?.validate)?.();
    await client.query("SET LOCAL ROLE ngertiin_runtime");
    await client.query(
      "SELECT set_config('ngertiin.mode',$1,true),set_config('ngertiin.organization_id',$2,true),set_config('ngertiin.actor_id',$3,true),set_config('ngertiin.agents',$4,true),set_config('ngertiin.managed',$5,true),set_config('ngertiin.publish',$6,true),set_config('ngertiin.manage',$7,true),set_config('ngertiin.membership_generation',$8,true),set_config('ngertiin.connections',$9,true),set_config('ngertiin.app_connections',$10,true)",
      [
        context ? "scoped" : "legacy",
        context?.organizationId ?? "",
        context?.userId ?? "",
        context?.readableAgents.join(",") ?? "",
        context?.managedAgents.join(",") ?? "",
        this.publishing ? "yes" : "no",
        context?.canManage ? "yes" : "no",
        String(context?.membershipGeneration ?? ""),
        context?.allowedConnections?.join(",") ?? "",
        context?.allowedAppConnections?.join(",") ?? "",
      ],
    );
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
          validate: parent.validate,
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
    const release = await this.dataContext?.acquire?.();
    let client: PoolClient;
    try {
      client = await this.#pool.connect();
    } catch (error) {
      await release?.();
      throw error;
    }
    const context: Transaction = {
      client,
      active: true,
      changed: false,
      tail: Promise.resolve(),
      validate: release?.validate,
    };
    try {
      await client.query("BEGIN");
      await this.configureScope(client, release?.validate);
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
      await release?.();
    }
  }
  subscribe(listener: () => unknown) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  private emitListeners() {
    // Subscribers own their scope. A committed command must not lend its actor,
    // transaction, publication privilege or browser-session authorizer to background work.
    this.#transactions.exit(() =>
      this.#data.exit(() =>
        this.#authorization.exit(() =>
          this.#publication.exit(() => {
            const failed = () => {
              if (!this.closed)
                console.error(JSON.stringify({ event: "persistence.subscription_failed" }));
            };
            for (const listener of this.#listeners) {
              try {
                void Promise.resolve(listener()).catch(failed);
              } catch {
                failed();
              }
            }
          }),
        ),
      ),
    );
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
      this.dataContext?.organizationId ?? value?.organization_id ?? null,
      this.dataContext?.userId ?? value?.actor_id ?? this.ownerId,
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
    if (this.dataContext) return this.commandScope(input);
    const scope = input as { organization_id?: string; actor_id?: string } | null;
    return scope?.organization_id || (scope?.actor_id && scope.actor_id !== this.ownerId)
      ? this.commandScope(input)
      : canonical([this.ownerId, null, this.ownerId, null, null]);
  }
  /** Immutable receipts never restore access to an agent whose audience was revoked. */
  private async authorizeReceipt(receipt: unknown) {
    if (!this.dataContext) return;
    const pending: unknown[] = [receipt];
    while (pending.length) {
      const value = pending.pop();
      if (!value || typeof value !== "object") continue;
      if (Array.isArray(value)) {
        pending.push(...value);
        continue;
      }
      const item = value as Record<string, unknown>;
      if (
        typeof item.kind === "string" &&
        typeof item.id === "string" &&
        Object.hasOwn(schemas, item.kind)
      ) {
        const current = await this.get(item.kind as Kind, item.id);
        if (current.actor_id === null && this.publishing) continue;
        if (current.kind === "thread")
          for (const agentId of current.member_agent_ids) await this.assertInvocation(agentId);
        else if ("agent_id" in current && typeof current.agent_id === "string")
          await this.assertInvocation(current.agent_id);
      }
      pending.push(...Object.values(item));
    }
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
        await this.authorizeReceipt(old.receipt);
        return JSON.parse(canonical(old.receipt)) as T;
      }
      const result = await fn();
      await this.query(
        "INSERT INTO commands(scope,id,fingerprint,receipt,membership_generation) VALUES($1,$2,$3,$4,$5)",
        [
          scope,
          commandId,
          fingerprint,
          JSON.stringify(result),
          this.dataContext?.membershipGeneration ?? null,
        ],
      );
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
      await this.authorizeReceipt(result);
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
        await this.query(
          "INSERT INTO commands(scope,id,fingerprint,receipt,membership_generation) VALUES($1,$2,$3,$4,$5)",
          [
            scope,
            commandId,
            fingerprint,
            JSON.stringify({
              ...pendingReceipt,
              effect_class: verifiedFile ? "verified_file" : "external",
            }),
            this.dataContext?.membershipGeneration ?? null,
          ],
        );
        return null;
      });
      if (previous) {
        await this.authorizeReceipt(previous.receipt);
        return previous.receipt;
      }
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
          this.dataContext?.organizationId ?? context?.organization_id ?? null,
          this.dataContext?.userId ?? context?.actor_id ?? this.ownerId,
          commandId,
        ],
      )
    ).rows;
    if (rows.length > 1) throw new DomainError("IDEMPOTENCY_CONFLICT");
    const row = rows[0];
    if (!row || row.receipt?.["@ngertiin/command"] === "pending") return null;
    await this.authorizeReceipt(row.receipt);
    return row.receipt;
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
    const scope = this.dataContext;
    if (scope && "agent_id" in entity && typeof entity.agent_id === "string" && !this.publishing)
      await this.assertInvocation(entity.agent_id);
    if (scope && entity.kind === "agent" && entity.ownership === "organization" && !this.publishing)
      throw new DomainError("SCOPE_DENIED", 403);
    const shared =
      scope &&
      this.publishing &&
      (entity.kind === "agent" ||
        entity.kind === "published_knowledge" ||
        entity.kind === "connection" ||
        entity.kind === "ai_selection" ||
        entity.kind === "app_connection" ||
        entity.kind === "skill" ||
        entity.kind === "skill_revision" ||
        entity.kind === "skill_assignment");
    const actor = shared ? null : (scope?.userId ?? null);
    const validated = schemas[entity.kind].parse(
      scope ? { ...entity, organization_id: scope.organizationId, actor_id: actor } : entity,
    );
    if (validated.owner_id !== this.ownerId) throw new DomainError("SCOPE_DENIED", 403);
    return this.transaction(async () => {
      const previous = expectedRevision === null ? null : await this.get(entity.kind, entity.id);
      if (expectedRevision === null)
        await this.query(
          "INSERT INTO entities(kind,id,owner_id,body,organization_id,actor_id) VALUES($1,$2,$3,$4,$5,$6)",
          [
            entity.kind,
            entity.id,
            this.ownerId,
            JSON.stringify(validated),
            scope?.organizationId ?? null,
            actor,
          ],
        );
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
      await this.query(
        "INSERT INTO events(cursor,owner_id,body,organization_id,actor_id) VALUES($1,$2,$3,$4,$5)",
        [cursor, this.ownerId, JSON.stringify(event), scope?.organizationId ?? null, actor],
      );
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
      await this.#administration.end();
      await this.#authority.end();
    })();
    return this.#closing;
  }
}
