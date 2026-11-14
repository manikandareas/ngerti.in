import { scopedStorageKey } from "@/lib/client-scope";
export type CatalogApp = {
  slug: string;
  name: string;
  logo?: string;
  description?: string;
  website?: string;
  categories?: { slug: string; name: string }[];
  tools_count?: number;
  triggers_count?: number;
  no_auth?: boolean;
};
export type CachedCatalog = {
  version: 1;
  savedAt: number;
  metadataComplete: boolean;
  items: CatalogApp[];
};
export const catalogFreshnessMs = 7 * 24 * 60 * 60 * 1000;
const retentionMs = 30 * 24 * 60 * 60 * 1000;
const databaseName = "ngertiin-marketplace";
const storeName = "catalog";
const cacheKey = () => scopedStorageKey("ngertiin:catalog:metadata-v1");

function https(value: unknown) {
  if (typeof value !== "string" || value.length > 8192) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Keep public catalog fields only. Provider connected flags and account data never enter the cache. */
export function catalogMetadata(value: unknown): CatalogApp | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.slug !== "string" ||
    !item.slug ||
    item.slug.length > 256 ||
    typeof item.name !== "string" ||
    !item.name ||
    item.name.length > 512
  )
    return null;
  return {
    slug: item.slug,
    name: item.name,
    logo: https(item.logo),
    website: https(item.website),
    description:
      typeof item.description === "string" ? item.description.slice(0, 20_000) : undefined,
    categories: Array.isArray(item.categories)
      ? item.categories
          .slice(0, 50)
          .flatMap((category) =>
            category && typeof category.slug === "string" && typeof category.name === "string"
              ? [{ slug: category.slug.slice(0, 256), name: category.name.slice(0, 512) }]
              : [],
          )
      : [],
    tools_count:
      typeof item.tools_count === "number" &&
      Number.isSafeInteger(item.tools_count) &&
      item.tools_count >= 0
        ? item.tools_count
        : undefined,
    triggers_count:
      typeof item.triggers_count === "number" &&
      Number.isSafeInteger(item.triggers_count) &&
      item.triggers_count >= 0
        ? item.triggers_count
        : undefined,
    no_auth: typeof item.no_auth === "boolean" ? item.no_auth : undefined,
  };
}

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const opening = indexedDB.open(databaseName, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore(storeName);
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = opening.onblocked = () => reject(new Error("Catalog cache unavailable"));
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore, set: (value: T) => void) => void,
) {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onerror = tx.onabort = () => reject(new Error("Catalog cache unavailable"));
      action(tx.objectStore(storeName), (next) => {
        value = next;
      });
    });
  } finally {
    db.close();
  }
}

export async function readCatalogCache(): Promise<CachedCatalog | null> {
  try {
    const value = await transaction<unknown>("readonly", (store, set) => {
      const read = store.get(cacheKey());
      read.onsuccess = () => set(read.result);
    });
    if (!value || typeof value !== "object") return null;
    const cached = value as Record<string, unknown>;
    const age = Date.now() - Number(cached.savedAt);
    if (
      cached.version !== 1 ||
      typeof cached.savedAt !== "number" ||
      !Number.isFinite(age) ||
      age < 0 ||
      age >= retentionMs ||
      typeof cached.metadataComplete !== "boolean" ||
      !Array.isArray(cached.items) ||
      !cached.items.length ||
      cached.items.length > 10_000
    )
      return null;
    const items = cached.items.map(catalogMetadata);
    if (items.some((item) => item === null)) return null;
    return {
      version: 1,
      savedAt: cached.savedAt,
      metadataComplete: cached.metadataComplete,
      items: items as CatalogApp[],
    };
  } catch {
    return null;
  }
}

export async function saveCatalogCache(
  items: CatalogApp[],
  metadataComplete: boolean,
  savedAt: number,
) {
  try {
    await transaction<void>("readwrite", (store, set) => {
      store.put(
        {
          version: 1,
          savedAt,
          metadataComplete,
          items: items.flatMap((item) => catalogMetadata(item) ?? []),
        } satisfies CachedCatalog,
        cacheKey(),
      );
      set(undefined);
    });
  } catch {
    /* Storage restrictions must never prevent browsing the catalog. */
  }
}
