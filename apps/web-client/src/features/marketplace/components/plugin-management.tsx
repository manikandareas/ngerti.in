import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiResource } from "@/hooks/use-api-resource";
import type { AppEffect } from "@/types/work";
import type { Snapshot } from "@/types/workspace";
import type { PluginManager } from "../hooks/use-plugin-manager";
import type { CatalogEntry } from "../lib/catalog";
import { PluginAccess } from "./plugin-access";

function connectionStatus(state: string): string {
  if (state === "active") return "Installed";
  if (state === "auth_required") return "Authorization required";
  return "Awaiting authorization";
}

function effectStatus(state: string): string {
  switch (state) {
    case "succeeded":
      return "Succeeded";
    case "unknown":
      return "Outcome unknown";
    case "failed":
      return "Failed";
    default:
      return "In progress";
  }
}

export function PluginManagement({
  entry,
  manager,
  snapshot,
}: {
  entry: CatalogEntry;
  manager: PluginManager;
  snapshot: Snapshot | null;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const accounts = manager.inventory.filter((connection) => connection.toolkit === entry.id);
  const effects = useApiResource<AppEffect[]>(
    snapshot ? "/v1/entities/app_effect" : null,
    snapshot?.cursor ?? 0,
  );
  const accountIds = new Set(
    (manager.connections.data ?? [])
      .filter((connection) => connection.toolkit === entry.id)
      .map((connection) => connection.id),
  );
  const recent = (effects.data ?? []).filter(
    (effect) =>
      accountIds.has(effect.connection_id) &&
      effect.thread_id === snapshot?.thread.id &&
      snapshot.thread.member_agent_ids.includes(effect.agent_id),
  );
  if (!accounts.length && (manager.connections.data || manager.connections.error)) return null;
  return (
    <section
      className="marketplace-detail-section"
      aria-labelledby="marketplace-management-heading"
    >
      <h2 id="marketplace-management-heading">Connected accounts</h2>
      {!manager.connections.data && !manager.connections.error && (
        <div
          className="marketplace-account-skeleton"
          role="status"
          aria-label="Loading connection status"
        >
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
      )}
      {accounts.map((connection, index) => (
        <section
          key={connection.id}
          aria-label={`Connection ${connection.toolkit} ${connection.id.slice(0, 8)}`}
          className="marketplace-plugin-account"
        >
          <div className="marketplace-plugin-account-row">
            <div>
              <h3>
                {entry.name}
                {accounts.length > 1 ? ` · Account ${index + 1}` : ""}
              </h3>
              <span
                className="marketplace-account-state"
                data-installed={connection.state === "active"}
              >
                {connectionStatus(connection.state)}
              </span>
            </div>
            <div className="marketplace-plugin-account-actions">
              {connection.state !== "active" && (
                <Button
                  variant="ghost"
                  disabled={manager.authorization.busy || Boolean(manager.connections.error)}
                  onClick={() => manager.check(connection, entry.name)}
                >
                  Check status
                </Button>
              )}
              {connection.state === "active" && (
                <Button
                  variant="secondary"
                  aria-expanded={editing === connection.id}
                  disabled={!snapshot || manager.busy || Boolean(manager.connections.error)}
                  onClick={() => setEditing(editing === connection.id ? null : connection.id)}
                >
                  Manage access
                </Button>
              )}
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={
                  manager.authorization.busy ||
                  manager.removing ||
                  Boolean(manager.connections.error)
                }
                onClick={() => void manager.uninstall(connection)}
              >
                Uninstall
              </Button>
            </div>
          </div>
          {editing === connection.id && snapshot && connection.state === "active" && (
            <PluginAccess
              key={`${connection.id}:${snapshot.thread.id}`}
              connection={connection}
              snapshot={snapshot}
              changed={manager.connections.retry}
            />
          )}
        </section>
      ))}
      {recent.length > 0 && (
        <section className="marketplace-access" aria-label="Plugin activity">
          <h3>Plugin activity</h3>
          {recent.map((effect) => (
            <details key={effect.id}>
              <summary>
                {effect.tool.toLowerCase().replaceAll("_", " ")} · {effectStatus(effect.state)}
              </summary>
              {effect.log_id && <p>Receipt: {effect.log_id}</p>}
              {effect.error_code && <p>{effect.error_code}</p>}
            </details>
          ))}
        </section>
      )}
    </section>
  );
}
