import type { WorkspaceEvent } from "@/lib/api-client";
import type { Projection } from "./workspace-events";

interface SyncOptions {
  refresh: (signal: AbortSignal, projections?: Set<Projection>) => Promise<number | undefined>;
  follow: (
    after: number,
    signal: AbortSignal,
    update: (cursor: number, event: WorkspaceEvent) => void,
  ) => Promise<void>;
  update: (event: WorkspaceEvent) => Set<Projection>;
  status: (online: boolean, error: string) => void;
  available?: () => boolean;
  visible?: () => boolean;
  batchMs?: number;
  retryMs?: number;
  reconcileMs?: number;
}
type Connection = {
  abort: AbortController;
  cursor: number;
  seen: number;
  initialized: boolean;
  dirty: Set<Projection> | null;
  refresh?: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
};

/** One cancellable owner for event replay, projection batches and authoritative reconciliation. */
export class WorkspaceSync {
  #connection: Connection | undefined;
  #retry: ReturnType<typeof setTimeout> | undefined;
  #reconcile: ReturnType<typeof setInterval> | undefined;
  #failures = 0;
  #closed = false;
  readonly options: SyncOptions;

  constructor(options: SyncOptions) {
    this.options = options;
  }

  start() {
    if (this.#closed || this.#reconcile !== undefined) return;
    this.#reconcile = setInterval(() => {
      if (this.options.visible?.() !== false) this.resume();
    }, this.options.reconcileMs ?? 30_000);
    this.reconnect();
  }

  reconnect() {
    if (this.#closed) return;
    this.retire();
    if (this.options.visible?.() === false) return;
    if (this.options.available?.() === false) {
      this.options.status(false, "Connection lost. Reconnecting…");
      return;
    }
    const connection: Connection = {
      abort: new AbortController(),
      cursor: 0,
      seen: 0,
      initialized: false,
      dirty: null,
    };
    this.#connection = connection;
    this.options.status(false, "");
    void this.follow(connection);
  }

  disconnect() {
    if (this.#closed) return;
    this.retire();
    this.options.status(false, "Connection lost. Reconnecting…");
  }

  pause() {
    if (!this.#closed) this.retire();
  }

  resume() {
    if (this.#closed || this.options.available?.() === false || this.options.visible?.() === false)
      return;
    const connection = this.#connection;
    if (!connection || connection.abort.signal.aborted) this.reconnect();
    else {
      connection.dirty = null;
      this.schedule(connection);
    }
  }

  private current(connection: Connection) {
    return !this.#closed && this.#connection === connection && !connection.abort.signal.aborted;
  }

  private async follow(connection: Connection) {
    await this.flush(connection);
    if (!this.current(connection)) return;
    this.options.status(true, "");
    try {
      while (this.current(connection)) {
        await this.options.follow(connection.cursor, connection.abort.signal, (cursor, event) => {
          if (!this.current(connection) || cursor <= connection.cursor) return;
          this.#failures = 0;
          connection.seen = Math.max(connection.seen, cursor);
          const projections = this.options.update(event);
          if (connection.dirty !== null)
            for (const projection of projections) connection.dirty.add(projection);
          this.schedule(connection);
        });
        this.#failures = 0;
      }
    } catch (error) {
      this.fail(connection, error);
    }
  }

  private schedule(connection: Connection, delay = this.options.batchMs ?? 40) {
    if (!this.current(connection) || connection.refresh || connection.timer !== undefined) return;
    connection.timer = setTimeout(() => {
      connection.timer = undefined;
      void this.flush(connection);
    }, delay);
  }

  private flush(connection: Connection): Promise<void> {
    if (!this.current(connection)) return Promise.resolve();
    if (connection.refresh) return connection.refresh;
    const projections = connection.dirty;
    const through = connection.seen;
    connection.dirty = new Set();
    connection.refresh = Promise.resolve()
      .then(() =>
        projections?.size === 0
          ? undefined
          : this.options.refresh(connection.abort.signal, projections ?? undefined),
      )
      .then((cursor) => {
        if (!this.current(connection)) return;
        // Only initial full snapshots skip replay. Later batches acknowledge events only
        // after their projections were read; newer events retain their own dirty batch.
        connection.cursor = connection.initialized
          ? Math.max(connection.cursor, through)
          : (cursor ?? 0);
        connection.initialized = true;
        connection.seen = Math.max(connection.seen, connection.cursor);
      })
      .catch((error) => this.fail(connection, error))
      .finally(() => {
        connection.refresh = undefined;
        if (
          this.current(connection) &&
          (connection.dirty === null ||
            connection.dirty.size ||
            connection.seen > connection.cursor)
        )
          this.schedule(connection, 0);
      });
    return connection.refresh;
  }

  private fail(connection: Connection, error: unknown) {
    if (!this.current(connection)) return;
    this.retire();
    this.options.status(
      false,
      error instanceof Error ? error.message : "Connection lost. Reconnecting…",
    );
    this.#retry = setTimeout(
      () => this.reconnect(),
      Math.min(15_000, (this.options.retryMs ?? 500) * 2 ** Math.min(this.#failures++, 5)),
    );
  }

  private retire() {
    clearTimeout(this.#retry);
    this.#retry = undefined;
    const connection = this.#connection;
    this.#connection = undefined;
    if (connection) {
      clearTimeout(connection.timer);
      connection.abort.abort(new Error("Previous connection retired"));
    }
  }

  close() {
    this.#closed = true;
    clearInterval(this.#reconcile);
    this.retire();
  }
}
