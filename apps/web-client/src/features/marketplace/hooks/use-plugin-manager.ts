import { useEffect, useMemo, useRef, useState } from "react";
import { useAppAuthorization } from "@/features/conversation/components/use-app-authorization";
import { useApiResource } from "@/hooks/use-api-resource";
import { command } from "@/lib/api-client";
import { scopedStorageKey } from "@/lib/client-scope";
import { isPageVisible, subscribePageVisibility } from "@/lib/page-visibility";
import type { AppConnection } from "@/types/work";
import type { CatalogEntry } from "../lib/catalog";
import { useMarketplaceToast } from "./use-marketplace-toast";

export function usePluginManager(cursor = 0) {
  const connections = useApiResource<AppConnection[]>("/v1/apps/connections", cursor);
  const retry = useRef(connections.retry);
  retry.current = connections.retry;
  useEffect(() => {
    const reconcile = () => {
      if (isPageVisible() && navigator.onLine) retry.current();
    };
    const interval = window.setInterval(reconcile, 30_000);
    window.addEventListener("focus", reconcile);
    window.addEventListener("online", reconcile);
    const unsubscribe = subscribePageVisibility(reconcile);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", reconcile);
      window.removeEventListener("online", reconcile);
      unsubscribe();
    };
  }, []);
  const authorization = useAppAuthorization(connections.retry);
  const ownershipKey = scopedStorageKey("ngertiin:marketplace:ownership");
  const [ownership, updateOwnership] = useState<"personal" | "organization">(() =>
    sessionStorage.getItem(ownershipKey) === "organization" ? "organization" : "personal",
  );
  const setOwnership = (value: "personal" | "organization") => {
    sessionStorage.setItem(ownershipKey, value);
    updateOwnership(value);
  };
  const [target, setTarget] = useState("");
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  const inventory = useMemo(
    () =>
      (connections.data ?? [])
        .map((connection) =>
          authorization.verified?.id === connection.id &&
          authorization.verified.revision > connection.revision
            ? authorization.verified
            : connection,
        )
        .filter((connection) => connection.state !== "revoked"),
    [connections.data, authorization.verified],
  );

  function install(entry: CatalogEntry, account?: AppConnection) {
    if (authorization.integrating || removing || !connections.data || connections.error) return;
    const current =
      account ??
      inventory.findLast(
        (connection) =>
          connection.toolkit === entry.id && (connection.ownership ?? "personal") === ownership,
      );
    if (current?.state === "active") return;
    setTarget(entry.id);
    setError("");
    setNotice("");
    if (authorization.link?.toolkit === entry.id) {
      void authorization.continueLink(entry.name);
      return;
    }
    // Reuse the pending account after reload/lost acknowledgement, never create a duplicate.
    void authorization.authorize(entry.id, entry.name, current?.id, ownership);
  }

  async function uninstall(connection: AppConnection) {
    if (inFlight.current || authorization.busy) return;
    inFlight.current = true;
    setRemoving(true);
    setTarget(connection.toolkit);
    setError("");
    setNotice("");
    if (authorization.link?.id === connection.id) authorization.reset();
    try {
      await command(`/v1/apps/connections/${connection.id}/revoke`);
      setNotice("Plugin uninstalled. Agent access to this account has been revoked.");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not uninstall the plugin. Try again.",
      );
    } finally {
      connections.retry();
      inFlight.current = false;
      setRemoving(false);
    }
  }

  function check(connection: AppConnection, name: string) {
    setTarget(connection.toolkit);
    setError("");
    setNotice("");
    void authorization.check(connection, name);
  }

  useMarketplaceToast(error || authorization.error);
  useMarketplaceToast(notice || authorization.notice, { tone: "success" });

  return {
    connections,
    ownership,
    setOwnership,
    authorization,
    inventory,
    removing,
    target,
    busy: authorization.integrating || removing,
    error,
    notice,
    install,
    uninstall,
    check,
  };
}

export type PluginManager = ReturnType<typeof usePluginManager>;
