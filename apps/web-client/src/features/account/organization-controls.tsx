import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { SettingsError, SettingsSearch } from "@/features/settings/components/settings-ui";
import { AccountField } from "./account-forms";
import type { Audience, Workgroup } from "./types";

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
  if (error) return <SettingsError message={error} retry={retry} />;
  if (loading)
    return (
      <div role="status" aria-label="Loading settings" className="settings-loading">
        <span />
        <span />
        <span />
      </div>
    );
  return children;
}
export function WorkgroupChoices({
  groups,
  selected,
  change,
}: {
  groups: Pick<Workgroup, "id" | "name">[];
  selected: string[];
  change: (ids: string[]) => void;
}) {
  return (
    <div className="settings-choice-list">
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
          <span>{group.name}</span>
        </label>
      ))}
    </div>
  );
}
export type AudiencePolicy =
  | { mode: "all_members" }
  | { mode: "workgroups"; workgroup_ids: string[] };
export function AudienceFields({
  groups,
  value,
  onChange,
  disabled,
}: {
  groups: Workgroup[];
  value: AudiencePolicy;
  onChange: (value: AudiencePolicy) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  return (
    <fieldset className="settings-audience-fields" disabled={disabled}>
      <AccountField label="Available to">
        <select
          className="settings-select"
          value={value.mode}
          onChange={(event) =>
            onChange(
              event.target.value === "all_members"
                ? { mode: "all_members" }
                : { mode: "workgroups", workgroup_ids: [] },
            )
          }
        >
          <option value="all_members">All organization members</option>
          <option value="workgroups">Selected workgroups</option>
        </select>
      </AccountField>
      {value.mode === "workgroups" && (
        <>
          <SettingsSearch value={query} onChange={setQuery} placeholder="Find a workgroup…" />
          <WorkgroupChoices
            groups={groups.filter((group) =>
              group.name.toLowerCase().includes(query.toLowerCase()),
            )}
            selected={value.workgroup_ids}
            change={(workgroup_ids) => onChange({ mode: "workgroups", workgroup_ids })}
          />
          {!groups.length && (
            <p className="settings-muted">
              Create a workgroup before granting access to selected teams.
            </p>
          )}
        </>
      )}
      <p className="settings-muted">
        {value.mode === "all_members"
          ? "Current and future members of this organization can use this resource."
          : value.workgroup_ids.length
            ? `Members of ${value.workgroup_ids.length} selected workgroup${value.workgroup_ids.length === 1 ? "" : "s"} can use this resource.`
            : "No one has access until a workgroup is selected."}
      </p>
    </fieldset>
  );
}
export function audienceLabel(audience: Audience | undefined, groups: Workgroup[]) {
  if (!audience) return "Access unavailable";
  if (audience.mode === "all_members") return "All organization members";
  if (!audience.workgroup_ids.length) return "No workgroups selected";
  return audience.workgroup_ids
    .map((id) => groups.find((group) => group.id === id)?.name ?? "Unavailable workgroup")
    .join(", ");
}
export function AudiencePicker({
  groups,
  initial,
  choose,
  busy,
}: {
  groups: Workgroup[];
  initial?: Audience;
  choose: (audience: AudiencePolicy) => Promise<void>;
  busy: boolean;
}) {
  const [value, setValue] = useState<AudiencePolicy>(
    initial?.mode === "workgroups"
      ? { mode: "workgroups", workgroup_ids: initial.workgroup_ids }
      : { mode: "all_members" },
  );
  return (
    <div className="settings-form">
      <AudienceFields groups={groups} value={value} onChange={setValue} disabled={busy} />
      <Button className="self-end" disabled={busy} onClick={() => void choose(value)}>
        {busy ? "Saving…" : "Save access"}
      </Button>
    </div>
  );
}
