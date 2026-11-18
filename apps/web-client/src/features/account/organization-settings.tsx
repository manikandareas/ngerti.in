import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RoleLabel,
  SettingsDialog,
  SettingsError,
} from "@/features/settings/components/settings-ui";
import { SettingsRow, SettingsSection } from "@/features/settings/components/shared";
import { useSettingsAction } from "@/features/settings/hooks/use-settings-action";
import { command, durableCommand } from "@/lib/api-client";
import { AccountField } from "./account-forms";
import { useAccount } from "./session";

export function OrganizationSettings() {
  const account = useAccount();
  const [editing, setEditing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const action = useSettingsAction();
  if (!account.organization || !account.access) return null;
  const organization = account.organization;
  return (
    <div className="settings-preferences">
      <SettingsSection title="Organization details">
        <SettingsRow title="Name" description={organization.name}>
          {account.access.capabilities.manage_organization && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                action.clearError();
                setEditing(true);
              }}
            >
              Rename
            </Button>
          )}
        </SettingsRow>
        <SettingsRow
          title="Your role"
          description="Organization roles control administration. Resource access is granted separately."
        >
          <RoleLabel role={account.access.role} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Your membership">
        <SettingsRow
          title="Private workspace"
          description="Your conversations, memory, and personal connections stay private, including from organization administrators."
        />
        {account.access.private_work_suspended && (
          <SettingsRow
            title="Responsibilities paused"
            description="Rejoining does not automatically resume your Goals and Routine."
          >
            <Button
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await command(`/v1/organizations/${organization.id}/private-work/resume`);
                  await account.refresh();
                }, "Your responsibilities resumed.")
              }
            >
              Resume my work
            </Button>
          </SettingsRow>
        )}
        {account.access.role !== "owner" && (
          <SettingsRow
            title="Leave organization"
            description="Your access is revoked and private responsibilities in this organization are paused."
          >
            <Button variant="outline" onClick={() => setLeaving(true)}>
              Leave organization
            </Button>
          </SettingsRow>
        )}
        <SettingsError message={action.error} />
      </SettingsSection>
      {account.list.created_count < account.list.creation_limit && (
        <SettingsSection title="Organizations">
          <SettingsRow
            title="Create another organization"
            description="Start a separate workspace with its own members, agents, and connections."
          >
            <Button variant="outline" asChild>
              <Link to="/onboarding" search={{ create: true }}>
                Create organization
              </Link>
            </Button>
          </SettingsRow>
        </SettingsSection>
      )}
      <SettingsDialog
        open={editing}
        onOpenChange={(open) => {
          if (!action.busy) setEditing(open);
        }}
        title="Rename organization"
        description="This name is shown to everyone in the organization."
      >
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            const name = String(new FormData(event.currentTarget).get("name")).trim();
            void action.run(async () => {
              await durableCommand("rename-organization", `/v1/organizations/${organization.id}`, {
                name,
                slug: organization.slug,
              });
              setEditing(false);
              await account.refresh();
            }, "Organization renamed.");
          }}
        >
          <AccountField label="Name">
            <Input
              name="name"
              defaultValue={organization.name}
              required
              maxLength={120}
              disabled={action.busy}
            />
          </AccountField>
          <SettingsError message={action.error} />
          <div className="settings-dialog-actions">
            <Button
              variant="outline"
              type="button"
              disabled={action.busy}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button disabled={action.busy}>{action.busy ? "Saving…" : "Save name"}</Button>
          </div>
        </form>
      </SettingsDialog>
      <SettingsDialog
        open={leaving}
        onOpenChange={(open) => {
          if (!action.busy) setLeaving(open);
        }}
        title={`Leave ${organization.name}?`}
        description="You will need a new invitation to rejoin. Your private history is retained and your responsibilities in this organization will be paused."
      >
        <SettingsError message={action.error} />
        <div className="settings-dialog-actions">
          <Button variant="outline" disabled={action.busy} onClick={() => setLeaving(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await command(
                  `/v1/organizations/${organization.id}/members/${account.access?.membership_id}/remove`,
                );
                await account.refresh();
              })
            }
          >
            {action.busy ? "Leaving…" : "Leave organization"}
          </Button>
        </div>
      </SettingsDialog>
    </div>
  );
}
