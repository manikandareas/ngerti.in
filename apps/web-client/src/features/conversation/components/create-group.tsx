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
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create group</DialogTitle>
          <DialogDescription>
            Beri nama dan pilih agent. Satu anggota akan memandu percakapan.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="group-name">Nama grup</Label>
            <Input
              id="group-name"
              value={name}
              maxLength={200}
              disabled={pending || busy}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <fieldset disabled={pending || busy} className="space-y-1">
            <legend className="mb-2 text-sm font-medium">Anggota</legend>
            {agents.map((a) => (
              <label
                key={a.id}
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-muted"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  aria-label={a.name}
                  checked={members.includes(a.id)}
                  onChange={(e) =>
                    setMembers((current) =>
                      e.target.checked ? [...current, a.id] : current.filter((id) => id !== a.id),
                    )
                  }
                />
                <AgentAvatar agent={a} className="size-8 rounded-lg text-xs" />
                <span className="min-w-0 truncate">{a.name}</span>
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
            className="w-full"
            disabled={busy || !name.trim() || !members.length}
          >
            {busy ? "Memeriksa…" : pending ? "Periksa pembuatan grup" : "Buat grup"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
