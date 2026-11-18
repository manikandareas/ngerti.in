import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MemberIdentity, SettingsError } from "@/features/settings/components/settings-ui";
import { SettingsRow, SettingsSection } from "@/features/settings/components/shared";
import { useSettingsAction } from "@/features/settings/hooks/use-settings-action";
import { useApiResource } from "@/hooks/use-api-resource";
import { command } from "@/lib/api-client";
import { ResourceState } from "./organization-controls";
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
  const action = useSettingsAction();
  return (
    <div className="settings-preferences">
      <div className="settings-profile">
        <MemberIdentity
          name={account.session?.user.name ?? "Account"}
          email={account.session?.user.email}
        />
      </div>
      <SettingsSection title="Profile">
        <SettingsRow title="Name" description={account.session?.user.name} />
        <SettingsRow title="Email" description={account.session?.user.email}>
          <span className="settings-badge" data-tone="success">
            Verified
          </span>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Account access">
        <SettingsRow
          title="Sign out"
          description="Sign out on this device. Your agents keep working on the server."
        >
          <Button
            variant="outline"
            disabled={action.busy}
            onClick={() => void action.run(() => account.logout())}
          >
            Sign out
          </Button>
        </SettingsRow>
      </SettingsSection>
      <SettingsError message={action.error} />
    </div>
  );
}
export function SecuritySettings() {
  const [tick, setTick] = useState(0);
  const devices = useApiResource<{ sessions: Device[] }>("/v1/auth/sessions", tick);
  const action = useSettingsAction();
  return (
    <div className="settings-preferences">
      <SettingsError message={action.error} />
      <ResourceState error={devices.error} retry={devices.retry} loading={!devices.data}>
        <SettingsSection
          title="Active sessions"
          description="Devices signed in to your account. Sign out a device to revoke its session."
        >
          {devices.data?.sessions
            .toSorted(
              (a, b) =>
                Number(b.current) - Number(a.current) ||
                Date.parse(b.updated_at) - Date.parse(a.updated_at),
            )
            .map((device) => (
              <SettingsRow
                key={device.id}
                title={device.kind === "native" ? "Desktop app" : "Web browser"}
                description={`Last active ${new Date(device.updated_at).toLocaleString()}`}
              >
                {device.current ? (
                  <span className="settings-badge" data-tone="success">
                    This device
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        await command(`/v1/auth/sessions/${device.id}/revoke`);
                        setTick((value) => value + 1);
                      }, "Device signed out.")
                    }
                  >
                    Sign out
                  </Button>
                )}
              </SettingsRow>
            ))}
        </SettingsSection>
      </ResourceState>
    </div>
  );
}
