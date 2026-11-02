import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ModelPicker } from "@/features/conversation/components/model-picker";
import {
  billingLabel,
  connectionLabel,
  providers,
  SettingsDisclosure,
  SettingsRow,
  SettingsSection,
} from "@/features/settings/components/shared";
import { observedStates } from "@/features/settings/utils/provider-state";
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
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [details, setDetails] = useState(false);
  const current = connections.find((connection) => connection.id === agent?.connection_id);
  const provider = providers.find((item) => item.id === current?.harness);
  const requestedBilling = billingLabel(agent?.billing_source ?? "unknown");
  return (
    <>
      <SettingsSection title="Tobi dan agent baru">
        <div className="settings-default-control">
          <ModelPicker
            contained
            agent={agent}
            connections={connections}
            refresh={refresh}
            report={setError}
            manageProviders={() => {
              void navigate({
                to: "/settings",
                search: { section: "providers", provider: current?.harness },
              });
            }}
            label={
              <span className="settings-default-copy">
                <span>Model default</span>
                <span>
                  {current
                    ? `${provider?.name} · ${requestedBilling}`
                    : "Pilih akun dan model untuk memulai."}
                </span>
              </span>
            }
          />
        </div>
      </SettingsSection>
      {current && (
        <SettingsDisclosure
          title="Akun & sumber biaya"
          subtitle={`${provider?.name} · ${requestedBilling}`}
          trailing={<span className="settings-default-status">{connectionLabel(current)}</span>}
          open={details}
          onToggle={() => setDetails(!details)}
        >
          <SettingsSection title="Pilihan default">
            <SettingsRow title="Akun">
              <span>{provider?.name}</span>
            </SettingsRow>
            <SettingsRow title="Biaya dipilih">
              <span>{requestedBilling}</span>
            </SettingsRow>
            <SettingsRow title="Biaya terverifikasi">
              <span>{billingLabel(current.effective_billing_source)}</span>
            </SettingsRow>
            <SettingsRow title="Metode autentikasi">
              <span>
                {current.authentication.method === "native_login" ? "Login akun" : "API key"}
              </span>
            </SettingsRow>
            <SettingsRow title="Reasoning">
              <span>{agent?.reasoning ?? "Default harness"}</span>
            </SettingsRow>
            <SettingsRow title="Login">
              <span>{observedStates[current.login] ?? current.login}</span>
            </SettingsRow>
            <SettingsRow title="Penemuan model">
              <span>{observedStates[current.discovery] ?? current.discovery}</span>
            </SettingsRow>
            <SettingsRow title="Inference">
              <span>{observedStates[current.inference] ?? current.inference}</span>
            </SettingsRow>
          </SettingsSection>
        </SettingsDisclosure>
      )}
      {error && (
        <Alert variant="destructive" className="settings-alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
