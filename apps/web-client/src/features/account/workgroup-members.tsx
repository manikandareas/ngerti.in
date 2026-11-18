import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MemberIdentity,
  matchesSearch,
  SettingsDialog,
  SettingsError,
  SettingsSearch,
} from "@/features/settings/components/settings-ui";
import { useSettingsAction } from "@/features/settings/hooks/use-settings-action";
import { durableCommand } from "@/lib/api-client";
import { useAccount } from "./session";
import type { Member, Workgroup } from "./types";

export function WorkgroupMembers({
  group,
  members,
  onClose,
  onSaved,
}: {
  group: Workgroup;
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const account = useAccount();
  const [selected, setSelected] = useState(group.user_ids);
  const [query, setQuery] = useState("");
  const committed = useRef(new Set(group.user_ids));
  const action = useSettingsAction();
  return (
    <SettingsDialog
      open
      title={`Members of ${group.name}`}
      description="Membership controls access to the agents and connections shared with this workgroup."
      onOpenChange={(open) => {
        if (!open && !action.busy) onClose();
      }}
    >
      <SettingsSearch value={query} onChange={setQuery} placeholder="Find organization members…" />
      <fieldset disabled={action.busy} className="settings-member-picker">
        {members
          .filter((member) => matchesSearch(query, member.name, member.email))
          .map((member) => (
            <label key={member.id}>
              <input
                type="checkbox"
                checked={selected.includes(member.user_id)}
                onChange={(event) =>
                  setSelected((previous) =>
                    event.target.checked
                      ? [...previous, member.user_id]
                      : previous.filter((id) => id !== member.user_id),
                  )
                }
              />
              <MemberIdentity name={member.name} email={member.email} />
            </label>
          ))}
      </fieldset>
      <p className="settings-muted">{selected.length} selected. Changes apply when you save.</p>
      <SettingsError message={action.error} />
      <div className="settings-dialog-actions">
        <Button variant="outline" disabled={action.busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              const failures: string[] = [];
              for (const member of members) {
                const present = selected.includes(member.user_id);
                if (present === committed.current.has(member.user_id)) continue;
                try {
                  await durableCommand(
                    `workgroup-member:${group.id}:${member.id}`,
                    `/v1/organizations/${account.organization?.id}/workgroups/${group.id}/members`,
                    { membership_id: member.id, present },
                  );
                  if (present) committed.current.add(member.user_id);
                  else committed.current.delete(member.user_id);
                } catch {
                  failures.push(member.name);
                }
              }
              onSaved();
              if (failures.length)
                throw new Error(
                  `Could not update ${failures.join(", ")}. Saved changes are kept. Try again to finish.`,
                );
              onClose();
              await account.refresh();
            }, "Workgroup members updated.")
          }
        >
          {action.busy ? "Saving…" : "Save members"}
        </Button>
      </div>
    </SettingsDialog>
  );
}
