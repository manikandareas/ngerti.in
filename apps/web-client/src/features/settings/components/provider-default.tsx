import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ItemGroup } from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  connectionLabel,
  ProviderMark,
  providers,
  SettingsRow,
} from "@/features/settings/components/shared";
import { command } from "@/lib/api-client";
import type { Agent, Connection } from "@/types/workspace";

export function ProviderDefault({
  agent,
  connections,
  refresh,
}: {
  agent?: Agent;
  connections: Connection[];
  refresh: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const current = connections.find((connection) => connection.id === agent?.connection_id);
  const available = connections.filter(
    (connection) => connection.state === "active" && connectionLabel(connection) === "Terhubung",
  );
  async function configure(changes: Record<string, unknown>) {
    if (!agent || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await command(`/v1/agents/${agent.id}/configuration`, {
        expected_revision: agent.revision,
        changes,
      });
      await refresh();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Default provider belum dapat disimpan.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <ItemGroup className="settings-group settings-default-group gap-0 overflow-hidden rounded-xl border bg-card text-card-foreground divide-y">
        <SettingsRow title="Default provider" description="Digunakan oleh Tobi dan agent baru.">
          {busy && <Spinner />}
          <Select
            value={agent?.connection_id ?? ""}
            disabled={!agent || busy || !available.length}
            onValueChange={(id) => {
              const selected = available.find((connection) => connection.id === id);
              if (!selected || selected.id === agent?.connection_id) return;
              const model = selected.models.find((item) => item.id === agent?.model_id);
              void configure({
                connection_id: selected.id,
                harness: selected.harness,
                billing_source: selected.authentication.billing_source,
                model_id: model?.id ?? null,
                reasoning: model?.reasoning.includes(agent?.reasoning ?? "")
                  ? agent?.reasoning
                  : null,
              });
            }}
          >
            <SelectTrigger
              aria-label="Default provider"
              className="settings-provider-select w-48 max-w-full"
            >
              <SelectValue placeholder="Hubungkan provider" />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              {current && !available.some((item) => item.id === current.id) && (
                <SelectItem value={current.id} disabled>
                  <ProviderMark id={current.harness} />
                  {providers.find((item) => item.id === current.harness)?.name} · Periksa akun
                </SelectItem>
              )}
              {providers.map((provider) => {
                const accounts = available.filter(
                  (connection) => connection.harness === provider.id,
                );
                return (
                  accounts.length > 0 && (
                    <SelectGroup key={provider.id}>
                      {accounts.length > 1 && <SelectLabel>{provider.name}</SelectLabel>}
                      {accounts.map((connection, index) => (
                        <SelectItem value={connection.id} key={connection.id}>
                          <ProviderMark id={provider.id} />
                          {accounts.length > 1
                            ? `${provider.name} · ${connection.account_id ?? `Akun ${index + 1}`}`
                            : provider.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )
                );
              })}
            </SelectContent>
          </Select>
        </SettingsRow>
        {current?.state === "active" && !agent?.model_id && (
          <SettingsRow title="Model default" description="Pilih model untuk Tobi dan agent baru.">
            <Select
              value=""
              disabled={busy || !current.models.length}
              onValueChange={(id) => void configure({ model_id: id, reasoning: null })}
            >
              <SelectTrigger
                aria-label="Model default"
                className="settings-provider-select w-48 max-w-full"
              >
                <SelectValue
                  placeholder={current.models.length ? "Pilih model" : "Periksa akun dahulu"}
                />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                {current.models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
        )}
      </ItemGroup>
      {error && (
        <Alert
          variant="destructive"
          className="settings-alert mt-4 [&>button]:mt-3 [&>button]:justify-self-start"
        >
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
