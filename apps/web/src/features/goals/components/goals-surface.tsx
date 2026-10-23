import {
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  Heart,
  Laptop,
  MoreHorizontal,
  Palette,
  PanelLeft,
  Pencil,
  PlusSquare,
  Square,
  SquareCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Dialog } from "radix-ui";
import { useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGoal, useGoals } from "@/features/goals/hooks/use-goals";
import type { Goal } from "@/features/goals/types";
import { goalActivity } from "../utils/activity";

const categories = [
  ["Health", Heart, "kesehatan"],
  ["Relationships", Users, "hubungan"],
  ["Finance", DollarSign, "keuangan"],
  ["Career", BriefcaseBusiness, "karier"],
  ["Interests", Palette, "minat"],
  ["Productivity", Laptop, "produktivitas"],
  ["Something else", SquareCheck, "hal lain"],
] as const;
export type GoalConversation = (text: string, goal?: Goal) => void;
const circle =
  "flex size-9 shrink-0 items-center justify-center rounded-full bg-muted hover:bg-accent";

export function GoalsSurface({
  onDiscuss,
  busy,
  split,
  obscured,
  onToggleChat,
}: {
  onDiscuss: GoalConversation;
  busy: boolean;
  split: boolean;
  obscured: boolean;
  onToggleChat: () => void;
}) {
  const data = useGoals();
  const [selected, setSelected] = useState<Goal | null>(null);
  const [filter, setFilter] = useState<"active" | "completed" | "archived">("active");
  const trigger = useRef<HTMLElement | null>(null);
  const goals =
    data.data?.goals.filter((g) =>
      filter === "active" ? ["active", "paused"].includes(g.state) : g.state === filter,
    ) ?? [];
  function discuss(text: string, goal?: Goal) {
    setSelected(null);
    onDiscuss(text, goal);
  }
  return (
    <section
      inert={obscured}
      aria-label="Goals"
      className={`goals-surface @container min-h-0 min-w-0 flex-1 overflow-y-auto bg-background ${obscured ? "invisible" : ""}`}
    >
      <header className="sticky top-0 z-10 bg-background">
        <button
          type="button"
          aria-label={split ? "Tutup percakapan" : "Buka percakapan"}
          aria-expanded={split}
          aria-controls="goals-chat"
          onClick={onToggleChat}
          className="absolute left-3 top-4 flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <PanelLeft size={22} />
        </button>
        <div
          className={`mx-auto flex max-w-[820px] items-center justify-between gap-4 px-6 @max-[900px]:pl-16 ${split ? "py-4" : "pb-7 pt-11"}`}
        >
          <h1 className={`${split ? "text-2xl" : "text-4xl"} font-semibold tracking-tight`}>
            Goals
          </h1>
          <DropdownMenu>
            <DropdownMenuTrigger className={circle} aria-label="Menu Goals">
              <MoreHorizontal size={22} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-2xl p-2">
              {(
                [
                  ["active", "Tracking"],
                  ["completed", "Completed"],
                  ["archived", "Archived"],
                ] as const
              ).map(([value, label]) => (
                <DropdownMenuItem
                  key={value}
                  className="min-h-10 px-3"
                  onSelect={() => setFilter(value)}
                >
                  {label}
                  {filter === value && <Check className="ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <div className="mx-auto max-w-[820px] px-6 pb-12">
        <h2
          className={`mb-6 flex items-center gap-4 text-lg font-semibold text-success-foreground ${split ? "mt-8" : "mt-1"}`}
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-success">
            <span className="size-1.5 rounded-full bg-success-foreground" />
          </span>
          {filter === "active" ? "Tracking" : filter === "completed" ? "Completed" : "Archived"}
        </h2>
        {data.isPending && (
          <p role="status" className="py-6 text-muted-foreground">
            Memuat tujuan…
          </p>
        )}
        {data.isError && (
          <p role="alert" className="py-4 text-danger">
            Tujuan belum tersinkron.{" "}
            <button type="button" className="underline" onClick={() => void data.refetch()}>
              Coba lagi
            </button>
          </p>
        )}
        {!data.isPending && !data.isError && !goals.length && (
          <p className="py-5 text-muted-foreground">
            {filter === "active"
              ? "Apa yang ingin kamu capai? Mulai dari salah satu pilihan di bawah."
              : "Belum ada tujuan di sini."}
          </p>
        )}
        <ul className="space-y-6">
          {goals.map((goal) => (
            <li key={goal.id} className="flex items-start gap-4">
              <button
                disabled={busy || goal.state === "completed" || goal.state === "archived"}
                type="button"
                aria-label={`Selesaikan ${goal.spec.title} lewat percakapan`}
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground disabled:cursor-default"
                onClick={() =>
                  discuss(
                    `Aku ingin menyelesaikan tujuan “${goal.spec.title}”. Tinjau bukti dan kriteria, lalu bantu proses penyelesaiannya.`,
                    goal,
                  )
                }
              >
                {goal.state === "completed" ? <SquareCheck size={22} /> : <Square size={22} />}
              </button>
              <button
                type="button"
                className="min-w-0 flex-1 rounded-lg text-left"
                onClick={(event) => {
                  trigger.current = event.currentTarget;
                  setSelected(goal);
                }}
              >
                <span className="block text-[17px] font-medium leading-6 wrap-anywhere">
                  {goal.spec.title}
                </span>
                <span className="mt-1 block line-clamp-2 text-[15px] leading-[1.45] text-muted-foreground wrap-anywhere">
                  <GoalSummary goal={goal} />
                </span>
              </button>
            </li>
          ))}
        </ul>
        <section className="mt-14">
          <h2 className="mb-5 text-lg font-semibold">Create a goal</h2>
          <div className="space-y-1">
            {categories.map(([label, Icon, topic]) => (
              <button
                key={label}
                type="button"
                disabled={busy}
                onClick={() =>
                  discuss(
                    `Aku ingin memulai tujuan tentang ${topic}. Bantu aku memperjelas targetnya.`,
                  )
                }
                className="flex min-h-12 w-full items-center gap-4 rounded-xl py-2 text-left hover:bg-muted disabled:opacity-50"
              >
                <Icon className="size-6 shrink-0 text-muted-foreground" strokeWidth={1.7} />
                <span className="flex-1 text-[17px]">{label}</span>
                <ChevronRight className="mr-1 size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      </div>
      <Dialog.Root
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/55" />
          <Dialog.Content
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              trigger.current?.focus();
            }}
            className="goals-surface fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[min(620px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[32px] bg-card p-6 shadow-xl outline-none"
          >
            {selected && <GoalActivity goal={selected} onDiscuss={discuss} busy={busy} />}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}

function GoalSummary({ goal }: { goal: Goal }) {
  const detail = useGoal(goal.id);
  const latest = detail.data ? goalActivity(detail.data)[0] : undefined;
  return latest?.description || goal.spec.next_action || goal.spec.target;
}

function GoalActivity({
  goal,
  onDiscuss,
  busy,
}: {
  goal: Goal;
  onDiscuss: GoalConversation;
  busy: boolean;
}) {
  const data = useGoal(goal.id);
  const current = data.data ?? goal;
  const history = data.data ? goalActivity(data.data) : [];
  let previousDay = "";
  return (
    <>
      <div className="flex items-start gap-2">
        <Dialog.Title className="min-w-0 flex-1 pt-1 text-lg font-semibold leading-6 wrap-anywhere">
          {current.spec.title}
        </Dialog.Title>
        <DropdownMenu>
          <DropdownMenuTrigger className={circle} aria-label="Menu tujuan">
            <MoreHorizontal size={20} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="goals-surface w-60 rounded-[20px] p-3">
            {(
              [
                [
                  SquareCheck,
                  "Complete",
                  `Aku ingin menyelesaikan tujuan “${current.spec.title}”. Tinjau kriterianya dan bantu proses penyelesaiannya.`,
                ],
                [
                  PlusSquare,
                  "Add subgoal",
                  `Bantu aku menambahkan subgoal untuk tujuan “${current.spec.title}”. Tanyakan detail yang diperlukan dan jelaskan jika hubungan subgoal belum didukung.`,
                ],
                [
                  Pencil,
                  "Rename",
                  `Aku ingin mengganti nama tujuan “${current.spec.title}”. Tanyakan nama barunya, lalu bantu menerapkan perubahan.`,
                ],
              ] as const
            ).map(([Icon, label, text]) => (
              <DropdownMenuItem
                key={label}
                disabled={busy}
                className="min-h-10 gap-3 px-2 text-[15px]"
                onSelect={() => onDiscuss(text, current)}
              >
                <Icon />
                {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="my-2" />
            <DropdownMenuItem
              disabled={busy}
              className="min-h-10 gap-3 px-2 text-[15px] text-danger focus:text-danger"
              onSelect={() =>
                onDiscuss(
                  `Aku ingin menghapus tujuan “${current.spec.title}”. Jelaskan tindakan yang tersedia; jangan mengganti penghapusan dengan pengarsipan tanpa persetujuanku.`,
                  current,
                )
              }
            >
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog.Close className={circle} aria-label="Tutup detail tujuan">
          <X size={19} />
        </Dialog.Close>
      </div>
      <Dialog.Description className="mt-3 text-[15px] leading-[1.5] text-muted-foreground whitespace-pre-wrap wrap-anywhere">
        {current.spec.target}
      </Dialog.Description>
      <h2 className="mb-5 mt-7 text-lg font-semibold">Activity</h2>
      {data.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Memuat aktivitas…
        </p>
      )}
      {data.isError && (
        <p role="alert" className="text-sm text-danger">
          Aktivitas belum tersinkron.{" "}
          <button type="button" className="underline" onClick={() => void data.refetch()}>
            Coba lagi
          </button>
        </p>
      )}
      {history.map((item, index) => {
        const date = new Date(item.createdAt);
        const day = date.toLocaleDateString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
        const heading = day !== previousDay;
        previousDay = day;
        return (
          <div key={item.id}>
            {heading && (
              <p className="mb-4 mt-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {date.toDateString() === new Date().toDateString() ? "Today" : day}
              </p>
            )}
            <div
              className={`relative flex gap-4 pb-5 before:absolute before:bottom-0 before:left-[8px] before:top-6 before:border-l before:border-dotted before:border-border ${index === history.length - 1 ? "before:hidden" : ""}`}
            >
              <CheckCircle2 className="mt-1 size-[17px] shrink-0 text-success-foreground" />
              <div className="min-w-0 text-sm text-muted-foreground">
                <p className="font-medium">{item.title}</p>
                <p className="mt-1 whitespace-pre-wrap leading-[1.5] wrap-anywhere">
                  {item.description}
                </p>
              </div>
            </div>
          </div>
        );
      })}
      {!data.isPending && !data.isError && !history.length && (
        <p className="text-sm text-muted-foreground">Belum ada aktivitas tercatat.</p>
      )}
    </>
  );
}
