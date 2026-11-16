import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApiResource } from "@/hooks/use-api-resource";
import { command, durableCommand } from "@/lib/api-client";
import { AccountField, useAccountAction } from "./account-forms";
import { ResourceState, WorkgroupChoices } from "./organization-controls";
import { useAccount } from "./session";
import type { Invitation, Member, Workgroup } from "./types";

export function MembersSettings() {
  const account = useAccount();
  const [tick, setTick] = useState(0);
  const [invite, setInvite] = useState(false);
  const [workgroups, setWorkgroups] = useState<string[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const action = useAccountAction();
  const path = `/v1/organizations/${account?.organization?.id}`;
  const members = useApiResource<{ members: Member[] }>(`${path}/members`, tick);
  const invitations = useApiResource<{ invitations: Invitation[] }>(`${path}/invitations`, tick);
  const groups = useApiResource<{ workgroups: Workgroup[] }>(`${path}/workgroups`, tick);
  if (!account?.access?.capabilities.invite_members) return null;
  const refresh = () => setTick((value) => value + 1);
  return (
    <div className="organization-settings">
      <section>
        <div className="organization-toolbar">
          <Button variant="outline" size="sm" onClick={() => setInvite(!invite)}>
            Invite member
          </Button>
        </div>
        {invite && (
          <form
            className="organization-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              const values = new FormData(event.currentTarget);
              void action.run(async () => {
                const result = await durableCommand<{ invitation: Invitation }>(
                  "invite-member",
                  `${path}/invitations`,
                  {
                    email: String(values.get("email")),
                    role: String(values.get("role") ?? "member"),
                    workgroup_ids: workgroups,
                  },
                );
                if (result.invitation.delivery === "failed") {
                  toast.warning(
                    "Invitation saved. Email delivery failed; use Resend to try again.",
                  );
                }
                setInvite(false);
                setWorkgroups([]);
                refresh();
              });
            }}
          >
            <AccountField label="Email">
              <Input name="email" type="email" required autoComplete="off" />
            </AccountField>
            {account.access.capabilities.elevate_members && (
              <AccountField label="Role">
                <select className="settings-select" name="role" defaultValue="member">
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </AccountField>
            )}
            {!!groups.data?.workgroups.length && (
              <fieldset>
                <legend className="mb-2 text-sm">Workgroups</legend>
                <WorkgroupChoices
                  groups={groups.data.workgroups}
                  selected={workgroups}
                  change={setWorkgroups}
                />
              </fieldset>
            )}
            <div className="account-actions">
              <Button disabled={action.busy || !!groups.error}>
                {action.busy ? "Inviting…" : "Send invitation"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setInvite(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
        <ResourceState error={members.error} retry={members.retry} loading={!members.data}>
          {members.data?.members.map((member) => (
            <div className="organization-settings-row" key={member.id}>
              <div className="organization-row-copy">
                <span className="text-sm">{member.name}</span>
                <p>{member.email}</p>
              </div>
              {account.access?.capabilities.elevate_members ? (
                <select
                  className="settings-select"
                  aria-label={`Role for ${member.name}`}
                  value={member.role}
                  disabled={
                    action.busy ||
                    (member.role === "owner" &&
                      members.data?.members.filter((item) => item.role === "owner").length === 1)
                  }
                  onChange={(event) => {
                    const role = event.target.value;
                    void action.run(async () => {
                      await command(`${path}/members/${member.id}/role`, { role });
                      refresh();
                      await account.refresh();
                    });
                  }}
                >
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                </select>
              ) : (
                <span className="account-muted capitalize">{member.role}</span>
              )}
              {member.role !== "owner" &&
                (account.access?.role === "owner" ||
                  member.role === "member" ||
                  member.user_id === account.session?.user.id) &&
                (removing === member.id ? (
                  <div className="account-actions">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(async () => {
                          await command(`${path}/members/${member.id}/remove`);
                          setRemoving(null);
                          refresh();
                          await account.refresh();
                        })
                      }
                    >
                      Confirm removal
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setRemoving(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={action.busy}
                    onClick={() => setRemoving(member.id)}
                  >
                    Remove
                  </Button>
                ))}
            </div>
          ))}
        </ResourceState>
      </section>
      <section>
        <h2>Invitations</h2>
        <ResourceState
          error={invitations.error}
          retry={invitations.retry}
          loading={!invitations.data}
        >
          {invitations.data?.invitations
            .filter((item) => item.status === "pending")
            .map((item) => (
              <div className="organization-settings-row" key={item.id}>
                <div className="organization-row-copy">
                  <span className="text-sm">{item.email}</span>
                  <p>
                    {item.role} ·{" "}
                    {Date.parse(item.expires_at) <= Date.now()
                      ? "Expired"
                      : item.delivery === "failed"
                        ? "Email failed"
                        : "Pending"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={
                    action.busy ||
                    item.delivery === "sent" ||
                    Date.parse(item.expires_at) <= Date.now()
                  }
                  onClick={() =>
                    void action.run(async () => {
                      await command(`${path}/invitations/${item.id}/send`);
                      refresh();
                    })
                  }
                >
                  Resend
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      await command(`${path}/invitations/${item.id}/cancel`);
                      refresh();
                    })
                  }
                >
                  Cancel
                </Button>
              </div>
            ))}
          {invitations.data &&
            !invitations.data.invitations.some((item) => item.status === "pending") && (
              <p className="account-muted">No pending invitations.</p>
            )}
        </ResourceState>
      </section>
    </div>
  );
}
