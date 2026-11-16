import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { useFeedbackToast } from "@/hooks/use-feedback-toast";
import { AccountField } from "./account-forms";
import type { Workgroup } from "./types";

export function ResourceState({
  error,
  retry,
  loading,
  children,
}: {
  error: string;
  retry: () => void;
  loading: boolean;
  children: ReactNode;
}) {
  useFeedbackToast(error, { retry });
  if (error) return null;
  if (loading)
    return <div role="status" aria-label="Loading settings" className="account-loading-row" />;
  return children;
}
export function WorkgroupChoices({
  groups,
  selected,
  change,
}: {
  groups: Workgroup[];
  selected: string[];
  change: (ids: string[]) => void;
}) {
  return (
    <div className="organization-checks">
      {groups.map((group) => (
        <label key={group.id}>
          <input
            type="checkbox"
            checked={selected.includes(group.id)}
            onChange={(event) =>
              change(
                event.target.checked
                  ? [...selected, group.id]
                  : selected.filter((id) => id !== group.id),
              )
            }
          />
          {group.name}
        </label>
      ))}
    </div>
  );
}
export function AudiencePicker({
  groups,
  choose,
  busy,
}: {
  groups: Workgroup[];
  choose: (
    audience: { mode: "all_members" } | { mode: "workgroups"; workgroup_ids: string[] },
  ) => Promise<void>;
  busy: boolean;
}) {
  const [mode, setMode] = useState("all_members");
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <div className="organization-inline-form">
      <AccountField label="Access">
        <select
          className="settings-select"
          value={mode}
          onChange={(event) => setMode(event.target.value)}
        >
          <option value="all_members">All members</option>
          <option value="workgroups">Selected workgroups</option>
        </select>
      </AccountField>
      {mode === "workgroups" && (
        <WorkgroupChoices groups={groups} selected={selected} change={setSelected} />
      )}
      <Button
        className="self-start"
        disabled={busy || (mode === "workgroups" && !selected.length)}
        onClick={() =>
          void choose(
            mode === "all_members" ? { mode } : { mode: "workgroups", workgroup_ids: selected },
          )
        }
      >
        Save access
      </Button>
    </div>
  );
}
