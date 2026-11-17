import { Loading03Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { NativeProgress } from "@/types/native-progress";

export const NativeProgressDetails = memo(function NativeProgressDetails({
  progress,
  agentName,
  compose,
}: {
  progress: NativeProgress | null | undefined;
  agentName: string;
  compose?: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const commands =
    progress?.commands.filter((command) => ["compact", "review"].includes(command.name)) ?? [];
  if (
    !progress ||
    (!progress.plans.length &&
      !progress.usage &&
      !progress.compactions.length &&
      !progress.file_changes.length &&
      !(compose && commands.length))
  )
    return null;
  return (
    <section aria-label={`${agentName} work progress`}>
      <details onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer py-2 text-sm font-medium">
          {agentName} · Work progress
        </summary>
        {open && (
          <div className="space-y-4 py-3 text-sm">
            {compose && commands.length > 0 && (
              <fieldset
                className="flex min-w-0 flex-wrap gap-2"
                aria-label={`${agentName} actions`}
              >
                {commands.map((command) => (
                  <Button
                    key={command.name}
                    variant="outline"
                    size="sm"
                    onClick={() => compose(`/${command.name}`)}
                  >
                    {command.name === "compact" ? "Summarize context" : "Review work"}
                  </Button>
                ))}
              </fieldset>
            )}
            {progress.plans.map((plan) => (
              <div key={plan.id}>
                {plan.text && <p className="whitespace-pre-wrap break-words">{plan.text}</p>}
                {plan.entries.length > 0 && (
                  <ul className="space-y-2">
                    {plan.entries.map((entry, index) => (
                      // ACP replaces a plan's ID-less entries; these display rows have no local state.
                      // biome-ignore lint/suspicious/noArrayIndexKey: Read-only native plan entries have no stable item identity.
                      <li key={`${index}:${entry.text}`} className="flex items-start gap-2">
                        <span
                          className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center"
                          role="img"
                          aria-label={entry.state.replaceAll("_", " ")}
                        >
                          {entry.state === "completed" ? (
                            <HugeiconsIcon icon={Tick02Icon} size={14} />
                          ) : entry.state === "in_progress" ? (
                            <HugeiconsIcon icon={Loading03Icon} size={14} />
                          ) : (
                            <span className="size-2 rounded-full border border-current" />
                          )}
                        </span>
                        <span className="break-words">{entry.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {progress.usage && (
              <p className="text-xs text-muted-foreground">
                Context used: {progress.usage.used.toLocaleString()} /{" "}
                {progress.usage.size.toLocaleString()}
                {progress.usage.cost && (
                  <>
                    {" "}
                    · Reported cost: {progress.usage.cost.amount.toLocaleString()}{" "}
                    {progress.usage.cost.currency}
                  </>
                )}
              </p>
            )}
            {progress.compactions.map((compaction) => (
              <details key={compaction.id}>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Context summary ·{" "}
                  {
                    {
                      in_progress: "Preparing",
                      completed: "Ready",
                      failed: "Needs attention",
                      cancelled: "Stopped",
                      unknown: "Checking status",
                    }[compaction.state]
                  }
                </summary>
                {compaction.summary && (
                  <p className="mt-2 whitespace-pre-wrap break-words text-xs">
                    {compaction.summary}
                  </p>
                )}
                {compaction.summary_truncated && (
                  <p className="text-xs text-muted-foreground">Partial preview</p>
                )}
                {compaction.error && (
                  <p className="mt-2 text-xs text-destructive">{compaction.error}</p>
                )}
              </details>
            ))}
            {progress.file_changes.map((change) => (
              <details key={`${change.tool_id}:${change.path}`}>
                <summary className="cursor-pointer break-words text-xs">
                  Changes · {change.path}
                </summary>
                <p className="my-2 text-xs text-muted-foreground">
                  Change preview{change.truncated ? " · Partial" : ""}
                </p>
                {change.old_text !== null && (
                  <div>
                    <span className="text-xs text-muted-foreground">Before</span>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-xs">
                      {change.old_text}
                    </pre>
                  </div>
                )}
                <span className="text-xs text-muted-foreground">After</span>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-xs">
                  {change.new_text}
                </pre>
              </details>
            ))}
          </div>
        )}
      </details>
    </section>
  );
});
