import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SettingsError } from "@/features/settings/components/settings-ui";
import { useSettings } from "@/features/settings/hooks/use-settings";
import { useSettingsWorkspace } from "@/hooks/settings-workspace";
import { useApiResource } from "@/hooks/use-api-resource";
import { durableCommand } from "@/lib/api-client";
import { harnessModelCatalog, harnessModelKey } from "@/lib/harness-models";
import type { HarnessId } from "@/lib/harnesses";
import { useAccountAction } from "./account-forms";
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
        reviewFields={
          ownership === "personal"
            ? (harness, disabled) => (
                <ReviewModelSetting key={harness} harness={harness} disabled={disabled} />
              )
            : undefined
        }
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

function ReviewModelSetting({ harness, disabled }: { harness: HarnessId; disabled: boolean }) {
  const workspace = useSettingsWorkspace();
  const action = useAccountAction();
  const current = workspace.selections?.find(
    (row) => row.scope === "review" && row.harness === harness,
  )?.selection;
  const saved = current ? harnessModelKey(current.connection_id, current.model_id) : "";
  const [draft, setDraft] = useState<string | null>(null);
  const selected = draft ?? saved;
  const { providers, choices } = harnessModelCatalog(
    workspace.connections.filter(
      (connection) =>
        connection.actor_id !== null ||
        workspace.allowedOrganizationConnectionIds?.includes(connection.id),
    ),
    harness,
  );
  const models = providers.find((item) => item.id === harness)?.models ?? [];
  if (!models.length && !saved) return null;

  return (
    <form
      className="ai-auth-row"
      aria-label="Learning review model"
      onSubmit={(event) => {
        event.preventDefault();
        const choice = choices.get(selected);
        if (selected && !choice) return;
        void action.run(async () => {
          await durableCommand(`learning-review-model:${harness}`, "/v1/ai/selections", {
            scope: "review",
            harness,
            selection: choice
              ? {
                  connection_id: choice.connection.id,
                  model_id: choice.model.id,
                }
              : null,
          });
          await workspace.refresh();
          setDraft(null);
          toast.success("Learning review model saved.");
        });
      }}
    >
      <label className="onboarding-login-instructions min-w-0">
        <span className="onboarding-login-title">Learning review model</span>
        <select
          className="settings-select max-w-full"
          value={selected}
          onChange={(event) => setDraft(event.target.value)}
          disabled={disabled || action.busy}
        >
          <option value="">Use the conversation model and account</option>
          {saved && !choices.has(saved) && <option value={saved}>Saved model unavailable</option>}
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name} · {model.description}
            </option>
          ))}
        </select>
      </label>
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={disabled || action.busy || saved === selected}
      >
        Save
      </Button>
    </form>
  );
}
