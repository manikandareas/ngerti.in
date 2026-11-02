import { Add01Icon, ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiKeyEntry } from "@/features/settings/components/api-key-entry";
import { ProviderAccount } from "@/features/settings/components/provider-account";
import {
  type ProviderId,
  providers,
  SettingsRow,
  SettingsSection,
} from "@/features/settings/components/shared";
import { useProviderAccounts } from "@/features/settings/hooks/use-provider-accounts";
import { mergeConnections, runtimeStates } from "@/features/settings/utils/provider-state";
import type { Agent, Availability, Connection } from "@/types/workspace";

export function ProviderDetail({
  provider,
  connections,
  agents,
  runtime,
  runtimeError,
  refresh,
  openAgent,
}: {
  provider: ProviderId;
  connections: Connection[];
  agents: Agent[];
  runtime?: Availability;
  runtimeError: string;
  refresh: () => Promise<unknown>;
  openAgent: (agent: Agent) => void;
}) {
  const definition = providers.find((item) => item.id === provider) ?? providers[0];
  const [addKey, setAddKey] = useState(false);
  const keyButton = useRef<HTMLButtonElement>(null);
  const account = useProviderAccounts(provider, refresh);
  // Props are authoritative on equal revisions; revoked entries participate before filtering.
  const merged = mergeConnections(account.fresh, connections).filter(
    (item) => item.state === "active",
  );
  const native = merged.filter((item) => item.authentication.method === "native_login");
  const keyed = merged.filter((item) => item.authentication.method === "api_key");
  const usedBy = agents.filter((agent) =>
    merged.some((connection) => connection.id === agent.connection_id),
  );
  const ready = runtime?.state === "supported";
  const supportsLogin = runtime?.manifest.authentication_methods?.includes("native_login") ?? false;
  const supportsKey = runtime?.manifest.authentication_methods?.includes("api_key") ?? false;
  function accounts(items: Connection[]) {
    return items.map((connection) => (
      <ProviderAccount
        key={connection.id}
        provider={provider}
        connection={connection}
        agents={agents}
        login={account.logins[connection.id]}
        busy={account.busy}
        ready={ready}
        supportsLogin={supportsLogin}
        actions={account.actions}
        reportNotice={account.setNotice}
      />
    ));
  }
  return (
    <>
      {account.error && (
        <Alert
          variant="destructive"
          className="settings-alert mt-4 [&>button]:mt-3 [&>button]:justify-self-start"
        >
          <AlertDescription>{account.error}</AlertDescription>
        </Alert>
      )}
      {account.notice && (
        <Alert
          variant="success"
          className="settings-alert mt-4 [&>button]:mt-3 [&>button]:justify-self-start"
          role="status"
        >
          <AlertDescription>{account.notice}</AlertDescription>
        </Alert>
      )}
      <SettingsSection
        title="Akun"
        action={
          <Button
            size="sm"
            variant="ghost"
            disabled={!!account.busy || !ready || !supportsLogin}
            onClick={() => void account.addAccount()}
          >
            {account.busy === "new" ? (
              <Spinner />
            ) : (
              <HugeiconsIcon icon={Add01Icon} size={14} aria-hidden="true" />
            )}
            {account.uncertainAccount ? "Periksa penambahan" : "Tambah akun"}
          </Button>
        }
      >
        {accounts(native)}
        {!native.length && (
          <SettingsRow
            title={`Login dengan ${provider === "codex" ? "ChatGPT" : "akun Muse"}`}
            description={
              provider === "codex"
                ? "Hubungkan subscription melalui login akun ChatGPT."
                : "Login tersedia melalui Muse. Akses subscription belum terverifikasi; kelayakan tetap mengikuti akunmu."
            }
          >
            <span className="text-caption text-muted-foreground">Belum terhubung</span>
          </SettingsRow>
        )}
      </SettingsSection>
      <SettingsSection title="API key">
        {accounts(keyed)}
        {addKey ? (
          <ApiKeyEntry
            provider={provider}
            saved={account.saved}
            close={() => {
              setAddKey(false);
              requestAnimationFrame(() => keyButton.current?.focus());
            }}
          />
        ) : (
          <SettingsRow
            title={`${provider === "codex" ? "OpenAI" : "Meta"} API key`}
            description={`Atau gunakan API key. Biaya API terpisah dari subscription ${definition.name}.`}
          >
            <Button
              ref={keyButton}
              variant="outline"
              disabled={!!account.busy || !supportsKey}
              onClick={() => setAddKey(true)}
            >
              <HugeiconsIcon icon={Add01Icon} size={14} aria-hidden="true" />
              Tambah key
            </Button>
          </SettingsRow>
        )}
      </SettingsSection>
      <SettingsSection title="Runtime">
        <SettingsRow
          title={definition.runtime}
          description="Diperiksa pada host backend yang menjalankan agent."
        >
          <Badge variant="outline">
            {runtime
              ? (runtimeStates[runtime.state] ?? runtime.state)
              : runtimeError
                ? "Gagal diperiksa"
                : "Memeriksa…"}
          </Badge>
        </SettingsRow>
        <SettingsRow
          title="Versi"
          description={
            runtime
              ? `Minimum ${runtime.manifest.minimum_version} · Teruji ${runtime.manifest.tested_native_version}`
              : "Menunggu informasi dari backend."
          }
        >
          <span className="font-mono text-caption">{runtime?.version ?? "Belum diketahui"}</span>
        </SettingsRow>
        {runtime?.state === "missing" && (
          <SettingsRow
            title="Runtime belum ditemukan"
            description={`Pasang ${definition.runtime} pada host backend, lalu buka kembali Providers untuk memeriksanya.`}
          />
        )}
        {runtime?.state === "too_old" && (
          <SettingsRow
            title="Perbarui runtime"
            description={`Gunakan ${definition.runtime} ${runtime.manifest.minimum_version} atau yang lebih baru pada host backend.`}
          />
        )}
      </SettingsSection>
      <SettingsSection title="Penggunaan">
        {usedBy.length ? (
          usedBy.map((agent) => (
            <SettingsRow
              key={agent.id}
              title={agent.name}
              description={agent.model_id ?? "Model belum dipilih"}
            >
              <Button variant="outline" onClick={() => openAgent(agent)}>
                Atur agent
                <HugeiconsIcon icon={ArrowRight02Icon} size={14} aria-hidden="true" />
              </Button>
            </SettingsRow>
          ))
        ) : (
          <SettingsRow
            title="Pilih provider di panel Agent"
            description="Buka percakapan, pilih nama agent, lalu atur koneksi dan model pada bagian Koneksi & model."
          />
        )}
      </SettingsSection>
    </>
  );
}
