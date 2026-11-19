import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useApiResource } from "@/hooks/use-api-resource";
import { command } from "@/lib/api-client";
import { SettingsRow, SettingsSection } from "./shared";

const path = "/v1/learning/external-memory";
type Status = {
  backend_id: string | null;
  revision: number;
  options: { id: string; label: string }[];
};

export function ExternalMemorySettings() {
  const { data, error, retry } = useApiResource<Status>(path);
  const [changed, setChanged] = useState<Status | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const status = changed && changed.revision >= (data?.revision ?? -1) ? changed : data;

  async function change(backendId: string | null) {
    if (!status || pending) return;
    setPending(true);
    setFailure("");
    try {
      setChanged(
        await command<Status>(path, {
          backend_id: backendId,
          expected_revision: status.revision,
        }),
      );
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not update the connection.");
    } finally {
      setPending(false);
      retry();
    }
  }

  const configuredConnection = status?.options.some(({ id }) => id === status.backend_id);
  return (
    <SettingsSection
      title="External memory"
      description="When you ask an agent to look up external memory, it sends the lookup phrase to your connected backend."
    >
      {status?.options.map(({ id, label }) => {
        const connected = id === status.backend_id;
        return (
          <SettingsRow
            title={label}
            description={connected ? "Connected" : "Disconnected"}
            key={id}
          >
            <Button
              variant={connected ? "outline" : "secondary"}
              disabled={pending}
              onClick={() => void change(connected ? null : id)}
            >
              {connected ? "Disconnect" : "Connect"}
            </Button>
          </SettingsRow>
        );
      })}
      {status?.backend_id && !configuredConnection && (
        <SettingsRow title="Connected backend unavailable">
          <Button variant="outline" disabled={pending} onClick={() => void change(null)}>
            Disconnect
          </Button>
        </SettingsRow>
      )}
      {status && !status.backend_id && !status.options.length && (
        <SettingsRow title="No external memory backend is configured" />
      )}
      {!status && !error && <SettingsRow title="Loading connection…" />}
      {(failure || error) && (
        <SettingsRow
          title="Connection error"
          description={<span role="alert">{failure || error}</span>}
        >
          <Button
            variant="outline"
            onClick={() => {
              setFailure("");
              retry();
            }}
          >
            Reload
          </Button>
        </SettingsRow>
      )}
    </SettingsSection>
  );
}
