import { QueryClient, queryOptions, useQuery } from "@tanstack/react-query";
import type { WorkspaceAccess } from "@/features/account/types";
import { mergeEntity } from "@/hooks/workspace-events";
import type { Connection } from "@/types/workspace";
import { request } from "./api-client";
import { assertScope, type ClientScope, onScopeChange } from "./client-scope";

export const workspaceQueries = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false },
  },
});

const catalogRevisions = new WeakMap<ClientScope, number>();

onScopeChange(() => workspaceQueries.clear());

function connectionQuery(scope: ClientScope) {
  return queryOptions({
    queryKey: [scope.key, scope.epoch, "provider-connections"],
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      let revision: number | undefined;
      let connections: Connection[];
      do {
        revision = catalogRevisions.get(scope);
        connections = await request<Connection[]>(
          "/v1/entities/connection",
          undefined,
          undefined,
          signal,
          undefined,
          scope,
        );
      } while (revision !== catalogRevisions.get(scope));
      return connections;
    },
  });
}

function accessQuery(scope: ClientScope) {
  return queryOptions({
    queryKey: [scope.key, scope.epoch, "workspace-access"],
    staleTime: 30_000,
    queryFn: ({ signal }) =>
      request<WorkspaceAccess>("/v1/data/access", undefined, undefined, signal, undefined, scope),
  });
}

export function useProviderConnections(scope: ClientScope) {
  return useQuery({ ...connectionQuery(scope), enabled: false });
}

export function useWorkspaceAccess(scope: ClientScope) {
  return useQuery({ ...accessQuery(scope), enabled: false });
}

export function readProviderConnections(scope: ClientScope) {
  assertScope(scope);
  return workspaceQueries.fetchQuery(connectionQuery(scope));
}

export function readWorkspaceAccess({
  scope,
  revalidate = false,
}: {
  scope: ClientScope;
  revalidate?: boolean;
}) {
  assertScope(scope);
  const options = accessQuery(scope);
  return workspaceQueries.fetchQuery(revalidate ? { ...options, staleTime: 0 } : options);
}

export function invalidateProviderConnections(scope: ClientScope) {
  assertScope(scope);
  catalogRevisions.set(scope, (catalogRevisions.get(scope) ?? 0) + 1);
  void workspaceQueries.invalidateQueries({
    queryKey: connectionQuery(scope).queryKey,
    refetchType: "none",
  });
}

export function recordProviderConnection({
  scope,
  connection,
}: {
  scope: ClientScope;
  connection: Connection;
}) {
  assertScope(scope);
  const { queryKey } = connectionQuery(scope);
  const current = workspaceQueries.getQueryData(queryKey);
  if (current) workspaceQueries.setQueryData(queryKey, mergeEntity(current, connection));
  invalidateProviderConnections(scope);
}
