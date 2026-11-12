import { request } from "@/lib/api-client";
import type { MachineFiles } from "@/types/machine";

export const FILE_TREE_ROOT = "\0root";
const STATUS_PREFIX = "\0status:";
type FileEntry = MachineFiles["entries"][number];
type Folder = {
  entries: FileEntry[];
  next: string | null;
  pages: number;
  loading: boolean;
  error: boolean;
};
export type FileTreeState = {
  expandedItems: string[];
  selectedItems: string[];
  focusedItem: string | null;
};
type State = { folders: Record<string, Folder>; tree: FileTreeState };
export type FileTreeNode = FileEntry & {
  status?: "loading" | "error" | "more" | "empty";
  parent?: string;
};
type Setter<T> = T | ((previous: T) => T);
const emptyTree = (): FileTreeState => ({
  expandedItems: [],
  selectedItems: [],
  focusedItem: null,
});

const PREFETCH_CONCURRENCY = 2;
const PREFETCH_BATCH = 24;
const PREFETCH_CACHE_LIMIT = 128;
const FOLDER_STALE_MS = 5_000;

/** Session-only browser state survives the mobile sheet unmounting for Focus. */
export class WorkingFilesBrowser {
  readonly scope: string | null;
  constructor(scope: string | null = null) {
    this.scope = scope;
  }
  private state: State = { folders: {}, tree: emptyTree() };
  private listeners = new Set<() => void>();
  private pending = new Map<string, { abort: AbortController; promise: Promise<void> }>();
  private prefetchQueue: string[] = [];
  private prefetchInFlight = 0;
  private lastRead = new Map<string, number>();
  private syncInFlight: Promise<void> | undefined;
  private generation = 0;
  scrollTop = 0;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  private getFolder(path: string) {
    return Object.hasOwn(this.state.folders, path) ? this.state.folders[path] : undefined;
  }
  private update(state: State) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  private stale(path: string) {
    return Date.now() - (this.lastRead.get(path) ?? 0) >= FOLDER_STALE_MS;
  }
  setTree<K extends keyof FileTreeState>(key: K, setter: Setter<FileTreeState[K]>) {
    const previous = this.state.tree;
    const value = typeof setter === "function" ? setter(previous[key]) : setter;
    if (value === previous[key]) return;
    this.update({ ...this.state, tree: { ...previous, [key]: value } });
    if (key === "expandedItems") {
      for (const path of this.state.tree.expandedItems)
        if (!previous.expandedItems.includes(path))
          void this.load(
            path,
            this.getFolder(path)?.pages && this.stale(path) ? "refresh" : "initial",
          );
      this.prepareVisible();
    } else if (
      key === "focusedItem" &&
      typeof value === "string" &&
      this.getNode(value).type === "directory"
    ) {
      this.prefetch(value);
    }
  }
  private folder(path: string, folder: Folder) {
    const previous = this.getFolder(path);
    if (
      previous &&
      previous.next === folder.next &&
      previous.pages === folder.pages &&
      previous.loading === folder.loading &&
      previous.error === folder.error &&
      previous.entries.length === folder.entries.length &&
      previous.entries.every((entry, index) => {
        const next = folder.entries[index];
        return (
          entry.path === next.path &&
          entry.name === next.name &&
          entry.type === next.type &&
          entry.size_bytes === next.size_bytes
        );
      })
    )
      return;
    this.update({ ...this.state, folders: { ...this.state.folders, [path]: folder } });
  }
  getNode = (id: string): FileTreeNode => {
    if (id === FILE_TREE_ROOT) return { name: "Shared machine", path: "", type: "directory" };
    if (id.startsWith(STATUS_PREFIX)) {
      const parent = id.slice(STATUS_PREFIX.length);
      const folder = this.getFolder(parent);
      let status: NonNullable<FileTreeNode["status"]> = "empty";
      if (!folder || folder.loading) status = "loading";
      else if (folder.error) status = "error";
      else if (folder.next) status = "more";
      const name = {
        loading: "Loading files…",
        error: "Couldn't load this folder. Try again",
        more: "Load more files",
        empty: "This folder is empty",
      }[status];
      return { name, path: id, type: "status", status, parent };
    }
    const parent = id.split("/").slice(0, -1).join("/");
    return (
      this.getFolder(parent)?.entries.find((entry) => entry.path === id) ?? {
        path: id,
        name: id.split("/").at(-1) ?? id,
        type: "unsupported",
      }
    );
  };
  getChildren = (id: string): string[] => {
    const path = id === FILE_TREE_ROOT ? "" : id;
    const folder = this.getFolder(path);
    const children = folder?.entries.map((entry) => entry.path) ?? [];
    if (!folder || folder.loading || folder.error || folder.next || !children.length)
      children.push(`${STATUS_PREFIX}${path}`);
    return children;
  };
  prefetch(path: string, priority = true) {
    if (this.getFolder(path)?.pages || this.pending.has(path)) return;
    const queued = this.prefetchQueue.indexOf(path);
    if (queued >= 0) {
      if (!priority) return;
      this.prefetchQueue.splice(queued, 1);
    } else if (this.prefetchQueue.length >= PREFETCH_BATCH) {
      if (!priority) return;
      this.prefetchQueue.pop();
    }
    if (priority) this.prefetchQueue.unshift(path);
    else this.prefetchQueue.push(path);
    this.drain();
  }
  private prepareVisible() {
    if (Object.keys(this.state.folders).length >= PREFETCH_CACHE_LIMIT) return;
    let budget = Math.min(
      PREFETCH_BATCH,
      PREFETCH_CACHE_LIMIT - Object.keys(this.state.folders).length - this.prefetchQueue.length,
    );
    if (budget <= 0) return;
    for (const parent of ["", ...this.state.tree.expandedItems]) {
      for (const entry of this.getFolder(parent)?.entries ?? []) {
        if (
          entry.type !== "directory" ||
          this.getFolder(entry.path) ||
          this.prefetchQueue.includes(entry.path)
        )
          continue;
        this.prefetch(entry.path, false);
        if (--budget <= 0) return;
      }
    }
  }
  private drain() {
    while (this.prefetchInFlight < PREFETCH_CONCURRENCY && this.prefetchQueue.length) {
      const path = this.prefetchQueue.shift();
      if (path === undefined || this.getFolder(path)?.pages || this.pending.has(path)) continue;
      this.prefetchInFlight++;
      void this.read(path, "initial", true).finally(() => {
        this.prefetchInFlight--;
        this.drain();
      });
    }
  }
  async warm() {
    const generation = this.generation;
    await this.load("", this.getFolder("") && this.stale("") ? "refresh" : "initial");
    if (generation === this.generation) this.prepareVisible();
  }
  load(path: string, mode: "initial" | "more" | "refresh" = "initial"): Promise<void> {
    return this.read(path, mode, false);
  }
  private read(
    path: string,
    mode: "initial" | "more" | "refresh",
    speculative: boolean,
  ): Promise<void> {
    const pending = this.pending.get(path);
    if (pending) return pending.promise;
    const previous = this.getFolder(path);
    if ((mode === "initial" && previous && !previous.error) || (mode === "more" && !previous?.next))
      return Promise.resolve();
    const abort = new AbortController();
    this.folder(path, {
      entries: previous?.entries ?? [],
      next: previous?.next ?? null,
      pages: previous?.pages ?? 0,
      loading: !previous?.pages && !previous?.error,
      error: previous?.error ?? false,
    });
    const promise = (async () => {
      try {
        const entries = mode === "more" ? [...(previous?.entries ?? [])] : [];
        let after = mode === "more" ? (previous?.next ?? "") : "";
        let pages = mode === "more" ? (previous?.pages ?? 0) : 0;
        const pageCount = mode === "refresh" ? Math.max(previous?.pages ?? 1, 1) : 1;
        for (let index = 0; index < pageCount; index++) {
          const page = await request<MachineFiles>(
            `/v1/machine/files?${new URLSearchParams({ path, after, limit: "100" })}`,
            undefined,
            undefined,
            abort.signal,
          );
          entries.push(...page.entries);
          pages++;
          after = page.next_after ?? "";
          if (!after) break;
        }
        if (abort.signal.aborted) return;
        const unique = [...new Map(entries.map((entry) => [entry.path, entry])).values()];
        this.lastRead.set(path, Date.now());
        this.folder(path, {
          entries: unique,
          next: after || null,
          pages,
          loading: false,
          error: false,
        });
        const statusId = `${STATUS_PREFIX}${path}`;
        if (this.state.tree.focusedItem === statusId && !after && unique.length)
          this.setTree(
            "focusedItem",
            unique[Math.min(previous?.entries.length ?? 0, unique.length - 1)].path,
          );
        if (!speculative && mode === "initial") this.prepareVisible();
      } catch {
        if (!abort.signal.aborted)
          this.folder(path, {
            entries: previous?.entries ?? [],
            next: previous?.next ?? null,
            pages: previous?.pages ?? 0,
            loading: false,
            error: !previous?.pages,
          });
      } finally {
        if (this.pending.get(path)?.abort === abort) this.pending.delete(path);
      }
    })();
    this.pending.set(path, { abort, promise });
    return promise;
  }
  private reachable(id: string): boolean {
    if (id.startsWith(STATUS_PREFIX)) {
      const path = id.slice(STATUS_PREFIX.length);
      return (
        (!path || this.reachable(path)) && this.getChildren(path || FILE_TREE_ROOT).includes(id)
      );
    }
    if (!id) return true;
    const parts = id.split("/");
    return parts.every((_, index) => {
      const parent = parts.slice(0, index).join("/");
      const path = parts.slice(0, index + 1).join("/");
      return this.getFolder(parent)?.entries.some((entry) => entry.path === path) ?? false;
    });
  }
  private reconcile() {
    const previous = this.state.tree;
    const tree = {
      expandedItems: previous.expandedItems.filter((id) => this.reachable(id)),
      selectedItems: previous.selectedItems.filter((id) => this.reachable(id)),
      focusedItem:
        previous.focusedItem && this.reachable(previous.focusedItem) ? previous.focusedItem : null,
    };
    const folders = Object.fromEntries(
      Object.entries(this.state.folders).filter(([path]) => this.reachable(path)),
    );
    this.prefetchQueue = this.prefetchQueue.filter((path) => this.reachable(path));
    for (const path of this.lastRead.keys()) if (!this.reachable(path)) this.lastRead.delete(path);
    for (const [path, pending] of this.pending) if (!this.reachable(path)) pending.abort.abort();
    const changed =
      Object.keys(folders).length !== Object.keys(this.state.folders).length ||
      tree.expandedItems.length !== previous.expandedItems.length ||
      tree.selectedItems.length !== previous.selectedItems.length ||
      tree.focusedItem !== previous.focusedItem;
    if (changed) this.update({ ...this.state, folders, tree });
  }
  refresh(): Promise<void> {
    if (this.syncInFlight) return this.syncInFlight;
    const generation = this.generation;
    const work = (async () => {
      await this.load("", "refresh");
      if (generation !== this.generation) return;
      const expanded = this.state.tree.expandedItems.filter((path) => this.reachable(path));
      for (let index = 0; index < expanded.length; index += PREFETCH_CONCURRENCY) {
        await Promise.all(
          expanded
            .slice(index, index + PREFETCH_CONCURRENCY)
            .map((path) => this.load(path, "refresh")),
        );
        if (generation !== this.generation) return;
      }
      this.reconcile();
      this.prepareVisible();
    })();
    this.syncInFlight = work;
    void work.finally(() => {
      if (this.syncInFlight === work) this.syncInFlight = undefined;
    });
    return work;
  }
  pause() {
    this.generation++;
    this.prefetchQueue = [];
    for (const pending of this.pending.values()) pending.abort.abort();
    this.pending.clear();
    this.syncInFlight = undefined;
    const folders = Object.fromEntries(
      Object.entries(this.state.folders).filter(([, folder]) => folder.pages > 0),
    );
    if (Object.keys(folders).length !== Object.keys(this.state.folders).length)
      this.update({ ...this.state, folders });
  }
  dispose() {
    this.pause();
  }
}
