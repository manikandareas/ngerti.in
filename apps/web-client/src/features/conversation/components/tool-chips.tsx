import { Check, ChevronRight, Circle, LoaderCircle, X } from "lucide-react";
import { useId, useState } from "react";
import type { Run } from "@/types/workspace";

const actionLabels: Record<string, string> = {
  "ngertiin.update_agent": "Memperbarui profil",
  "ngertiin.create_agent": "Membuat agent",
  "ngertiin.capture_goal": "Mencatat tujuan",
  "ngertiin.update_goal": "Memperbarui tujuan",
  "ngertiin.create_routine": "Menjadwalkan Routine",
  "ngertiin.update_routine": "Memperbarui Routine",
  "ngertiin.write_memory": "Mengingat konteks percakapan",
  "ngertiin.write_skill": "Memperbarui skill",
};
function actionLabel(name: string) {
  if (actionLabels[name]) return actionLabels[name];
  if (/search|research/i.test(name)) return "Mencari informasi";
  if (/browser|navigate|web/i.test(name)) return "Menggunakan browser";
  if (/read|list|inspect/i.test(name)) return "Memeriksa informasi";
  if (/write|edit|apply|patch/i.test(name)) return "Memperbarui file";
  if (/exec|shell|command/i.test(name)) return "Menjalankan perintah";
  return "Menggunakan tool";
}
export function ToolChips({ run }: { run: Run }) {
  if (!run.native_tools.length && !run.product_tools.length) return null;
  const activities = [
    ...run.native_tools.map((tool) => ({ ...tool, product: false })),
    ...[...new Set(run.product_tools)].map((name) => ({
      item_id: name,
      name,
      state: "received",
      product: true,
    })),
  ];
  const groups: Activity[][] = [];
  let completed: Activity[] = [];
  function flush() {
    if (completed.length) groups.push(completed);
    completed = [];
  }
  for (const activity of activities) {
    if (!activity.product && activity.state === "completed") completed.push(activity);
    else {
      flush();
      groups.push([activity]);
    }
  }
  flush();
  return (
    <section
      className="flex flex-col items-start gap-1.5"
      aria-label={`${activities.length} aktivitas tool`}
    >
      {groups.map((group) =>
        group.length > 1 ? (
          <ActivityRun key={group[0]?.item_id} activities={group} runStatus={run.status} />
        ) : group[0] ? (
          <ToolActivity key={group[0].item_id} tool={group[0]} runStatus={run.status} />
        ) : null,
      )}
    </section>
  );
}

type Activity = { item_id: string; name: string; state: string; product: boolean };

/** Only contiguous native steps with an explicit completion receipt are folded together. */
function ActivityRun({ activities, runStatus }: { activities: Activity[]; runStatus: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const counts = new Map<string, number>();
  for (const activity of activities) {
    const name = actionLabel(activity.name);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const names = [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name));
  const summary = `${activities.length} langkah · ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3}` : ""}`;
  return (
    <div data-activity-run className="flex min-w-0 max-w-full flex-col gap-1">
      <div className="flex min-w-0 justify-start">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
          title="Lihat langkah"
          className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-border/40 bg-panel px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-secondary"
        >
          {open ? (
            <ChevronRight size={13} className="shrink-0 rotate-90" aria-hidden="true" />
          ) : (
            <Check size={13} className="shrink-0 text-success-foreground" aria-hidden="true" />
          )}
          <span className="min-w-0 max-w-[480px] truncate font-medium leading-5">{summary}</span>
          {!open && <ChevronRight size={13} className="shrink-0" aria-hidden="true" />}
        </button>
      </div>
      {open && (
        <div id={id} className="flex flex-col items-start gap-1">
          {activities.map((tool) => (
            <ToolActivity key={tool.item_id} tool={tool} runStatus={runStatus} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolActivity({ tool, runStatus }: { tool: Activity; runStatus: string }) {
  const [expanded, setExpanded] = useState(false);
  const running = tool.state === "started" && ["running", "cancel_requested"].includes(runStatus);
  const failed = tool.state === "failed";
  const complete = tool.state === "completed";
  const status = tool.product
    ? "Respons diterima"
    : running
      ? "Sedang berjalan"
      : failed
        ? "Gagal"
        : complete
          ? "Selesai"
          : "Belum terverifikasi";
  return (
    <details
      data-tool-activity
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      className="group/tool w-fit max-w-full rounded-xl border border-border/40 bg-panel text-[13px] open:w-[min(38rem,100%)]"
    >
      {/* biome-ignore lint/a11y/useSemanticElements: retain the upstream native details summary and its explicit accessible disclosure-button role. */}
      <summary
        role="button"
        aria-expanded={expanded}
        aria-label={`${actionLabel(tool.name)} · ${status}`}
        className={`flex min-h-8 cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-1.5 hover:bg-secondary [&::-webkit-details-marker]:hidden ${failed ? "text-destructive" : "text-muted-foreground"}`}
      >
        {running ? (
          <LoaderCircle
            size={13}
            className="shrink-0 motion-safe:animate-spin"
            aria-hidden="true"
          />
        ) : failed ? (
          <X size={13} className="shrink-0" aria-hidden="true" />
        ) : complete ? (
          <Check size={13} className="shrink-0 text-success-foreground" aria-hidden="true" />
        ) : (
          <Circle size={13} className="shrink-0" aria-hidden="true" />
        )}
        <span className="min-w-0 max-w-[30rem] truncate font-medium leading-5">
          {actionLabel(tool.name)}
        </span>
        <ChevronRight
          size={13}
          className="ml-auto shrink-0 group-open/tool:rotate-90"
          aria-hidden="true"
        />
      </summary>
      <div className="space-y-2 border-t border-border/40 p-3 text-muted-foreground">
        <p className="text-[11px] font-medium">{status}</p>
        <div>
          <p className="mb-1 text-[11px] font-medium">Tool</p>
          <p className="break-words rounded-lg bg-foreground/[0.045] p-2.5 font-mono text-[12px] text-foreground">
            {tool.name}
          </p>
        </div>
      </div>
    </details>
  );
}
