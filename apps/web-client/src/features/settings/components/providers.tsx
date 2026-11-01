import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { ProviderDefault } from "@/features/settings/components/provider-default";
import { ProviderDetail } from "@/features/settings/components/provider-detail";
import { SettingsSearch } from "@/features/settings/components/settings-search";
import {
  billingLabel,
  connectionLabel,
  ProviderMark,
  providers,
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
  const connected = filtered.filter((provider) =>
    active.some((item) => item.harness === provider.id),
  );
  const other = filtered.filter((provider) => !active.some((item) => item.harness === provider.id));
  const tobi = agents.find((agent) => agent.system_role === "tobi");
  if (selected)
    return (
      <ProviderDetail
        key={selected}
        provider={selected}
        connections={connections.filter((connection) => connection.harness === selected)}
        agents={agents}
        runtime={availability?.find((item) => item.harness === selected)}
        runtimeError={runtimeError}
        back={() => void navigate({ to: "/settings", search: { section: "providers" } })}
        refresh={refresh}
        openAgent={openAgent}
      />
    );
  function rows(items: typeof filtered) {
    return items.map((provider) => {
      const accounts = active.filter((item) => item.harness === provider.id);
      const verified = accounts.filter((item) => connectionLabel(item) === "Terhubung").length;
      const runtime = availability?.find((item) => item.harness === provider.id);
      return (
        <li key={provider.id}>
          <Item
            asChild
            className="provider-list-row min-h-20 flex-nowrap gap-3 rounded-none border-0 p-4 hover:bg-accent"
          >
            <Link to="/settings" search={{ section: "providers", provider: provider.id }}>
              <ItemMedia className="provider-list-media self-center">
                <ProviderMark id={provider.id} />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="line-clamp-none break-words">{provider.name}</ItemTitle>
                <ItemDescription className="line-clamp-none break-words">
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
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                {accounts.length > 0 && !verified && (
                  <span className="provider-list-state hidden text-xs text-muted-foreground sm:inline">
                    Perlu diperiksa
                  </span>
                )}
                <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.5} />
              </ItemActions>
            </Link>
          </Item>
        </li>
      );
    });
  }
  return (
    <>
      <header className="settings-content-header mb-6 space-y-2 [&>h2]:text-xl [&>h2]:font-semibold [&>h2]:tracking-tight [&>p]:text-sm [&>p]:text-muted-foreground">
        <h2>Providers</h2>
      </header>
      <ProviderDefault agent={tobi} connections={connections} refresh={refresh} />
      <SettingsSection
        title="Terhubung"
        action={
          <SettingsSearch
            label="Cari provider"
            placeholder="Cari provider"
            value={query}
            onChange={setQuery}
          />
        }
      >
        {connected.length ? (
          rows(connected)
        ) : (
          <Item role="listitem" className="settings-row min-h-20 gap-4 rounded-none border-0 p-4">
            <ItemContent className="min-w-0">
              <ItemDescription className="line-clamp-none break-words">
                {query ? "Tidak ada koneksi yang cocok." : "Belum ada provider terhubung."}
              </ItemDescription>
            </ItemContent>
          </Item>
        )}
      </SettingsSection>
      {other.length > 0 && (
        <SettingsSection title="Provider lainnya">{rows(other)}</SettingsSection>
      )}
      {!filtered.length && (
        <p className="settings-empty py-4 text-sm text-muted-foreground" role="status">
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
          className="settings-alert mt-4 [&>button]:mt-3 [&>button]:justify-self-start"
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
