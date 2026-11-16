import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettingsWorkspace } from "@/hooks/settings-workspace";
import { useApiResource } from "@/hooks/use-api-resource";
import { durableCommand } from "@/lib/api-client";
import type { Agent } from "@/types/workspace";
import { AccountField, useAccountAction } from "./account-forms";
import { AudiencePicker, ResourceState } from "./organization-controls";
import { useAccount } from "./session";
import type { Audience, Workgroup } from "./types";

export function TeamAgentsSettings() {
  const account = useAccount();
  const workspace = useSettingsWorkspace();
  const [editing, setEditing] = useState<Agent | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [harness, setHarness] = useState<"codex" | "muse">("codex");
  const action = useAccountAction();
  const path = `/v1/organizations/${account?.organization?.id}`;
  const groups = useApiResource<{ workgroups: Workgroup[] }>(`${path}/workgroups`);
  if (!account?.access?.capabilities.manage_organization) return null;
  const agents = workspace.agents.filter(
    (agent) => agent.organization_id && agent.actor_id === null,
  );
  return (
    <div className="organization-settings">
      <section>
        <div className="organization-toolbar">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCreating(!creating);
              setEditing(null);
            }}
          >
            Create Team agent
          </Button>
        </div>
        {creating && (
          <div className="organization-inline-form">
            <AccountField label="Name">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
              />
            </AccountField>
            <AccountField label="Provider">
              <select
                className="settings-select"
                value={harness}
                onChange={(event) => setHarness(event.target.value as typeof harness)}
              >
                <option value="codex">ChatGPT</option>
                <option value="muse">Muse Code</option>
              </select>
            </AccountField>
          </div>
        )}
        {(creating || editing) && (
          <ResourceState error={groups.error} retry={groups.retry} loading={!groups.data}>
            <AudiencePicker
              key={editing?.id ?? "new"}
              groups={groups.data?.workgroups ?? []}
              busy={action.busy || (creating && !name.trim())}
              choose={async (audience) => {
                await action.run(async () => {
                  const saved = await durableCommand<{ audience: Audience }>(
                    `team-audience:${editing?.id ?? "new"}`,
                    `${path}/audiences`,
                    audience,
                  );
                  if (editing)
                    await durableCommand(
                      `team-access:${editing.id}`,
                      `${path}/agent-access/${editing.id}`,
                      { audience_id: saved.audience.id },
                    );
                  else
                    await durableCommand("create-team-agent", "/v1/data/team-agents", {
                      name: name.trim(),
                      harness,
                      audience_id: saved.audience.id,
                    });
                  await account.refresh();
                  await workspace.refresh();
                  setCreating(false);
                  setEditing(null);
                  setName("");
                });
              }}
            />
          </ResourceState>
        )}
        {agents.map((agent) => (
          <div className="organization-settings-row" key={agent.id}>
            <div className="organization-row-copy">
              <span className="text-sm">{agent.name}</span>
              <p>{agent.harness === "codex" ? "ChatGPT" : "Muse Code"}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(editing?.id === agent.id ? null : agent);
                setCreating(false);
              }}
            >
              {editing?.id === agent.id ? "Cancel" : "Set access"}
            </Button>
          </div>
        ))}
        {!agents.length && !creating && (
          <p className="account-muted">Create an agent for everyone or selected workgroups.</p>
        )}
      </section>
    </div>
  );
}
