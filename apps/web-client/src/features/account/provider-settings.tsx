import { useCallback, useState } from "react";
import { SettingsError } from "@/features/settings/components/settings-ui";
import { useSettings } from "@/features/settings/hooks/use-settings";
import { useSettingsWorkspace } from "@/hooks/settings-workspace";
import { useApiResource } from "@/hooks/use-api-resource";
import { durableCommand } from "@/lib/api-client";
import type { HarnessId } from "@/lib/harnesses";
import { AIConnectionList } from "./ai-connection-list";
import { AudienceFields, type AudiencePolicy, ResourceState } from "./organization-controls";
import { useAccount } from "./session";
import type { Audience, Workgroup } from "./types";
import { useAIConnections } from "./use-ai-connections";
import { useOnboardingHarnesses } from "./use-onboarding-harnesses";

export function ScopedProviderSettings({ ownership }: { ownership: "personal" | "organization" }) {
  const account = useAccount();
  const workspace = useSettingsWorkspace();
  const { provider } = useSettings();
  const [selected, setSelected] = useState<HarnessId | null>(provider ?? null);
  const [audience, setAudience] = useState<AudiencePolicy>({ mode: "all_members" });
  const runtimes = useOnboardingHarnesses();
  const canConnect = ownership === "personal" || !!account.access?.capabilities.manage_organization;
  const groups = useApiResource<{ workgroups: Workgroup[] }>(
    ownership === "organization" && canConnect
      ? `/v1/organizations/${account.organization?.id}/workgroups`
      : null,
  );
  const prepareAudience = async () => {
    const saved = await durableCommand<{ audience: Audience }>(
      "provider-audience",
      `/v1/organizations/${account.organization?.id}/audiences`,
      audience,
    );
    return saved.audience.id;
  };
  const onChanged = useCallback(async () => {
    await workspace.refresh();
    await account.refresh();
  }, [workspace.refresh, account.refresh]);
  const providers = useAIConnections({ ownership, prepareAudience, onChanged });
  return (
    <div className="settings-ai-connections">
      <SettingsError
        message={providers.error || runtimes.error || groups.error}
        retry={() => {
          void providers.refresh();
          runtimes.refresh();
          groups.retry();
        }}
      />
      <AIConnectionList
        providers={providers}
        runtimes={runtimes}
        selected={selected}
        onSelect={setSelected}
        ownership={ownership}
        canConnect={canConnect}
        context="settings"
        disabled={ownership === "organization" && canConnect && (!groups.data || !!groups.error)}
        prepareAudience={ownership === "organization" ? prepareAudience : undefined}
        accessFields={
          ownership === "organization"
            ? (disabled) => (
                <ResourceState error={groups.error} loading={!groups.data} retry={groups.retry}>
                  <AudienceFields
                    groups={groups.data?.workgroups ?? []}
                    value={audience}
                    onChange={setAudience}
                    disabled={disabled}
                  />
                </ResourceState>
              )
            : undefined
        }
      />
    </div>
  );
}
