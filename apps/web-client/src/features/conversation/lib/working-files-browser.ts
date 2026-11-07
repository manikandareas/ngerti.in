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

/** Session-only browser state survives the mobile sheet unmounting for Focus. */
export class WorkingFilesBrowser {
  readonly scope: string | null;
  constructor(scope: string | null = null) {
    this.scope = scope;
  }
  private state: State = { folders: {}, tree: emptyTree() };
  private listeners = new Set<() => void>();
  private pending = new Map<string, { abort: AbortController; promise: Promise<void> }>();
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
  setTree<K extends keyof FileTreeState>(key: K, setter: Setter<FileTreeState[K]>) {
    const value = typeof setter === "function" ? setter(this.state.tree[key]) : setter;
    if (value === this.state.tree[key]) return;
    this.update({ ...this.state, tree: { ...this.state.tree, [key]: value } });
    if (key === "expandedItems")
      for (const path of this.state.tree.expandedItems) void this.load(path);
  }
  private folder(path: string, folder: Folder) {
    this.update({ ...this.state, folders: { ...this.state.folders, [path]: folder } });
  }
  getNode = (id: string): FileTreeNode => {
    if (id === FILE_TREE_ROOT) return { name: "Shared machine", path: "", type: "directory" };
    if (id.startsWith(STATUS_PREFIX)) {
      const parent = id.slice(STATUS_PREFIX.length);
      const folder = this.getFolder(parent);
      const status =
        !folder || folder.loading
          ? "loading"
          : folder.error
            ? "error"
            : folder.next
              ? "more"
              : "empty";
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
  load(path: string, mode: "initial" | "more" | "refresh" = "initial"): Promise<void> {
    const pending = this.pending.get(path);
    if (pending) return pending.promise;
    const previous = this.getFolder(path);
    if ((mode === "initial" && previous) || (mode === "more" && !previous?.next))
      return Promise.resolve();
    const abort = new AbortController();
    this.folder(path, {
      entries: previous?.entries ?? [],
      next: previous?.next ?? null,
      pages: previous?.pages ?? 0,
      loading: true,
      error: false,
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
        this.folder(path, {
          entries: unique,
          next: after || null,
          pages,
          loading: false,
          error: false,
        });
        const statusId = `${STATUS_PREFIX}${path}`;
        if (this.state.tree.focusedItem === statusId && !after && unique.length) {
          this.setTree(
            "focusedItem",
            unique[Math.min(previous?.entries.length ?? 0, unique.length - 1)].path,
          );
        }
      } catch {
        if (!abort.signal.aborted)
          this.folder(path, {
            entries: previous?.entries ?? [],
            next: previous?.next ?? null,
            pages: previous?.pages ?? 0,
            loading: false,
            error: true,
          });
      } finally {
        if (this.pending.get(path)?.abort === abort) this.pending.delete(path);
      }
    })();
    this.pending.set(path, { abort, promise });
    return promise;
  }
  async refresh() {
    await this.load("", "refresh");
    await Promise.all(this.state.tree.expandedItems.map((path) => this.load(path, "refresh")));
    const reachable = (id: string): boolean => {
      if (id.startsWith(STATUS_PREFIX)) {
        const path = id.slice(STATUS_PREFIX.length);
        return (!path || reachable(path)) && this.getChildren(path || FILE_TREE_ROOT).includes(id);
      }
      const parts = id.split("/");
      return parts.every((_, index) => {
        const parent = parts.slice(0, index).join("/");
        const path = parts.slice(0, index + 1).join("/");
        return this.getFolder(parent)?.entries.some((entry) => entry.path === path) ?? false;
      });
    };
    const previous = this.state.tree;
    this.update({
      ...this.state,
      tree: {
        expandedItems: previous.expandedItems.filter(reachable),
        selectedItems: previous.selectedItems.filter(reachable),
        focusedItem:
          previous.focusedItem && reachable(previous.focusedItem) ? previous.focusedItem : null,
      },
    });
  }
  dispose() {
    for (const pending of this.pending.values()) pending.abort.abort();
    this.pending.clear();
    this.state = {
      ...this.state,
      folders: Object.fromEntries(
        Object.entries(this.state.folders)
          .filter(([, folder]) => folder.pages > 0)
          .map(([path, folder]) => [path, { ...folder, loading: false }]),
      ),
    };
  }
}
