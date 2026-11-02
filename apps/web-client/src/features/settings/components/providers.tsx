import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProviderDefault } from "@/features/settings/components/provider-default";
import { ProviderDetail } from "@/features/settings/components/provider-detail";
import { SettingsSearch } from "@/features/settings/components/settings-search";
import {
  billingLabel,
  connectionLabel,
  type ProviderId,
  ProviderMark,
  providers,
  SettingsDisclosure,
  SettingsSection,
} from "@/features/settings/components/shared";
import { request } from "@/lib/api-client";
import type { Agent, Availability, Connection } from "@/types/workspace";

export function ProviderSettings({
  connections,
  agents,
  refresh,
  openAgent,
}: {
  connections: Connection[];
  agents: Agent[];
  refresh: () => Promise<unknown>;
  openAgent: (agent: Agent) => void;
}) {
  const { provider: selected } = useSearch({ from: "/workspace/settings" });
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [availability, setAvailability] = useState<Availability[] | null>(null);
  const [runtimeError, setRuntimeError] = useState("");
  const [checking, setChecking] = useState(true);
  const [more, setMore] = useState(false);
  // Keep an opened setup in its original group while account updates arrive.
  // Moving it between parents would abandon the key draft or active login UI.
  const [placements, setPlacements] = useState<Partial<Record<ProviderId, boolean>>>(() =>
    selected
      ? {
          [selected]: connections.some(
            (item) => item.harness === selected && item.state === "active",
          ),
        }
      : {},
  );
  const [visited, setVisited] = useState<ProviderId[]>(() => (selected ? [selected] : []));
  const checkRuntime = useCallback((signal?: AbortSignal) => {
    setChecking(true);
    setRuntimeError("");
    void request<Availability[]>("/v1/harnesses", undefined, undefined, signal)
      .then((result) => {
        if (!signal?.aborted) setAvailability(result);
      })
      .catch((error) => {
        if (!signal?.aborted) setRuntimeError(error.message);
      })
      .finally(() => {
        if (!signal?.aborted) setChecking(false);
      });
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    checkRuntime(abort.signal);
    return () => abort.abort();
  }, [checkRuntime]);
  const active = connections.filter((item) => item.state === "active");
  const filtered = providers.filter((provider) => {
    const accounts = connections.filter((item) => item.harness === provider.id);
    const text = [
      provider.name,
      provider.runtime,
      provider.description,
      ...accounts.flatMap((account) => [
        account.account_id ?? "",
        connectionLabel(account),
        billingLabel(account.authentication.billing_source),
      ]),
    ].join(" ");
    return text.toLowerCase().includes(query.toLowerCase().trim());
  });
  function featured(provider: ProviderId) {
    return (
      placements[provider] ??
      (active.some((item) => item.harness === provider) ||
        availability?.some((item) => item.harness === provider && item.state === "supported") ===
          true)
    );
  }
  const yours = filtered.filter((provider) => featured(provider.id));
  const other = filtered.filter((provider) => !featured(provider.id));
  const tobi = agents.find((agent) => agent.system_role === "tobi");
  const moreOpen =
    more || query.trim() !== "" || other.some((provider) => provider.id === selected);
  function rows(items: typeof filtered) {
    return items.map((provider) => {
      const accounts = active.filter((item) => item.harness === provider.id);
      const verified = accounts.filter((item) => connectionLabel(item) === "Terhubung").length;
      const runtime = availability?.find((item) => item.harness === provider.id);
      const open = selected === provider.id;
      return (
        <div key={provider.id} className="provider-entry">
          <div className="provider-list-row">
            <div className="provider-list-identity">
              <ProviderMark id={provider.id} />
              <div className="provider-list-copy">
                <h3>{provider.name}</h3>
                <p>
                  {accounts.length
                    ? verified
                      ? accounts
                          .map((account) => account.account_id)
                          .filter(Boolean)
                          .join(", ") || `${verified} akun terhubung`
                      : "Periksa login dan sumber biaya"
                    : runtime?.state === "missing"
                      ? "Belum terpasang"
                      : provider.description}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              aria-expanded={open}
              aria-controls={`provider-${provider.id}`}
              onClick={() => {
                setPlacements((current) => ({ ...current, [provider.id]: featured(provider.id) }));
                setVisited((current) =>
                  current.includes(provider.id) ? current : [...current, provider.id],
                );
                void navigate({
                  to: "/settings",
                  search: { section: "providers", provider: open ? undefined : provider.id },
                });
              }}
            >
              {open ? "Selesai" : verified ? "Kelola" : "Siapkan"}
            </Button>
          </div>
          <section
            id={`provider-${provider.id}`}
            className="provider-inline"
            aria-label={`Pengaturan ${provider.name}`}
            hidden={!open}
          >
            {(open || visited.includes(provider.id)) && (
              <ProviderDetail
                provider={provider.id}
                connections={connections.filter((connection) => connection.harness === provider.id)}
                agents={agents}
                runtime={runtime}
                runtimeError={runtimeError}
                refresh={refresh}
                openAgent={openAgent}
              />
            )}
          </section>
        </div>
      );
    });
  }
  return (
    <>
      <ProviderDefault agent={tobi} connections={connections} refresh={refresh} />
      <SettingsSection
        title="Provider kamu"
        action={
          <SettingsSearch
            label="Cari provider"
            placeholder="Cari provider"
            value={query}
            onChange={setQuery}
          />
        }
      >
        {yours.length ? (
          rows(yours)
        ) : (
          <div className="settings-provider-empty">
            {query ? "Tidak ada koneksi yang cocok." : "Belum ada provider yang siap digunakan."}
          </div>
        )}
      </SettingsSection>
      {other.length > 0 && (
        <SettingsDisclosure
          title={`Provider lainnya (${other.length})`}
          open={moreOpen}
          onToggle={() => {
            setMore(!moreOpen);
            if (moreOpen && other.some((provider) => provider.id === selected))
              void navigate({ to: "/settings", search: { section: "providers" } });
          }}
          trailing={
            <span className="provider-more-marks" aria-hidden="true">
              {other.map((provider) => (
                <ProviderMark key={provider.id} id={provider.id} />
              ))}
            </span>
          }
        >
          <div className="settings-group">{rows(other)}</div>
        </SettingsDisclosure>
      )}
      {!filtered.length && (
        <p className="settings-empty text-sm text-muted-foreground" role="status">
          Tidak ada provider yang cocok dengan “{query}”.
        </p>
      )}
      {checking && (
        <div aria-label="Memeriksa provider" role="status">
          <Skeleton className="h-4 w-48" />
        </div>
      )}
      {runtimeError && (
        <Alert
          variant="destructive"
          className="settings-alert [&>button]:mt-3 [&>button]:justify-self-start"
        >
          <AlertDescription>{runtimeError}</AlertDescription>
          <Button variant="outline" disabled={checking} onClick={() => checkRuntime()}>
            Periksa lagi
          </Button>
        </Alert>
      )}
    </>
  );
}
