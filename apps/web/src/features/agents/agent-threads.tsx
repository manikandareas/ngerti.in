import { useAuth } from "@clerk/tanstack-react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { NativeChoice } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { api } from "@/lib/api";
import { AgentAvatar } from "./agent-avatar";
import type { Agent } from "./agents-page";

type Thread = { thread_id: string; kind: "dm" | "group"; title: string; agents: Agent[] };
type Page = { items: Omit<Thread, "agents">[]; next_cursor: string | null };
const base = "/api/agent-engine/v1";

export function AgentThreads({ agents, edit }: { agents: Agent[]; edit: (agent: Agent) => void }) {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<Page["items"]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Thread | null>(null);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"dm" | "group">("dm");
  const [title, setTitle] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ signature: string; body: string } | null>(null);
  const load = useCallback(async () => {
    const token = await getToken();
    let page = await api<Page>(`${base}/threads`, token);
    const items = [...page.items];
    while (page.next_cursor) {
      page = await api<Page>(`${base}/threads?after=${page.next_cursor}`, token);
      items.push(...page.items);
    }
    setThreads(items);
  }, [getToken]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let current = true;
    setDetail(null);
    void getToken()
      .then((token) => api<Thread>(`${base}/threads/${selected}`, token))
      .then((value) => {
        if (current) setDetail(value);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [selected, getToken]);
  async function create() {
    if (busy) return;
    setBusy(true);
    setError("");
    const payload = { kind, title, agent_ids: members };
    const signature = JSON.stringify(payload);
    if (pending.current?.signature !== signature)
      pending.current = {
        signature,
        body: JSON.stringify({
          schema_version: "nma.v1",
          command_id: crypto.randomUUID(),
          type: "thread.create",
          expected_revision: null,
          payload,
        }),
      };
    try {
      const result = await api<{ thread: Thread }>(`${base}/commands`, await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: pending.current.body,
      });
      pending.current = null;
      setCreating(false);
      await load();
      await navigate({
        to: "/conversations/$threadId",
        params: { threadId: result.thread.thread_id },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Belum dapat disimpan. Coba kembali.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 border-t pt-8" aria-label="DM dan grup">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">DM dan grup</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Lanjutkan DM atau kelola susunan agent dalam grup.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setCreating(true);
            setStep(1);
            setSearch("");
            setError("");
            setTitle("");
            setMembers([]);
            setKind("dm");
          }}
        >
          Siapkan percakapan
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {threads.length === 0 && (
        <p className="text-sm text-muted-foreground">Belum ada DM atau grup.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {threads.map((thread) =>
          thread.kind === "dm" ? (
            <Button
              key={thread.thread_id}
              asChild
              variant="outline"
              className="h-auto min-h-12 justify-start whitespace-normal p-4 text-left"
            >
              <Link to="/conversations/$threadId" params={{ threadId: thread.thread_id }}>
                DM · {thread.title}
              </Link>
            </Button>
          ) : (
            <Button
              key={thread.thread_id}
              variant="outline"
              className="h-auto justify-start whitespace-normal p-4 text-left"
              onClick={() => {
                setError("");
                void navigate({
                  to: "/conversations/$threadId",
                  params: { threadId: thread.thread_id },
                });
              }}
            >
              Grup · {thread.title}
            </Button>
          ),
        )}
      </div>
      <Dialog
        open={creating}
        onOpenChange={(open) => {
          if (!busy) setCreating(open);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-[20px] sm:max-w-[480px] [background:var(--app-shell-fill)]">
          <DialogHeader>
            <DialogTitle>{step === 1 ? "Pilih agent" : "Detail percakapan"}</DialogTitle>
            <DialogDescription>
              Pilih satu agent untuk DM atau 2–6 agent untuk grup. Semua menggunakan profil agent
              yang sudah kamu simpan.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (step === 1) setStep(2);
              else void create();
            }}
          >
            <fieldset disabled={busy} className="space-y-4">
              <label className={step === 1 ? "block space-y-2 text-sm" : "hidden"}>
                Jenis
                <NativeSelect
                  className="h-10 w-full rounded-md border bg-background px-3"
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as "dm" | "group");
                    setMembers([]);
                  }}
                >
                  <option value="dm">DM</option>
                  <option value="group">Grup</option>
                </NativeSelect>
              </label>
              <label
                htmlFor="thread-title"
                className={step === 2 ? "block space-y-2 text-sm" : "hidden"}
              >
                Nama percakapan
                <Input
                  id="thread-title"
                  required={step === 2}
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <fieldset hidden={step !== 1} className="space-y-3">
                <legend className="mb-2 text-sm font-medium">Agent</legend>
                <Input
                  aria-label="Cari agent"
                  placeholder="Cari agent"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {agents
                  .filter(
                    (a) =>
                      a.status === "active" &&
                      `${a.display_name} ${a.handle}`.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((agent) => (
                    <label key={agent.agent_id} className="flex items-center gap-3 text-sm">
                      <NativeChoice
                        type={kind === "dm" ? "radio" : "checkbox"}
                        name="thread-members"
                        checked={members.includes(agent.agent_id)}
                        onChange={(e) =>
                          setMembers(
                            kind === "dm"
                              ? [agent.agent_id]
                              : e.target.checked
                                ? [...members, agent.agent_id]
                                : members.filter((id) => id !== agent.agent_id),
                          )
                        }
                      />
                      <AgentAvatar
                        name={agent.display_name}
                        url={agent.config.avatar_url}
                        className="size-6 text-xs"
                      />
                      {agent.display_name}{" "}
                      <span className="text-muted-foreground">@{agent.handle}</span>
                    </label>
                  ))}
              </fieldset>
            </fieldset>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {step === 2 && (
              <>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Agent · {members.length}</p>
                  {agents
                    .filter((agent) => members.includes(agent.agent_id))
                    .map((agent) => (
                      <div
                        key={agent.agent_id}
                        className="flex items-center gap-3 rounded-lg bg-background/50 p-3"
                      >
                        <AgentAvatar
                          name={agent.display_name}
                          url={agent.config.avatar_url}
                          className="size-8 text-sm"
                        />
                        <span className="text-sm">{agent.display_name}</span>
                      </div>
                    ))}
                </div>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setStep(1)}>
                  Kembali
                </Button>
              </>
            )}
            <Button
              type="submit"
              disabled={
                busy ||
                (kind === "dm" ? members.length !== 1 : members.length < 2 || members.length > 6)
              }
            >
              {busy ? "Menyimpan…" : step === 1 ? "Lanjut" : "Buat percakapan"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-[20px] sm:max-w-[480px] [background:var(--app-shell-fill)]">
          <DialogHeader>
            <DialogTitle>
              {detail
                ? `${detail.kind === "dm" ? "DM" : "Grup"} · ${detail.title}`
                : error
                  ? "Percakapan belum dapat dimuat"
                  : "Memuat percakapan…"}
            </DialogTitle>
            <DialogDescription>
              Profil agent diperbarui bersama di DM dan grup. Riwayat tiap percakapan tetap
              terpisah.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error} Tutup dan coba buka kembali.
            </p>
          )}
          {detail?.agents.map((agent) => (
            <article key={agent.agent_id} className="space-y-2 rounded-xl border p-4">
              <div className="flex items-center gap-3">
                <AgentAvatar
                  name={agent.display_name}
                  url={agent.config.avatar_url}
                  className="size-8 text-sm"
                />
                <h3 className="font-medium">{agent.display_name}</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                @{agent.handle} ·{" "}
                {agent.status === "active"
                  ? "Aktif"
                  : agent.status === "archived"
                    ? "Diarsipkan"
                    : "Dinonaktifkan"}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">{agent.config.soul}</p>
              <Button
                variant="outline"
                disabled={agent.status === "archived"}
                onClick={() => {
                  setSelected(null);
                  edit(agent);
                }}
              >
                Edit {agent.display_name}
              </Button>
            </article>
          ))}
          <p className="text-sm text-muted-foreground">Profil agent tetap sama di DM dan grup.</p>
        </DialogContent>
      </Dialog>
    </section>
  );
}
