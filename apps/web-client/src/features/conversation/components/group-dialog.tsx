import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type JSX, type ReactNode, useId } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Agent } from "@/types/workspace";
import type { GroupDraft } from "../lib/group-edit";
import { AgentAvatar } from "./identity";

type GroupDialogProps = {
  title: string;
  description: string;
  agents: Agent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: GroupDraft;
  onDraftChange: (draft: GroupDraft) => void;
  locked: boolean;
  busy: boolean;
  submitLabel: string;
  onSubmit: () => Promise<void>;
  error: string;
  status?: ReactNode;
  recovery?: ReactNode;
  blocked?: boolean;
  returnFocus?: () => void;
};

export function GroupDialog({
  title,
  description,
  agents,
  open,
  onOpenChange,
  draft,
  onDraftChange,
  locked,
  busy,
  submitLabel,
  onSubmit,
  error,
  status,
  recovery,
  blocked = false,
  returnFocus,
}: GroupDialogProps): JSX.Element {
  const nameId = useId();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="creation-dialog-overlay"
        onCloseAutoFocus={
          returnFocus
            ? (event) => {
                event.preventDefault();
                returnFocus();
              }
            : undefined
        }
        className="max-h-[85svh] w-[340px] max-w-[calc(100%-32px)] gap-3 overflow-y-auto rounded-2xl border-border/50 bg-card p-4 sm:max-w-[340px]"
      >
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={nameId} className="sr-only">
              Nama grup
            </Label>
            <Input
              id={nameId}
              placeholder="Nama grup"
              className="h-9 border-0 bg-secondary/70 px-3 text-[14px] dark:bg-secondary/70"
              value={draft.name}
              maxLength={200}
              disabled={locked}
              onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
              autoFocus
            />
          </div>
          <fieldset disabled={locked} className="max-h-64 space-y-0.5 overflow-y-auto">
            <legend className="sr-only">Anggota</legend>
            {agents.map((agent) => {
              const checked = draft.member_agent_ids.includes(agent.id);
              return (
                <label
                  key={agent.id}
                  className="relative flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-secondary/50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
                >
                  <input
                    type="checkbox"
                    className="absolute right-2 size-[18px] cursor-pointer opacity-0"
                    aria-label={agent.name}
                    checked={checked}
                    onChange={(event) =>
                      onDraftChange({
                        ...draft,
                        member_agent_ids: event.target.checked
                          ? [...draft.member_agent_ids, agent.id]
                          : draft.member_agent_ids.filter((id) => id !== agent.id),
                      })
                    }
                  />
                  <AgentAvatar
                    agent={agent}
                    deferred
                    state="idle"
                    className="size-7 rounded-lg text-xs"
                  />
                  <span className="min-w-0 flex-1 truncate text-[14px]">{agent.name}</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none grid size-[18px] shrink-0 place-items-center rounded-full border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-border/60"}`}
                  >
                    {checked && <HugeiconsIcon icon={Tick02Icon} size={12} />}
                  </span>
                </label>
              );
            })}
          </fieldset>
          {status && (
            <p role="status" className="text-sm text-muted-foreground">
              {status}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {recovery}
          <Button
            type="submit"
            className="h-9 w-full rounded-lg text-[14px] font-medium"
            disabled={busy || blocked || !draft.name.trim() || !draft.member_agent_ids.length}
          >
            {submitLabel}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
