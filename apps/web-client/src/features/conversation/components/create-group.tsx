import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef, useState } from "react";
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
import { ApiError, durableCommand } from "@/lib/api-client";
import type { Agent, Thread } from "@/types/workspace";
import { AgentAvatar } from "./identity";

type GroupDraft = { name: string; member_agent_ids: string[] };
function savedDraft(): GroupDraft | null {
  try {
    const value = JSON.parse(localStorage.getItem("ngertiin:pending:create-group") ?? "null");
    return value?.body ?? null;
  } catch {
    return null;
  }
}
export function CreateGroup({
  agents,
  open,
  onOpenChange,
  created,
}: {
  agents: Agent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  created: (thread: Thread) => Promise<void>;
}) {
  const [initial] = useState(savedDraft);
  const [name, setName] = useState(initial?.name ?? "");
  const [members, setMembers] = useState<string[]>(initial?.member_agent_ids ?? []);
  const [pending, setPending] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setPending(true);
    try {
      const result = await durableCommand<{ thread: Thread }>(
        "create-group",
        "/v1/creation/groups",
        { name: name.trim(), member_agent_ids: members },
      );
      await created(result.thread);
      setName("");
      setMembers([]);
      setPending(false);
      onOpenChange(false);
    } catch (e) {
      setPending(!!savedDraft());
      setError(
        e instanceof ApiError && ["SCOPE_DENIED", "NOT_FOUND"].includes(e.code)
          ? "Akses anggota berubah. Periksa pilihan anggota lalu coba lagi."
          : e instanceof Error
            ? e.message
            : "Grup belum dapat dibuat.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="creation-dialog-overlay"
        className="max-h-[85svh] w-[340px] max-w-[calc(100%-32px)] gap-3 overflow-y-auto rounded-2xl border-border/50 bg-card p-4 sm:max-w-[340px]"
      >
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Create group</DialogTitle>
          <DialogDescription className="sr-only">
            Beri nama dan pilih agent. Satu anggota akan memandu percakapan.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="group-name" className="sr-only">
              Nama grup
            </Label>
            <Input
              id="group-name"
              placeholder="Nama grup"
              className="h-9 border-0 bg-secondary/70 px-3 text-[14px] dark:bg-secondary/70"
              value={name}
              maxLength={200}
              disabled={pending || busy}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <fieldset disabled={pending || busy} className="max-h-64 space-y-0.5 overflow-y-auto">
            <legend className="sr-only">Anggota</legend>
            {agents.map((a) => (
              <label
                key={a.id}
                className="relative flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-secondary/50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
              >
                <input
                  type="checkbox"
                  className="absolute right-2 size-[18px] cursor-pointer opacity-0"
                  aria-label={a.name}
                  checked={members.includes(a.id)}
                  onChange={(e) =>
                    setMembers((current) =>
                      e.target.checked ? [...current, a.id] : current.filter((id) => id !== a.id),
                    )
                  }
                />
                <AgentAvatar
                  agent={a}
                  deferred
                  state="idle"
                  className="size-7 rounded-lg text-xs"
                />
                <span className="min-w-0 flex-1 truncate text-[14px]">{a.name}</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none grid size-[18px] shrink-0 place-items-center rounded-full border ${members.includes(a.id) ? "border-primary bg-primary text-primary-foreground" : "border-border/60"}`}
                >
                  {members.includes(a.id) && <HugeiconsIcon icon={Tick02Icon} size={12} />}
                </span>
              </label>
            ))}
          </fieldset>
          {pending && !busy && (
            <p className="text-sm text-muted-foreground">
              Periksa operasi yang sama untuk memastikan hasilnya. Pilihan tersimpan sampai
              pembuatan terkonfirmasi.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="h-9 w-full rounded-lg text-[14px] font-medium"
            disabled={busy || !name.trim() || !members.length}
          >
            {busy ? "Memeriksa…" : pending ? "Periksa pembuatan grup" : "Buat grup"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
