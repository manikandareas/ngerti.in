import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PanelRight } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { base, command, submit } from "@/features/direct-messages/client";
import type { Thread } from "@/features/direct-messages/state";
import { api } from "@/lib/api";
import { AgentAvatar } from "./agent-avatar";
import { type Agent, ContextualAgentEditor } from "./agents-page";
export function ThreadInfo({ thread, refresh }: { thread: Thread; refresh: () => void }) {
  const { getToken, userId } = useAuth();
  const cache = useQueryClient();
  const [editing, setEditing] = useState<Agent | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{ signature: string; body: object } | null>(null);
  const agents = useQuery({
    queryKey: ["membership-agents", userId],
    enabled: open && thread.kind === "group",
    queryFn: async () => {
      const token = await getToken();
      const items: Agent[] = [];
      let after: string | null = null;
      do {
        const page: { items: Agent[]; next_cursor: string | null } = await api(
          `${base}/agents${after ? `?after=${encodeURIComponent(after)}` : ""}`,
          token,
        );
        items.push(...page.items);
        after = page.next_cursor;
      } while (after);
      return items;
    },
  });
  async function change(type: string, agentId: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    const signature = `${type}:${agentId}:${thread.membership_revision}`;
    if (pending.current?.signature !== signature)
      pending.current = {
        signature,
        body: {
          ...command(type, { thread_id: thread.thread_id, agent_id: agentId }),
          expected_revision: thread.membership_revision,
        },
      };
    try {
      await submit(pending.current.body, await getToken());
      pending.current = null;
      void cache.invalidateQueries({
        queryKey: ["navigation-group-members", userId, thread.thread_id],
      });
      refresh();
    } catch {
      setError(
        "Perubahan belum terkonfirmasi. Jika anggota berubah di tab lain, muat ulang sebelum mencoba kembali.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (editing)
    return (
      <ContextualAgentEditor
        agent={editing}
        onClose={() => {
          setEditing(null);
          void cache.invalidateQueries({
            queryKey: ["navigation-group-members", userId, thread.thread_id],
          });
          refresh();
        }}
      />
    );
  if (thread.kind === "dm") {
    const agent = thread.agents[0];
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Info agent" title="Info agent">
            <PanelRight className="size-4" />
          </Button>
        </SheetTrigger>
        <SheetContent
          overlayClassName="lg:hidden"
          data-context-editor="true"
          className="gap-5 border-0 p-5 data-[side=right]:w-full data-[side=right]:sm:max-w-[360px]"
        >
          <SheetHeader className="px-0 pr-10">
            <SheetTitle>Info agent</SheetTitle>
            <SheetDescription className="sr-only">Profil dan karakter agent.</SheetDescription>
          </SheetHeader>
          {agent && (
            <>
              <div className="flex flex-col items-center gap-2 text-center">
                <AgentAvatar
                  name={agent.display_name}
                  url={agent.config.avatar_url}
                  className="size-14"
                />
                <h2 className="text-base font-medium">{agent.display_name}</h2>
                <p className="text-xs text-muted-foreground">@{agent.handle}</p>
                {agent.status !== "active" && (
                  <p className="text-sm text-muted-foreground">Tidak tersedia</p>
                )}
              </div>
              <Button
                variant="secondary"
                disabled={agent.status === "archived"}
                onClick={() => {
                  setOpen(false);
                  setEditing(agent);
                }}
              >
                Edit agent
              </Button>
              {agent.config.soul && (
                <details className="space-y-2 border-t pt-4">
                  <summary className="cursor-pointer text-sm font-medium">Karakter</summary>
                  <p className="whitespace-pre-wrap text-sm wrap-anywhere">{agent.config.soul}</p>
                </details>
              )}
              <Button asChild variant="ghost">
                <Link to="/agents">Kelola agent dan grup</Link>
              </Button>
            </>
          )}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={thread.kind === "group" ? "Anggota" : "Info agent"}
          title={thread.kind === "group" ? "Anggota" : "Info agent"}
        >
          <PanelRight className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-[20px] sm:max-w-[480px] [background:var(--app-shell-fill)]">
        <DialogHeader className="items-center pt-5 text-center">
          <DialogTitle>{thread.title}</DialogTitle>
          <DialogDescription>
            {thread.kind === "group"
              ? `Kamu dan ${thread.agents.length} agent.`
              : "Identitas agent sama di DM dan grup. Riwayat DM tetap privat."}
          </DialogDescription>
        </DialogHeader>
        {thread.agents.map((agent) => (
          <div
            key={agent.agent_id}
            className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-3"
          >
            <AgentAvatar name={agent.display_name} url={agent.config.avatar_url} />
            <div className="min-w-0 flex-1 basis-20 wrap-anywhere">
              <p className="font-medium">{agent.display_name}</p>
              <p className="text-xs text-muted-foreground">
                @{agent.handle} · {agent.status === "active" ? "Aktif" : "Tidak tersedia"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={agent.status === "archived"}
              onClick={() => {
                setOpen(false);
                setEditing(agent);
              }}
            >
              Edit
            </Button>
            {thread.kind === "group" && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || thread.status !== "open"}
                onClick={() => void change("member.remove", agent.agent_id)}
              >
                Keluarkan
              </Button>
            )}
          </div>
        ))}
        {thread.kind === "group" && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Tambahkan agent</h3>
            {agents.isPending && <p role="status">Memuat agent…</p>}
            {agents.error && (
              <Button variant="outline" onClick={() => void agents.refetch()}>
                Coba muat agent lagi
              </Button>
            )}
            {agents.data
              ?.filter(
                (agent) =>
                  agent.status === "active" &&
                  !thread.agents.some((member) => member.agent_id === agent.agent_id),
              )
              .map((agent) => (
                <Button
                  key={agent.agent_id}
                  variant="outline"
                  className="mr-2 h-auto min-h-9 max-w-full whitespace-normal text-left"
                  disabled={busy || thread.agents.length >= 6 || thread.status !== "open"}
                  onClick={() => void change("member.add", agent.agent_id)}
                >
                  Tambah {agent.display_name}
                </Button>
              ))}
          </div>
        )}
        {error && (
          <div role="alert" className="text-sm text-destructive-foreground">
            <p>{error}</p>
            <Button variant="outline" onClick={refresh}>
              Muat ulang anggota
            </Button>
          </div>
        )}
        <Button asChild variant="outline">
          <Link to="/agents">Kelola agent</Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
