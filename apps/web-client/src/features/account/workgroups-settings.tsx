import { Add01Icon, ArrowRight01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useNavigate } from "@tanstack/react-router";
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
  MemberIdentity,
  matchesSearch,
  RoleLabel,
  SettingsBackButton,
  SettingsDialog,
  SettingsEmpty,
  SettingsError,
  SettingsSearch,
  SettingsTabs,
} from "@/features/settings/components/settings-ui";
import { SettingsRow, SettingsSection } from "@/features/settings/components/shared";
import { useSettings } from "@/features/settings/hooks/use-settings";
import { useSettingsAction } from "@/features/settings/hooks/use-settings-action";
import { useSettingsWorkspace } from "@/hooks/settings-workspace";
import { useApiResource } from "@/hooks/use-api-resource";
import { command, durableCommand } from "@/lib/api-client";
import { AccountField } from "./account-forms";
import { audienceLabel, ResourceState } from "./organization-controls";
import { useAccount } from "./session";
import type { Member, Workgroup } from "./types";
import { useOrganizationResources } from "./use-organization-resources";
import { WorkgroupMembers } from "./workgroup-members";

export function WorkgroupsSettings() {
  const account = useAccount();
  const workspace = useSettingsWorkspace();
  const navigate = useNavigate({ from: "/" });
  const { workgroup: selectedId, settingsTab } = useSettings();
  const [tick, setTick] = useState(0);
  const [query, setQuery] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [dialog, setDialog] = useState<"create" | "rename" | "delete" | "members" | null>(null);
  const action = useSettingsAction();
  const canManage = !!account.access?.capabilities.manage_workgroups;
  const path = `/v1/organizations/${account.organization?.id}`;
  const resources = useOrganizationResources(tick);
  const own = useApiResource<{ workgroups: Pick<Workgroup, "id" | "name">[] }>(
    canManage ? null : `${path}/my-workgroups`,
    tick,
  );
  const members = useApiResource<{ members: Member[] }>(canManage ? `${path}/members` : null, tick);
  const groups = canManage ? resources.groups.data?.workgroups : own.data?.workgroups;
  const selected = resources.groups.data?.workgroups.find((group) => group.id === selectedId);
  const refresh = () => setTick((value) => value + 1);
  const openGroup = (id?: string) =>
    void navigate({
      search: (previous) => ({ ...previous, workgroup: id, settingsTab: undefined }),
      resetScroll: false,
    });
  const tab = settingsTab === "members" || settingsTab === "access" ? settingsTab : "overview";
  const groupMembers =
    members.data?.members.filter((member) => selected?.user_ids.includes(member.user_id)) ?? [];
  const audiences = resources.audiences.data?.audiences ?? [];
  const grants = resources.grants.data?.grants ?? [];
  const includesGroup = (audienceId: string | null | undefined) => {
    const audience = audiences.find((item) => item.id === audienceId);
    return (
      audience?.mode === "all_members" ||
      !!(selected && audience?.workgroup_ids.includes(selected.id))
    );
  };
  const agents = workspace.agents.filter((agent) =>
    grants.some((grant) => grant.agent_id === agent.id && includesGroup(grant.audience_id)),
  );
  const connections = workspace.connections.filter(
    (connection) =>
      connection.ownership === "organization" &&
      connection.state === "active" &&
      includesGroup(connection.audience_id),
  );
  return (
    <div className="settings-admin-page">
      <ResourceState
        error={canManage ? resources.error || members.error : own.error}
        retry={() => {
          resources.retry();
          members.retry();
          own.retry();
        }}
        loading={canManage ? resources.loading || !members.data : !own.data}
      >
        {selectedId && canManage ? (
          selected ? (
            <>
              <div className="settings-detail-heading">
                <SettingsBackButton label="Back to workgroups" onClick={() => openGroup()} />
                <span className="settings-workgroup-icon">
                  <HugeiconsIcon icon={UserGroupIcon} size={23} />
                </span>
                <div>
                  <h2>{selected.name}</h2>
                  <p>
                    {selected.user_ids.length}{" "}
                    {selected.user_ids.length === 1 ? "member" : "members"}
                  </p>
                </div>
              </div>
              <SettingsTabs
                value={tab}
                onChange={(value) =>
                  void navigate({
                    search: (previous) => ({
                      ...previous,
                      settingsTab: value,
                    }),
                    resetScroll: false,
                  })
                }
                items={[
                  { id: "overview", label: "Overview" },
                  { id: "members", label: "Members", count: selected.user_ids.length },
                  { id: "access", label: "Access", count: agents.length + connections.length },
                ]}
              />
              {tab === "overview" && (
                <div className="settings-detail-form">
                  <SettingsSection title="General">
                    <SettingsRow title="Name" description={selected.name}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          action.clearError();
                          setDialog("rename");
                        }}
                      >
                        Rename
                      </Button>
                    </SettingsRow>
                    <SettingsRow
                      title="Members"
                      description={`${selected.user_ids.length} ${selected.user_ids.length === 1 ? "person belongs" : "people belong"} to this workgroup.`}
                    >
                      <Button variant="ghost" size="sm" onClick={() => setDialog("members")}>
                        Manage members
                        <HugeiconsIcon icon={ArrowRight01Icon} size={15} />
                      </Button>
                    </SettingsRow>
                  </SettingsSection>
                  <SettingsSection title="Shared access">
                    <SettingsRow
                      title="Agents & AI connections"
                      description={`${agents.length} shared agents and ${connections.length} organization connections are available to members.`}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          void navigate({
                            search: (previous) => ({ ...previous, settingsTab: "access" }),
                            resetScroll: false,
                          })
                        }
                      >
                        View access
                        <HugeiconsIcon icon={ArrowRight01Icon} size={15} />
                      </Button>
                    </SettingsRow>
                  </SettingsSection>
                  <SettingsSection title="Delete workgroup">
                    <SettingsRow
                      title={`Delete ${selected.name}`}
                      description="Removes this workgroup and its access grants. Members remain in the organization."
                    >
                      <Button
                        variant="outline"
                        className="text-destructive"
                        size="sm"
                        onClick={() => {
                          action.clearError();
                          setDialog("delete");
                        }}
                      >
                        Delete workgroup
                      </Button>
                    </SettingsRow>
                  </SettingsSection>
                </div>
              )}
              {tab === "members" && (
                <>
                  <div className="settings-list-toolbar">
                    <SettingsSearch
                      value={memberQuery}
                      onChange={setMemberQuery}
                      placeholder="Search workgroup members…"
                    />
                    <Button
                      className="settings-toolbar-primary"
                      onClick={() => setDialog("members")}
                    >
                      Manage members
                    </Button>
                  </div>
                  <Table className="settings-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Organization role</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupMembers
                        .filter((member) => matchesSearch(memberQuery, member.name, member.email))
                        .map((member) => (
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
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                  {!groupMembers.length && (
                    <SettingsEmpty
                      title="No members yet"
                      action={
                        <Button variant="outline" onClick={() => setDialog("members")}>
                          Add members
                        </Button>
                      }
                    >
                      Choose people from your organization to join this workgroup.
                    </SettingsEmpty>
                  )}
                </>
              )}
              {tab === "access" && (
                <div className="settings-detail-form">
                  <p className="settings-muted">
                    Resources shared with this workgroup or with all organization members. Private
                    conversations and personal connections stay private.
                  </p>
                  <SettingsSection title="Shared agents">
                    {agents.map((agent) => (
                      <SettingsRow
                        key={agent.id}
                        title={agent.name}
                        description={audienceLabel(
                          audiences.find(
                            (audience) =>
                              audience.id ===
                              grants.find((grant) => grant.agent_id === agent.id)?.audience_id,
                          ),
                          resources.groups.data?.workgroups ?? [],
                        )}
                      >
                        <Button variant="ghost" size="sm" asChild>
                          <Link
                            from="/"
                            search={(previous) => ({
                              ...previous,
                              settings: "team-agents",
                              workgroup: undefined,
                              settingsTab: undefined,
                            })}
                          >
                            Manage access
                          </Link>
                        </Button>
                      </SettingsRow>
                    ))}
                    {!agents.length && (
                      <SettingsRow
                        title="No shared agents"
                        description="Grant this workgroup access from Shared agents."
                      />
                    )}
                  </SettingsSection>
                  <SettingsSection title="AI connections">
                    {connections.map((connection) => (
                      <SettingsRow
                        key={connection.id}
                        title={connection.harness}
                        description={audienceLabel(
                          audiences.find((audience) => audience.id === connection.audience_id),
                          resources.groups.data?.workgroups ?? [],
                        )}
                      />
                    ))}
                    {!connections.length && (
                      <SettingsRow
                        title="No organization connections"
                        description="Share a connection from the organization's AI connections page."
                      />
                    )}
                  </SettingsSection>
                </div>
              )}
            </>
          ) : (
            <SettingsEmpty
              title="Workgroup unavailable"
              action={
                <Button variant="outline" onClick={() => openGroup()}>
                  Back to workgroups
                </Button>
              }
            >
              It may have been removed or your access has changed.
            </SettingsEmpty>
          )
        ) : (
          <>
            <div className="settings-list-toolbar">
              <SettingsSearch value={query} onChange={setQuery} placeholder="Filter by name…" />
              {canManage && (
                <Button
                  className="settings-toolbar-primary"
                  onClick={() => {
                    action.clearError();
                    setDialog("create");
                  }}
                >
                  <HugeiconsIcon icon={Add01Icon} size={16} />
                  Create workgroup
                </Button>
              )}
            </div>
            <Table className="settings-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  {canManage && (
                    <>
                      <TableHead>Members</TableHead>
                      <TableHead>
                        <span className="sr-only">Open</span>
                      </TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups
                  ?.filter((group) => matchesSearch(query, group.name))
                  .map((group) => (
                    <TableRow key={group.id}>
                      <TableCell>
                        {canManage ? (
                          <button
                            type="button"
                            className="settings-table-link"
                            onClick={() => openGroup(group.id)}
                          >
                            <HugeiconsIcon icon={UserGroupIcon} size={18} />
                            {group.name}
                          </button>
                        ) : (
                          <span className="settings-table-link">
                            <HugeiconsIcon icon={UserGroupIcon} size={18} />
                            {group.name}
                          </span>
                        )}
                      </TableCell>
                      {canManage && (
                        <>
                          <TableCell>
                            {"user_ids" in group && Array.isArray(group.user_ids)
                              ? group.user_ids.length
                              : 0}
                          </TableCell>
                          <TableCell className="settings-row-actions">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Open ${group.name}`}
                              onClick={() => openGroup(group.id)}
                            >
                              <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
                            </Button>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
            {!groups?.filter((group) => matchesSearch(query, group.name)).length && (
              <SettingsEmpty
                title={
                  query
                    ? "No matching workgroups"
                    : canManage
                      ? "Organize people into workgroups"
                      : "You haven't joined a workgroup"
                }
              >
                {query
                  ? "Try a different name."
                  : canManage
                    ? "Give teams access to shared agents and organization connections."
                    : "An organization admin can add you to a workgroup."}
              </SettingsEmpty>
            )}
          </>
        )}
      </ResourceState>
      <SettingsDialog
        open={dialog === "create" || dialog === "rename"}
        onOpenChange={(open) => {
          if (!open && !action.busy) setDialog(null);
        }}
        title={dialog === "rename" ? "Rename workgroup" : "Create a workgroup"}
        description={
          dialog === "rename"
            ? "The new name is visible throughout your organization."
            : "Create the workgroup, then choose its members and shared resources."
        }
      >
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            const name = String(new FormData(event.currentTarget).get("name")).trim();
            void action.run(
              async () => {
                const result = await durableCommand<{ workgroup: Workgroup }>(
                  `workgroup:${dialog === "rename" ? selectedId : "new"}`,
                  dialog === "rename" ? `${path}/workgroups/${selectedId}` : `${path}/workgroups`,
                  { name },
                );
                setDialog(null);
                refresh();
                openGroup(result.workgroup.id);
                await account.refresh();
              },
              dialog === "rename" ? "Workgroup renamed." : "Workgroup created.",
            );
          }}
        >
          <AccountField label="Name">
            <Input
              name="name"
              key={dialog}
              defaultValue={dialog === "rename" ? selected?.name : ""}
              placeholder="e.g. Engineering"
              required
              maxLength={120}
              disabled={action.busy}
            />
          </AccountField>
          <SettingsError message={action.error} />
          <div className="settings-dialog-actions">
            <Button
              type="button"
              variant="outline"
              disabled={action.busy}
              onClick={() => setDialog(null)}
            >
              Cancel
            </Button>
            <Button disabled={action.busy}>
              {action.busy ? "Saving…" : dialog === "rename" ? "Save name" : "Create workgroup"}
            </Button>
          </div>
        </form>
      </SettingsDialog>
      <SettingsDialog
        open={dialog === "delete"}
        onOpenChange={(open) => {
          if (!open && !action.busy) setDialog(null);
        }}
        title={`Delete ${selected?.name ?? "workgroup"}?`}
        description="Members remain in the organization. Access granted through this workgroup is removed immediately. This cannot be undone."
      >
        <SettingsError message={action.error} />
        <div className="settings-dialog-actions">
          <Button variant="outline" disabled={action.busy} onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await command(`${path}/workgroups/${selectedId}/delete`);
                setDialog(null);
                openGroup();
                refresh();
                await account.refresh();
              }, "Workgroup deleted.")
            }
          >
            {action.busy ? "Deleting…" : "Delete workgroup"}
          </Button>
        </div>
      </SettingsDialog>
      {dialog === "members" && selected && (
        <WorkgroupMembers
          group={selected}
          members={members.data?.members ?? []}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
