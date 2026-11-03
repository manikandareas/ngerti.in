import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { responsibilityLabels } from "@/features/conversation/lib/responsibility-format";
import { routineName } from "@/features/conversation/lib/routine-name";
import { routineSchedule } from "@/features/conversation/lib/routine-schedule";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { Snapshot } from "@/types/workspace";
import { GoalDetails } from "./goal-details";
import { ResponsibilityControls } from "./responsibility-controls";
import { RoutineDetails } from "./routine-details";

export function Responsibilities({
  kind,
  snapshot,
  selected,
  onClose,
  compose,
  openFile,
  openGoal,
  source,
  refresh,
  restoreFocus,
}: {
  kind: "goals" | "routine";
  snapshot: Snapshot;
  selected: string;
  onClose: () => void;
  compose: (text: string) => void;
  openFile: (id: string) => void;
  openGoal: (id: string) => void;
  source: (id?: string) => void;
  refresh: () => Promise<unknown>;
  restoreFocus: () => void;
}) {
  const mobile = useMediaQuery("(max-width: 767px)");
  const Root = mobile ? Drawer : Dialog;
  const Content = mobile ? DrawerContent : DialogContent;
  const Title = mobile ? DrawerTitle : DialogTitle;
  const Description = mobile ? DrawerDescription : DialogDescription;
  const Close = mobile ? DrawerClose : DialogClose;
  const goal = kind === "goals" ? snapshot.goals.find((g) => g.id === selected) : undefined;
  const routine = kind === "routine" ? snapshot.routines.find((r) => r.id === selected) : undefined;
  const item = goal ?? routine;
  const title = goal?.title ?? (routine ? routineName(routine) : "Item unavailable");
  let responsibleId = routine?.agent_id;
  if (goal) responsibleId = goal.coordinator_agent_id ?? goal.agent_id;
  else if (routine?.execution_target?.type === "agent")
    responsibleId = routine.execution_target.agent_id;
  let description = "This item is no longer available.";
  if (goal) description = goal.objective || goal.title;
  else if (routine) description = routineSchedule(routine);
  const responsible = snapshot.agents.find((a) => a.id === responsibleId);
  const address =
    snapshot.thread.type === "group" && responsible?.handle ? `@${responsible.handle} ` : "";
  const edit = () => {
    onClose();
    compose(`${address}Update ${goal ? "goal" : "routine"} "${title}": `);
  };
  return (
    <Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Content
        data-responsibility-detail=""
        {...(!mobile ? { showCloseButton: false } : {})}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
        className={
          mobile
            ? "flex flex-col overflow-hidden"
            : `flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 ${goal ? "sm:max-w-2xl" : "sm:max-w-lg"}`
        }
      >
        <header className="flex shrink-0 items-start justify-between gap-4 px-6 pt-6 sm:px-8 sm:pt-8">
          {routine ? (
            <span className="rounded-lg bg-foreground px-3 py-1.5 text-[12px] font-medium text-background">
              {routine.state === "active"
                ? "Scheduled"
                : (responsibilityLabels[routine.state] ?? routine.state)}
            </span>
          ) : (
            <Title className="min-w-0 break-words pr-2 text-xl font-semibold leading-7">
              {title}
            </Title>
          )}
          <Close asChild>
            <Button variant="secondary" size="icon" aria-label="Close detail" className="shrink-0">
              <HugeiconsIcon icon={Cancel01Icon} size={18} />
            </Button>
          </Close>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-6 pb-6 pt-4 sm:px-8 sm:pb-8">
          {routine && (
            <Title className="mb-2 break-words text-xl font-semibold leading-7">{title}</Title>
          )}
          <Description className="whitespace-pre-wrap break-words text-[14px] leading-6">
            {description}
          </Description>
          {goal && <GoalDetails goal={goal} snapshot={snapshot} openFile={openFile} />}
          {routine && (
            <RoutineDetails
              routine={routine}
              snapshot={snapshot}
              openGoal={openGoal}
              viewSource={() => {
                onClose();
                source(routine.source_message_id ?? undefined);
              }}
            />
          )}
        </div>
        {item && (
          <footer className="shrink-0 space-y-3 border-t px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8">
            {routine ? (
              <ResponsibilityControls
                item={routine}
                kind="routine"
                refresh={refresh}
                blocked={
                  !!routine.goal_id &&
                  snapshot.goals.find((g) => g.id === routine.goal_id)?.state !== "active"
                }
                actions={
                  <Button variant="outline" className="flex-1" onClick={edit}>
                    Edit in chat
                  </Button>
                }
              />
            ) : (
              goal && (
                <>
                  <ResponsibilityControls item={goal} kind="goal" refresh={refresh} />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        onClose();
                        source(goal.source_message_ids[0]);
                      }}
                    >
                      View conversation
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={edit}>
                      Edit in chat
                    </Button>
                  </div>
                </>
              )
            )}
          </footer>
        )}
      </Content>
    </Root>
  );
}
