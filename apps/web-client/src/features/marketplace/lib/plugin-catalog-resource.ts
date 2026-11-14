import { request } from "@/lib/api-client";
import { onScopeChange } from "@/lib/client-scope";
import {
  type CatalogApp,
  catalogFreshnessMs,
  catalogMetadata,
  readCatalogCache,
  saveCatalogCache,
} from "./catalog-cache";

type CatalogPage = { items: CatalogApp[]; cursor?: string; metadata_complete?: boolean };
type Snapshot = {
  items: CatalogApp[];
  busy: boolean;
  error: string;
  metadataComplete: boolean;
  completedAt: number;
};
const listeners = new Set<() => void>();
let snapshot: Snapshot = {
  items: [],
  busy: true,
  error: "",
  metadataComplete: true,
  completedAt: 0,
};
let staged = new Map<string, CatalogApp>();
let cursor: string | undefined;
let inFlight: Promise<void> | null = null;
let hydrated = false;
let generation = 0;

function publish(value: Snapshot) {
  snapshot = value;
  for (const listener of listeners) listener();
}

async function readCatalog(version: number) {
  publish({ ...snapshot, busy: true, error: "" });
  const visited = new Set<string>();
  let metadataComplete = snapshot.metadataComplete;
  let failure = "";
  try {
    do {
      if (visited.has(cursor ?? "") || visited.size >= 100)
        throw new Error("Catalog pagination did not advance.");
      visited.add(cursor ?? "");
      const page = await request<CatalogPage>(
        `/v1/apps/catalog${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        undefined,
        undefined,
        undefined,
        30_000,
      );
      if (version !== generation) return;
      for (const value of page.items) {
        const app = catalogMetadata(value);
        if (app) staged.set(app.slug, app);
      }
      if (page.metadata_complete === false) metadataComplete = false;
      cursor = page.cursor;
    } while (cursor);
  } catch {
    failure = "Could not load the complete catalog. Your loaded plugins are still available.";
  }
  if (version !== generation) return;
  const items = [...staged.values()];
  const completedAt = failure ? 0 : Date.now();
  const retainingCache = Boolean(failure && snapshot.completedAt);
  publish({
    items: retainingCache ? snapshot.items : items,
    busy: false,
    error: failure,
    metadataComplete: retainingCache ? snapshot.metadataComplete : metadataComplete,
    completedAt: failure ? snapshot.completedAt : completedAt,
  });
  if (!failure) await saveCatalogCache(items, metadataComplete, completedAt);
}

function load(force = false) {
  // Once requested, finish warming the public catalog even if its screen closes.
  // Connection/account status remains a separate uncached resource.
  if (inFlight) return;
  const version = generation;
  inFlight = (async () => {
    if (!hydrated) {
      hydrated = true;
      const cached = await readCatalogCache();
      if (version !== generation) return;
      if (cached)
        publish({
          items: cached.items,
          busy: false,
          error: "",
          metadataComplete: cached.metadataComplete,
          completedAt: cached.savedAt,
        });
    }
    const age = Date.now() - snapshot.completedAt;
    if (
      !force &&
      snapshot.completedAt &&
      age >= 0 &&
      age < catalogFreshnessMs &&
      snapshot.metadataComplete
    )
      return;
    if (!snapshot.error || !cursor || !staged.size) {
      staged = new Map();
      cursor = undefined;
      snapshot = { ...snapshot, metadataComplete: true };
    }
    await readCatalog(version);
  })().finally(() => {
    if (version === generation) inFlight = null;
  });
}

export const pluginCatalogResource = {
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  ensure() {
    load();
  },
  retry() {
    if (inFlight) return;
    if (!snapshot.metadataComplete) {
      staged = new Map();
      cursor = undefined;
      snapshot = { ...snapshot, metadataComplete: true };
    }
    load(true);
  },
};

onScopeChange(() => {
  generation++;
  staged = new Map();
  cursor = undefined;
  inFlight = null;
  hydrated = false;
  publish({ items: [], busy: true, error: "", metadataComplete: true, completedAt: 0 });
});
