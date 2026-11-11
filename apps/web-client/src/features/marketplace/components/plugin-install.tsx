import { Download04Icon, Loading03Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import type { PluginManager } from "../hooks/use-plugin-manager";
import type { CatalogEntry } from "../lib/catalog";

export function PluginInstall({ entry, manager }: { entry: CatalogEntry; manager: PluginManager }) {
  const installed = manager.inventory.some(
    (connection) => connection.toolkit === entry.id && connection.state === "active",
  );
  const installing = !installed && manager.authorization.integrating && manager.target === entry.id;
  return (
    <Button
      className="marketplace-primary marketplace-install-action"
      aria-busy={installing}
      disabled={
        installed || manager.busy || !manager.connections.data || Boolean(manager.connections.error)
      }
      onClick={() => manager.install(entry)}
    >
      <HugeiconsIcon
        icon={installed ? Tick02Icon : installing ? Loading03Icon : Download04Icon}
        size={16}
        aria-hidden="true"
        className={installing ? "motion-safe:animate-spin" : undefined}
      />
      {installed ? "Installed" : installing ? "Installing…" : "Install plugin"}
    </Button>
  );
}

export function PluginFeedback({ manager, toolkit }: { manager: PluginManager; toolkit?: string }) {
  if (toolkit && manager.target !== toolkit) return null;
  const { link, polling, busy } = manager.authorization;
  if (!link) return null;
  return (
    <div className="marketplace-authorization" role="status">
      <span>
        {polling
          ? "Complete authorization in your browser."
          : "Continue authorization to finish installing."}
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => void manager.authorization.continueLink(polling?.name ?? "Plugin")}
      >
        Open browser
      </Button>
    </div>
  );
}
