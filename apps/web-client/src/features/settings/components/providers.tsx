import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProviderDetail } from "@/features/settings/components/provider-detail";
import {
  connectionLabel,
  type ProviderId,
  ProviderMark,
  providers,
  SettingsSection,
} from "@/features/settings/components/shared";
import { useSettings } from "@/features/settings/hooks/use-settings";
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
  const { provider: selected, open: openSettings } = useSettings();
  const [availability, setAvailability] = useState<Availability[] | null>(null);
  const [runtimeError, setRuntimeError] = useState("");
  const [checking, setChecking] = useState(true);
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

  return (
    <>
      <SettingsSection title="Koneksi provider">
        {providers.map((provider) => {
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
                          ? `${verified} akun terhubung`
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
                    // Keep visited forms mounted in the same parent so key drafts and
                    // active login state survive switching between providers.
                    setVisited((current) =>
                      current.includes(provider.id) ? current : [...current, provider.id],
                    );
                    void openSettings("providers", open ? undefined : provider.id);
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
                    connections={connections.filter((item) => item.harness === provider.id)}
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
        })}
      </SettingsSection>
      {checking && (
        <div aria-label="Memeriksa provider" role="status">
          <Skeleton className="h-4 w-48" />
        </div>
      )}
      {runtimeError && (
        <Alert variant="destructive" className="settings-alert">
          <AlertDescription>{runtimeError}</AlertDescription>
          <Button variant="outline" disabled={checking} onClick={() => checkRuntime()}>
            Periksa lagi
          </Button>
        </Alert>
      )}
    </>
  );
}
