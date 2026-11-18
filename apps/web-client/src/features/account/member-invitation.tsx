import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsDialog, SettingsError } from "@/features/settings/components/settings-ui";
import { useSettingsAction } from "@/features/settings/hooks/use-settings-action";
import { durableCommand } from "@/lib/api-client";
import { AccountField } from "./account-forms";
import { WorkgroupChoices } from "./organization-controls";
import { useAccount } from "./session";
import type { Invitation, Workgroup } from "./types";

export function MemberInvitation({
  open,
  onOpenChange,
  groups,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: Workgroup[];
  onSent: () => void;
}) {
  const account = useAccount();
  const [selected, setSelected] = useState<string[]>([]);
  const action = useSettingsAction();
  return (
    <SettingsDialog
      title={`Invite to ${account.organization?.name}`}
      description="Choose their organization role and the workgroups they will join."
      open={open}
      onOpenChange={(next) => {
        if (!action.busy) onOpenChange(next);
      }}
    >
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          void action.run(async () => {
            const result = await durableCommand<{ invitation: Invitation }>(
              "invite-member",
              `/v1/organizations/${account.organization?.id}/invitations`,
              {
                email: String(values.get("email")).trim(),
                role: String(values.get("role") ?? "member"),
                workgroup_ids: selected,
              },
            );
            if (result.invitation.delivery === "failed")
              toast.warning("Invitation saved. Email delivery failed; retry from Invitations.");
            else toast.success("Invitation created.");
            setSelected([]);
            onSent();
            onOpenChange(false);
          });
        }}
      >
        <fieldset disabled={action.busy} className="settings-form">
          <AccountField label="Email">
            <Input
              name="email"
              type="email"
              placeholder="name@company.com"
              required
              autoComplete="off"
              maxLength={254}
            />
          </AccountField>
          <AccountField label="Organization role">
            <select className="settings-select" name="role" defaultValue="member">
              <option value="member">Member</option>
              {account.access?.capabilities.elevate_members && <option value="admin">Admin</option>}
            </select>
            <span className="settings-muted">
              Members can use shared resources. Admins can also manage the organization and
              workgroups.
            </span>
          </AccountField>
          {groups.length > 0 && (
            <fieldset>
              <legend className="settings-field-label">
                Workgroups <span className="settings-muted">optional</span>
              </legend>
              <WorkgroupChoices groups={groups} selected={selected} change={setSelected} />
            </fieldset>
          )}
        </fieldset>
        <SettingsError message={action.error} />
        <p className="settings-muted">
          The invitation expires after 48 hours and can only be accepted by this email address.
        </p>
        <div className="settings-dialog-actions">
          <Button
            type="button"
            variant="outline"
            disabled={action.busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button disabled={action.busy}>{action.busy ? "Sending…" : "Send invitation"}</Button>
        </div>
      </form>
    </SettingsDialog>
  );
}
