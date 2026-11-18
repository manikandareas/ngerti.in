import { useState } from "react";
import { Button } from "@/components/ui/button";
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
  SettingsEmpty,
  SettingsSearch,
} from "@/features/settings/components/settings-ui";
import { useApiResource } from "@/hooks/use-api-resource";
import { ResourceState } from "./organization-controls";
import { useAccount } from "./session";
import type { Member } from "./types";

interface AuditEntry {
  sequence: string;
  actor_user_id: string | null;
  action: string;
  target_id: string | null;
  created_at: string;
}
const labels: Record<string, string> = {
  "organization.created": "Created the organization",
  "organization.updated": "Updated the organization",
  "workgroup.saved": "Saved a workgroup",
  "workgroup.deleted": "Deleted a workgroup",
  "workgroup.member_added": "Added a workgroup member",
  "workgroup.member_removed": "Removed a workgroup member",
  "member.role_changed": "Changed a member's role",
  "member.removed": "Removed a member",
  "member.private_work_resumed": "Resumed private responsibilities",
  "invitation.created": "Created an invitation",
  "invitation.canceled": "Canceled an invitation",
  "invitation.accepted": "Accepted an invitation",
  "audience.saved": "Updated an access policy",
  "agent.audience_saved": "Updated shared agent access",
};
export function ActivitySettings() {
  const account = useAccount();
  const [query, setQuery] = useState("");
  const [after, setAfter] = useState("0");
  const path = `/v1/organizations/${account.organization?.id}`;
  const activity = useApiResource<{ audit: AuditEntry[] }>(`${path}/audit?after=${after}`);
  const members = useApiResource<{ members: Member[] }>(`${path}/members`);
  const actor = (row: AuditEntry) =>
    members.data?.members.find((member) => member.user_id === row.actor_user_id)?.name ??
    (row.actor_user_id ? "Former member" : "Server operator");
  const label = (row: AuditEntry) => labels[row.action] ?? row.action.replaceAll(/[._]/g, " ");
  const rows =
    activity.data?.audit
      .filter((row) => matchesSearch(query, label(row), actor(row)))
      .toReversed() ?? [];
  return (
    <div className="settings-admin-page">
      <p className="settings-muted">
        Organization administration activity. Private conversations and agent work are excluded.
      </p>
      <SettingsSearch value={query} onChange={setQuery} placeholder="Search this activity page…" />
      <ResourceState
        error={activity.error || members.error}
        loading={!activity.data || !members.data}
        retry={() => {
          activity.retry();
          members.retry();
        }}
      >
        <Table className="settings-table">
          <TableHeader>
            <TableRow>
              <TableHead>Activity</TableHead>
              <TableHead>By</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.sequence}>
                <TableCell>{label(row)}</TableCell>
                <TableCell>{actor(row)}</TableCell>
                <TableCell>
                  <time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString()}</time>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!rows.length && (
          <SettingsEmpty title="No matching activity">
            Try another search or check a different page.
          </SettingsEmpty>
        )}
        <div className="settings-inline-actions">
          {after !== "0" && (
            <Button variant="outline" onClick={() => setAfter("0")}>
              First page
            </Button>
          )}
          {activity.data?.audit.length === 500 && (
            <Button
              variant="outline"
              onClick={() => setAfter(activity.data?.audit.at(-1)?.sequence ?? "0")}
            >
              Next page
            </Button>
          )}
        </div>
      </ResourceState>
    </div>
  );
}
