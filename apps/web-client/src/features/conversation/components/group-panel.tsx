import { File02Icon, PencilEdit01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { command } from "@/lib/api-client";
import type { Agent, Snapshot, Thread } from "@/types/workspace";
import { AgentAvatar } from "./identity";
import { PanelCard, PanelNavRow, PanelPageHeader } from "./panel-primitives";

export function GroupPanel({
  snapshot,
  agents,
  refresh,
  compose,
  initialMember,
  selectMember,
}: {
  snapshot: Snapshot;
  agents: Agent[];
  refresh: () => Promise<unknown>;
  compose: (text: string) => void;
  initialMember?: string | null;
  selectMember: (id: string | null) => void;
}) {
  const member = initialMember ?? null;
  const setMember = selectMember;
  const [selected, setSelected] = useState(snapshot.thread.member_agent_ids);
  const [expectedRevision, setExpectedRevision] = useState(snapshot.thread.revision);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const profile = snapshot.agents.find((a) => a.id === member);
  if (profile)
    return (
      <div className="context-section pt-3.5">
        <PanelPageHeader
          title={profile.name}
          back="Members"
          onBack={() => {
            setMember(null);
          }}
        />
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <AgentAvatar
            showActivityLabel={false}
            agent={profile}
            animated
            interactive
            followPointer
            className="size-20 rounded-[24px] text-3xl"
          />
          <p className="text-[13px] leading-[1.5] text-muted-foreground">
            {profile.soul || "Group member"}
          </p>
        </div>
        <PanelCard>
          <p className="px-3.5 py-3 text-[13px] leading-[1.5] text-muted-foreground">
            This is a group profile. Direct-message history, memory, and files stay private.
          </p>
        </PanelCard>
      </div>
    );
  return (
    <div className="context-section space-y-3.5 pt-3.5">
      <PanelCard>
        <PanelNavRow
          title="Shared goals and instructions"
          hint={
            <span className="line-clamp-2">
              {snapshot.thread.shared_instructions ||
                "Describe what you want to work on together in chat."}
            </span>
          }
          icon={File02Icon}
          aria-label="Edit in chat"
          onClick={() => compose("Help update this group’s shared goals and instructions: ")}
        />
      </PanelCard>
      <PanelCard label={`Members · ${snapshot.agents.length}`}>
        {snapshot.agents.map((a) => (
          <PanelNavRow
            key={a.id}
            title={a.name}
            aria-label={`Member profile ${a.name}`}
            hint={a.soul || undefined}
            onClick={() => {
              setMember(a.id);
            }}
          >
            <AgentAvatar showActivityLabel={false} agent={a} className="size-8 rounded-[10px]" />
          </PanelNavRow>
        ))}
      </PanelCard>
      <details
        className="group rounded-[12px] bg-composer ring-1 ring-inset ring-foreground/[0.06]"
        onToggle={(e) => {
          if (e.currentTarget.open) {
            setSelected(snapshot.thread.member_agent_ids);
            setExpectedRevision(snapshot.thread.revision);
          }
        }}
      >
        <summary className="flex min-h-[46px] cursor-pointer list-none items-center gap-2.5 px-3.5 py-[11px] text-[14px] font-medium [&::-webkit-details-marker]:hidden">
          <HugeiconsIcon
            icon={UserGroupIcon}
            size={15}
            strokeWidth={1.5}
            className="text-muted-foreground"
          />
          Manage members
          <HugeiconsIcon
            icon={PencilEdit01Icon}
            size={13}
            strokeWidth={1.5}
            className="ml-auto text-muted-foreground"
          />
        </summary>
        <form
          className="space-y-3 px-3.5 pb-3.5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              const saved = await command<Thread>(`/v1/groups/${snapshot.thread.id}/membership`, {
                expected_revision: expectedRevision,
                member_agent_ids: selected,
              });
              setExpectedRevision(saved.revision);
              await refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not save changes.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy}>
            {agents.map((a) => (
              <label
                key={a.id}
                className="flex min-h-[46px] items-center gap-2.5 border-b border-foreground/[0.05] py-2"
              >
                <input
                  type="checkbox"
                  aria-label={`Members ${a.name}`}
                  checked={selected.includes(a.id)}
                  onChange={(e) =>
                    setSelected((v) =>
                      e.target.checked ? [...v, a.id] : v.filter((id) => id !== a.id),
                    )
                  }
                />
                <AgentAvatar
                  showActivityLabel={false}
                  agent={a}
                  className="size-7 rounded-lg text-xs"
                />
                <span className="truncate text-[13px]">{a.name}</span>
              </label>
            ))}
          </fieldset>
          <p className="text-caption text-muted-foreground">
            Access changes apply to future work. Private member resources are not shared.
          </p>
          {error && (
            <div>
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelected(snapshot.thread.member_agent_ids);
                  setExpectedRevision(snapshot.thread.revision);
                  setError("");
                }}
              >
                Reload members
              </Button>
            </div>
          )}
          <Button size="sm" disabled={busy || !selected.length}>
            Save members
          </Button>
        </form>
      </details>
    </div>
  );
}
