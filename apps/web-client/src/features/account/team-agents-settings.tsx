import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  matchesSearch,
  SettingsDialog,
  SettingsEmpty,
  SettingsError,
  SettingsSearch,
} from "@/features/settings/components/settings-ui";
import { ProviderMark } from "@/features/settings/components/shared";
import { useSettingsAction } from "@/features/settings/hooks/use-settings-action";
import { useSettingsWorkspace } from "@/hooks/settings-workspace";
import { durableCommand } from "@/lib/api-client";
import { type HarnessId, harnesses, harnessIds, isHarness } from "@/lib/harnesses";
import type { Agent } from "@/types/workspace";
import { AccountField } from "./account-forms";
import { AudiencePicker, audienceLabel, ResourceState } from "./organization-controls";
import { useAccount } from "./session";
import type { Audience } from "./types";
import { useOrganizationResources } from "./use-organization-resources";

export function TeamAgentsSettings() {
  const account = useAccount();
  const workspace = useSettingsWorkspace();
  const [tick, setTick] = useState(0);
  const resources = useOrganizationResources(tick);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Agent | "new" | null>(null);
  const [name, setName] = useState("");
  const [harness, setHarness] = useState<HarnessId>("codex");
  const action = useSettingsAction();
  const path = `/v1/organizations/${account.organization?.id}`;
  const groups = resources.groups.data?.workgroups ?? [];
  const agents = workspace.agents.filter(
    (agent) => agent.organization_id && agent.actor_id === null,
  );
  const audienceFor = (agent: Agent) =>
    resources.audiences.data?.audiences.find(
      (audience) =>
        audience.id ===
        resources.grants.data?.grants.find((grant) => grant.agent_id === agent.id)?.audience_id,
    );
  const initial = editing && editing !== "new" ? audienceFor(editing) : undefined;
  return (
    <div className="settings-admin-page">
      <p className="settings-muted">
        Agents owned by {account.organization?.name}. Each person keeps their own private
        conversations and memory.
      </p>
      <div className="settings-list-toolbar">
        <SettingsSearch value={query} onChange={setQuery} placeholder="Search shared agents…" />
        <Button
          className="settings-toolbar-primary"
          onClick={() => {
            action.clearError();
            setName("");
            setEditing("new");
          }}
        >
          <HugeiconsIcon icon={Add01Icon} size={16} />
          Create agent
        </Button>
      </div>
      <ResourceState error={resources.error} retry={resources.retry} loading={resources.loading}>
        <Table className="settings-table">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>AI runtime</TableHead>
              <TableHead>Available to</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents
              .filter((agent) => matchesSearch(query, agent.name, harnesses[agent.harness].name))
              .map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell>
                    <div className="settings-table-link">
                      <ProviderMark id={agent.harness} />
                      {agent.name}
                    </div>
                  </TableCell>
                  <TableCell>{harnesses[agent.harness].name}</TableCell>
                  <TableCell className="settings-access-cell">
                    {audienceLabel(audienceFor(agent), groups)}
                  </TableCell>
                  <TableCell className="settings-row-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!audienceFor(agent)}
                      onClick={() => {
                        action.clearError();
                        setEditing(agent);
                      }}
                    >
                      Manage access
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {!agents.filter((agent) => matchesSearch(query, agent.name, harnesses[agent.harness].name))
          .length && (
          <SettingsEmpty title={query ? "No matching agents" : "Give your team a shared agent"}>
            {query
              ? "Try another name."
              : "Create an agent and choose which workgroups can use it."}
          </SettingsEmpty>
        )}
      </ResourceState>
      <SettingsDialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !action.busy) setEditing(null);
        }}
        title={
          editing === "new" ? "Create a shared agent" : `Access to ${editing?.name ?? "agent"}`
        }
        description={
          editing === "new"
            ? "Choose a name, AI runtime, and who can use this agent."
            : "Review who can use this agent. Private conversations and personal memory stay private."
        }
      >
        {editing === "new" && (
          <div className="settings-form">
            <AccountField label="Name">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
                placeholder="e.g. Research assistant"
                disabled={action.busy}
              />
            </AccountField>
            <AccountField label="AI runtime">
              <select
                className="settings-select"
                value={harness}
                disabled={action.busy}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (isHarness(value)) setHarness(value);
                }}
              >
                {harnessIds.map((id) => (
                  <option key={id} value={id}>
                    {harnesses[id].name}
                  </option>
                ))}
              </select>
            </AccountField>
          </div>
        )}
        <SettingsError message={action.error} />
        {editing && (
          <ResourceState
            error={resources.error}
            retry={resources.retry}
            loading={resources.loading}
          >
            {(editing === "new" || initial) && (
              <AudiencePicker
                key={editing === "new" ? "new" : editing.id}
                initial={initial}
                groups={groups}
                busy={action.busy || (editing === "new" && !name.trim())}
                choose={async (audience) => {
                  await action.run(
                    async () => {
                      const saved = await durableCommand<{ audience: Audience }>(
                        `team-audience:${editing === "new" ? "new" : editing.id}`,
                        `${path}/audiences`,
                        audience,
                      );
                      if (editing === "new")
                        await durableCommand("create-team-agent", "/v1/data/team-agents", {
                          name: name.trim(),
                          harness,
                          audience_id: saved.audience.id,
                        });
                      else
                        await durableCommand(
                          `team-access:${editing.id}`,
                          `${path}/agent-access/${editing.id}`,
                          { audience_id: saved.audience.id },
                        );
                      setEditing(null);
                      setTick((value) => value + 1);
                      await workspace.refresh();
                      await account.refresh();
                    },
                    editing === "new" ? "Shared agent created." : "Agent access updated.",
                  );
                }}
              />
            )}
          </ResourceState>
        )}
      </SettingsDialog>
    </div>
  );
}
