import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useApiResource } from "@/hooks/use-api-resource";
import { command } from "@/lib/api-client";

interface Registry {
  revision: number;
  plugins: {
    id: string;
    name: string;
    version: string;
    source: string;
    dependency: string;
    state: "inactive" | "active" | "dependency_missing" | "version_changed";
    enabled: boolean;
  }[];
}

export function OutputPlugins({
  threadId,
  cursor,
  query,
}: {
  threadId: string;
  cursor: number;
  query: string;
}) {
  const path = `/v1/threads/${threadId}/output-plugins`;
  const registry = useApiResource<Registry>(path, cursor);
  const [busy, setBusy] = useState(false);
  const plugins = registry.data?.plugins.filter((plugin) =>
    plugin.name.toLowerCase().includes(query),
  );

  async function change(id: string, enabled: boolean) {
    if (!registry.data || busy) return;
    setBusy(true);
    try {
      await command(path, { id, enabled, expected_revision: registry.data.revision });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the output plugin.");
    } finally {
      registry.retry();
      setBusy(false);
    }
  }

  if (registry.error)
    return (
      <Button variant="secondary" onClick={registry.retry}>
        Retry loading output plugins
      </Button>
    );
  if (!plugins?.length) return null;
  return (
    <section aria-label="Output plugins for this conversation" className="space-y-3">
      <h2 className="text-sm font-medium">Output plugins for this conversation</h2>
      {plugins.map((plugin) => (
        <article
          key={plugin.id}
          className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4"
        >
          <div className="space-y-1">
            <h3 className="text-sm font-medium">{plugin.name}</h3>
            <p className="text-xs text-muted-foreground">
              {plugin.source} · v{plugin.version}
            </p>
            <p className="text-xs">Final answer transformation</p>
            <p role="status" className="text-xs text-muted-foreground">
              {plugin.state === "dependency_missing"
                ? `Dependency unavailable. Connect ${plugin.dependency} to activate.`
                : plugin.state === "version_changed"
                  ? "Update available. Activate this version to use it."
                  : plugin.state === "active"
                    ? "Active for this conversation"
                    : "Inactive"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {plugin.state !== "active" && (
              <Button
                size="sm"
                disabled={busy || plugin.state === "dependency_missing"}
                onClick={() => void change(plugin.id, true)}
              >
                Activate {plugin.name}
              </Button>
            )}
            {plugin.enabled && (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void change(plugin.id, false)}
              >
                Disable {plugin.name}
              </Button>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
