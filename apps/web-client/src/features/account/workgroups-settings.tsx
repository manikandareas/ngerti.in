import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApiResource } from "@/hooks/use-api-resource";
import { command, durableCommand } from "@/lib/api-client";
import { AccountField, useAccountAction } from "./account-forms";
import { ResourceState } from "./organization-controls";
import { useAccount } from "./session";
import type { Member, Workgroup } from "./types";

export function WorkgroupsSettings() {
  const account = useAccount();
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const action = useAccountAction();
  const path = `/v1/organizations/${account?.organization?.id}`;
  const groups = useApiResource<{ workgroups: Workgroup[] }>(`${path}/workgroups`, tick);
  const members = useApiResource<{ members: Member[] }>(`${path}/members`, tick);
  if (!account?.access?.capabilities.manage_workgroups) return null;
  const refresh = () => setTick((value) => value + 1);
  return (
    <div className="organization-settings">
      <section>
        <div className="organization-toolbar">
          <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
            New workgroup
          </Button>
        </div>
        {editing === "new" && (
          <form
            className="organization-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              const name = String(new FormData(event.currentTarget).get("name"));
              void action.run(async () => {
                await durableCommand("create-workgroup", `${path}/workgroups`, { name });
                setEditing(null);
                refresh();
              });
            }}
          >
            <AccountField label="Name">
              <Input name="name" required maxLength={120} autoFocus />
            </AccountField>
            <div className="account-actions">
              <Button disabled={action.busy}>Create workgroup</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
        <ResourceState
          error={groups.error || members.error}
          retry={() => {
            groups.retry();
            members.retry();
          }}
          loading={!groups.data || !members.data}
        >
          {groups.data?.workgroups.map((group) => (
            <div key={group.id}>
              <div className="organization-settings-row">
                <div className="organization-row-copy">
                  <span className="text-sm">{group.name}</span>
                  <p>{group.user_ids.length} members</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(editing === group.id ? null : group.id)}
                >
                  {editing === group.id ? "Done" : "Manage"}
                </Button>
              </div>
              {editing === group.id && (
                <div className="organization-inline-form">
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const name = String(new FormData(event.currentTarget).get("name"));
                      void action.run(async () => {
                        await command(`${path}/workgroups/${group.id}`, { name });
                        refresh();
                      });
                    }}
                  >
                    <Input
                      aria-label={`Name for ${group.name}`}
                      name="name"
                      defaultValue={group.name}
                      required
                      maxLength={120}
                    />
                    <Button variant="outline" disabled={action.busy}>
                      Rename
                    </Button>
                  </form>
                  <div className="organization-checks">
                    {members.data?.members.map((member) => (
                      <label key={member.id}>
                        <input
                          type="checkbox"
                          checked={group.user_ids.includes(member.user_id)}
                          disabled={action.busy}
                          onChange={(event) => {
                            const present = event.target.checked;
                            void action.run(async () => {
                              await command(`${path}/workgroups/${group.id}/members`, {
                                membership_id: member.id,
                                present,
                              });
                              refresh();
                              await account.refresh();
                            });
                          }}
                        />
                        {member.name}
                      </label>
                    ))}
                  </div>
                  {removing === group.id ? (
                    <div className="account-actions">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={action.busy}
                        onClick={() =>
                          void action.run(async () => {
                            await command(`${path}/workgroups/${group.id}/delete`);
                            setEditing(null);
                            setRemoving(null);
                            refresh();
                            await account.refresh();
                          })
                        }
                      >
                        Delete workgroup
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setRemoving(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="self-start text-destructive"
                      onClick={() => setRemoving(group.id)}
                    >
                      Delete workgroup
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
          {groups.data?.workgroups.length === 0 && (
            <p className="account-muted">Create a workgroup to give a team access to agents.</p>
          )}
        </ResourceState>
        {action.error && (
          <p role="alert" className="account-error">
            {action.error}
          </p>
        )}
      </section>
    </div>
  );
}
