import { Add01Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MemberIdentity,
  matchesSearch,
  RoleLabel,
  SettingsDialog,
  SettingsEmpty,
  SettingsError,
  SettingsSearch,
  SettingsTabs,
} from "@/features/settings/components/settings-ui";
import { useSettings } from "@/features/settings/hooks/use-settings";
import { useSettingsAction } from "@/features/settings/hooks/use-settings-action";
import { useApiResource } from "@/hooks/use-api-resource";
import { command } from "@/lib/api-client";
import { MemberInvitation } from "./member-invitation";
import { ResourceState } from "./organization-controls";
import { useAccount } from "./session";
import type { Invitation, Member, Workgroup } from "./types";

type Change = { member: Member; role: Member["role"] } | { member: Member; remove: true };
export function MembersSettings() {
  const account = useAccount();
  const navigate = useNavigate({ from: "/" });
  const { settingsTab } = useSettings();
  const tab = settingsTab === "invitations" ? "invitations" : "members";
  const [tick, setTick] = useState(0);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [group, setGroup] = useState("all");
  const [invite, setInvite] = useState(false);
  const [change, setChange] = useState<Change | null>(null);
  const action = useSettingsAction();
  const path = `/v1/organizations/${account.organization?.id}`;
  const members = useApiResource<{ members: Member[] }>(`${path}/members`, tick);
  const invitations = useApiResource<{ invitations: Invitation[] }>(`${path}/invitations`, tick);
  const groups = useApiResource<{ workgroups: Workgroup[] }>(`${path}/workgroups`, tick);
  const refresh = () => setTick((value) => value + 1);
  const pending = invitations.data?.invitations.filter((item) => item.status === "pending") ?? [];
  const filtered =
    members.data?.members.filter(
      (member) =>
        matchesSearch(query, member.name, member.email) &&
        (role === "all" || member.role === role) &&
        (group === "all" ||
          groups.data?.workgroups
            .find((item) => item.id === group)
            ?.user_ids.includes(member.user_id)),
    ) ?? [];
  const filteredInvites = pending.filter(
    (item) =>
      matchesSearch(query, item.email) &&
      (role === "all" || item.role === role) &&
      (group === "all" || item.workgroup_ids.includes(group)),
  );
  const switchTab = (value: string) =>
    void navigate({
      search: (previous) => ({
        ...previous,
        settingsTab: value === "invitations" ? "invitations" : "members",
      }),
      resetScroll: false,
    });
  const workgroups = groups.data?.workgroups ?? [];
  return (
    <div className="settings-admin-page">
      <SettingsTabs
        value={tab}
        onChange={switchTab}
        items={[
          { id: "members", label: "Members", count: members.data?.members.length },
          { id: "invitations", label: "Invitations", count: pending.length },
        ]}
      />
      <div className="settings-list-toolbar">
        <SettingsSearch value={query} onChange={setQuery} placeholder="Search by name or email…" />
        <select
          className="settings-select"
          aria-label="Filter by role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
        >
          <option value="all">All roles</option>
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="member">Member</option>
        </select>
        {workgroups.length > 0 && (
          <select
            className="settings-select"
            aria-label="Filter by workgroup"
            value={group}
            onChange={(event) => setGroup(event.target.value)}
          >
            <option value="all">All workgroups</option>
            {workgroups.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        )}
        <Button
          className="settings-toolbar-primary"
          disabled={!groups.data || !!groups.error}
          onClick={() => setInvite(true)}
        >
          <HugeiconsIcon icon={Add01Icon} size={16} />
          Invite member
        </Button>
      </div>
      <SettingsError message={action.error} />
      <ResourceState
        error={members.error || invitations.error || groups.error}
        loading={!members.data || !invitations.data || !groups.data}
        retry={() => {
          members.retry();
          invitations.retry();
          groups.retry();
        }}
      >
        <Table className="settings-table">
          <TableHeader>
            <TableRow>
              <TableHead>{tab === "members" ? "Name" : "Email"}</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Workgroups</TableHead>
              {tab === "invitations" && (
                <>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                </>
              )}
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tab === "members"
              ? filtered.map((member) => {
                  const soleOwner =
                    member.role === "owner" &&
                    members.data?.members.filter((item) => item.role === "owner").length === 1;
                  const canRemove =
                    !soleOwner &&
                    (member.user_id === account.session?.user.id ||
                      account.access?.role === "owner" ||
                      member.role === "member");
                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <MemberIdentity
                          name={member.name}
                          email={member.email}
                          you={member.user_id === account.session?.user.id}
                        />
                      </TableCell>
                      <TableCell>
                        <RoleLabel role={member.role} />
                      </TableCell>
                      <TableCell>
                        <div className="settings-tags">
                          {workgroups
                            .filter((item) => item.user_ids.includes(member.user_id))
                            .map((item) => (
                              <span className="settings-badge" key={item.id}>
                                {item.name}
                              </span>
                            ))}
                          {!workgroups.some((item) => item.user_ids.includes(member.user_id)) && (
                            <span className="settings-muted">None</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="settings-row-actions">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Actions for ${member.name}`}
                            >
                              <HugeiconsIcon icon={MoreHorizontalIcon} size={18} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>{member.name}</DropdownMenuLabel>
                            {soleOwner && (
                              <DropdownMenuLabel>Keep at least one Owner</DropdownMenuLabel>
                            )}
                            {account.access?.capabilities.elevate_members &&
                              !soleOwner &&
                              (["member", "admin", "owner"] as const)
                                .filter((value) => value !== member.role)
                                .map((value) => (
                                  <DropdownMenuItem
                                    key={value}
                                    onSelect={() => {
                                      action.clearError();
                                      setChange({ member, role: value });
                                    }}
                                  >
                                    Make {value.charAt(0).toUpperCase() + value.slice(1)}
                                  </DropdownMenuItem>
                                ))}
                            {canRemove && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() => {
                                    action.clearError();
                                    setChange({ member, remove: true });
                                  }}
                                >
                                  {member.user_id === account.session?.user.id
                                    ? "Leave organization"
                                    : "Remove member"}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              : filteredInvites.map((item) => {
                  const expired = Date.parse(item.expires_at) <= Date.now();
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{item.email}</TableCell>
                      <TableCell>
                        <RoleLabel role={item.role} />
                      </TableCell>
                      <TableCell>
                        <div className="settings-tags">
                          {item.workgroup_ids.map((id) => (
                            <span className="settings-badge" key={id}>
                              {workgroups.find((entry) => entry.id === id)?.name ??
                                "Unavailable workgroup"}
                            </span>
                          ))}
                          {!item.workgroup_ids.length && (
                            <span className="settings-muted">None</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className="settings-badge"
                          data-tone={expired || item.delivery === "failed" ? "warning" : undefined}
                        >
                          {expired
                            ? "Expired"
                            : item.delivery === "failed"
                              ? "Email failed"
                              : item.delivery === "pending"
                                ? "Email not sent"
                                : "Awaiting acceptance"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <time dateTime={item.expires_at}>
                          {new Date(item.expires_at).toLocaleDateString()}
                        </time>
                      </TableCell>
                      <TableCell className="settings-row-actions">
                        <div className="settings-inline-actions">
                          {!expired && item.delivery !== "sent" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={action.busy}
                              onClick={() =>
                                void action.run(async () => {
                                  await command(`${path}/invitations/${item.id}/send`);
                                  refresh();
                                }, "Delivery retried.")
                              }
                            >
                              Retry email
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={action.busy}
                            onClick={() =>
                              void action.run(async () => {
                                await command(`${path}/invitations/${item.id}/cancel`);
                                refresh();
                              }, "Invitation canceled.")
                            }
                          >
                            Cancel invitation
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
        {(tab === "members" ? !filtered.length : !filteredInvites.length) && (
          <SettingsEmpty
            title={
              query || role !== "all" || group !== "all" ? "No matches" : "No pending invitations"
            }
          >
            {query || role !== "all" || group !== "all"
              ? "Try another search or change your filters."
              : "Invite people to work with your organization's shared agents."}
          </SettingsEmpty>
        )}
      </ResourceState>
      {invite && (
        <MemberInvitation
          open={invite}
          onOpenChange={setInvite}
          groups={workgroups}
          onSent={() => {
            refresh();
            switchTab("invitations");
          }}
        />
      )}
      <SettingsDialog
        open={!!change}
        onOpenChange={(open) => {
          if (!open && !action.busy) setChange(null);
        }}
        title={
          change && "remove" in change
            ? `Remove ${change.member.name}?`
            : `Change role for ${change?.member.name ?? "member"}?`
        }
        description={
          change && "remove" in change
            ? "Organization access will be revoked and their private responsibilities in this organization will be paused. Their account and private history are retained."
            : `Their role will change from ${change?.member.role ?? ""} to ${change && "role" in change ? change.role : ""}. Administrative roles do not grant access to private conversations.`
        }
      >
        <SettingsError message={action.error} />
        <div className="settings-dialog-actions">
          <Button variant="outline" disabled={action.busy} onClick={() => setChange(null)}>
            Cancel
          </Button>
          <Button
            variant={change && "remove" in change ? "destructive" : "default"}
            disabled={action.busy}
            onClick={() => {
              if (!change) return;
              void action.run(async () => {
                if ("remove" in change) await command(`${path}/members/${change.member.id}/remove`);
                else
                  await command(`${path}/members/${change.member.id}/role`, { role: change.role });
                setChange(null);
                refresh();
                await account.refresh();
              }, "Membership updated.");
            }}
          >
            {action.busy
              ? "Saving…"
              : change && "remove" in change
                ? "Remove member"
                : "Change role"}
          </Button>
        </div>
      </SettingsDialog>
    </div>
  );
}
