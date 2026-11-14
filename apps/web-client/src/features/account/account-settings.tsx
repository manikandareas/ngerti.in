import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useApiResource } from "@/hooks/use-api-resource";
import { command } from "@/lib/api-client";
import { useAccountAction } from "./account-forms";
import { useAccount } from "./session";

interface Device {
  id: string;
  current: boolean;
  kind: string;
  updated_at: string;
  expires_at: string;
}
export function AccountSettings() {
  const account = useAccount();
  const [tick, setTick] = useState(0);
  const devices = useApiResource<{ sessions: Device[] }>("/v1/auth/sessions", tick);
  const action = useAccountAction();
  return (
    <div className="organization-settings">
      <section>
        <h2>{account?.session?.user.name}</h2>
        <p className="account-muted">{account?.session?.user.email}</p>
        <Button
          className="mt-4"
          variant="outline"
          disabled={action.busy}
          onClick={() => void action.run(() => account?.logout() ?? Promise.resolve())}
        >
          Sign out
        </Button>
      </section>
      <section>
        <h2>Devices</h2>
        {devices.data?.sessions.map((device) => (
          <div className="organization-settings-row" key={device.id}>
            <div className="organization-row-copy">
              <span className="text-sm">
                {device.current
                  ? "This device"
                  : device.kind === "native"
                    ? "Desktop app"
                    : "Web browser"}
              </span>
              <p>{new Date(device.updated_at).toLocaleDateString()}</p>
            </div>
            {!device.current && (
              <Button
                variant="ghost"
                size="sm"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await command(`/v1/auth/sessions/${device.id}/revoke`);
                    setTick((value) => value + 1);
                  })
                }
              >
                Sign out
              </Button>
            )}
          </div>
        ))}
        {devices.error && (
          <p role="alert" className="account-error">
            {devices.error}
            <Button variant="ghost" onClick={devices.retry}>
              Retry
            </Button>
          </p>
        )}
        {!devices.data && !devices.error && (
          <div role="status" aria-label="Loading devices" className="account-loading-row" />
        )}
      </section>
      {action.error && (
        <p role="alert" className="account-error">
          {action.error}
        </p>
      )}
    </div>
  );
}
