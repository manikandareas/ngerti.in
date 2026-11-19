import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useApiResource } from "@/hooks/use-api-resource";
import { type CatalogEntry, plugins } from "../lib/catalog";
import type { CatalogApp } from "../lib/catalog-cache";
import { pluginCatalogResource } from "../lib/plugin-catalog-resource";

const curated = new Map(plugins.map((entry) => [entry.id, entry]));

/** Share an atomic catalog snapshot across Marketplace navigation and warm reopens. */
export function usePluginCatalog() {
  const snapshot = useSyncExternalStore(
    pluginCatalogResource.subscribe,
    pluginCatalogResource.getSnapshot,
  );
  useEffect(() => {
    pluginCatalogResource.ensure();
  }, []);
  const managed = useApiResource<{ items: CatalogApp[] }>("/v1/apps/managed-connectors");
  const entries = useMemo<CatalogEntry[]>(
    () =>
      [
        ...(managed.data?.items ?? []),
        ...snapshot.items.filter((app) => !app.slug.startsWith("mcp_")),
      ].map((app) => ({
        id: app.slug,
        name: app.name,
        description: app.description || `Connect ${app.name} to your workspace.`,
        about:
          app.description ||
          `Install ${app.name}, then choose the actions your agent can use in each conversation.`,
        category: app.categories?.[0]?.name ?? "Other apps",
        categories: app.categories ?? [],
        logo: app.logo,
        website: app.website ?? curated.get(app.slug)?.website,
        toolsCount: app.tools_count,
        triggersCount: app.triggers_count,
        noAuth: app.no_auth,
        prompts: curated.get(app.slug)?.prompts ?? [],
      })),
    [managed.data?.items, snapshot.items],
  );
  return {
    entries,
    busy: snapshot.busy,
    error: snapshot.error,
    metadataComplete: snapshot.metadataComplete,
    retry: () => {
      managed.retry();
      pluginCatalogResource.retry();
    },
  };
}
