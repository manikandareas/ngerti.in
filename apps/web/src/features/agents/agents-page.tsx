import { useAuth } from "@clerk/tanstack-react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { NativeChoice } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { command } from "@/features/direct-messages/client";
import type { Thread } from "@/features/direct-messages/state";
import { api } from "@/lib/api";
import { AgentAvatar } from "./agent-avatar";
import { AgentThreads } from "./agent-threads";
import {
  type InferenceSettings,
  InferenceSettingsEditor,
  type ModelOption,
} from "./inference-settings";
import { PersonalityPresets } from "./personality-presets";
import { PortableImport } from "./portable-import";
import { type SessionSettings, SessionSettingsEditor } from "./session-settings";

type CapabilityField = "tool_grants" | "mcp_grants" | "skill_refs";
type CapabilityOption = {
  id: string;
  label: string;
  runtime_ready?: boolean;
  reason?: string | null;
  requires?: string[];
};
type Config = {
  soul: string;
  instructions: string;
  model: string;
  avatar_url?: string;
  inference?: InferenceSettings;
  session?: SessionSettings;
} & Partial<Record<CapabilityField, string[]>>;
const capabilityLabels: Record<CapabilityField, string> = {
  tool_grants: "Tools",
  mcp_grants: "Koneksi MCP",
  skill_refs: "Skills",
};
const capabilityReasons: Record<string, string> = {
  not_installed: "tools belum terpasang",
  execution_surface_required: "lingkungan eksekusi belum disiapkan operator",
  dependency_unconfigured: "kemampuan pendukung belum dikonfigurasi",
  configuration_required: "konfigurasi layanan belum lengkap",
  native_prerequisite_failed: "prasyarat tools belum tersedia",
  immutable_native_image_required: "image eksekusi perlu dikunci versinya",
  native_image_not_installed: "image eksekusi belum terpasang",
  native_image_mismatch: "image eksekusi tidak sesuai konfigurasi",
  native_image_contract_mismatch: "image eksekusi tidak sesuai versi runtime",
  private_schema: "konfigurasi tools perlu diperiksa operator",
  research_credentials_required: "layanan riset belum dihubungkan",
  native_file_tools_required: "kemampuan baca file pada ruang kerja perlu disiapkan",
  xai_access_required: "akses xAI belum dihubungkan",
};
export type Agent = {
  agent_id: string;
  display_name: string;
  handle: string;
  status: "active" | "disabled" | "archived";
  revision: string;
  config_revision: string;
  config: Config;
};
type Listing = {
  items: Agent[];
  models: ModelOption[];
  next_cursor: string | null;
  capabilities?: Record<
    CapabilityField,
    {
      id: string;
      label: string;
      runtime_ready?: boolean;
      reason?: string | null;
      requires?: string[];
    }[]
  >;
};
type Draft = { display_name: string; handle: string; config: Config };
const empty: Draft = {
  display_name: "",
  handle: "",
  config: { soul: "", instructions: "", model: "" },
};
const statusLabels = { active: "Aktif", disabled: "Dinonaktifkan", archived: "Diarsipkan" };
const base = "/api/agent-engine/v1";

export function AgentsPage() {
  return <AgentManagement />;
}
export function ContextualAgentEditor({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  return <AgentManagement initialAgent={agent} onClose={onClose} />;
}
function AgentManagement({
  initialAgent,
  onClose,
}: {
  initialAgent?: Agent;
  onClose?: () => void;
}) {
  const Container = Fragment;
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [opening, setOpening] = useState<string | null>(null);
  const openingLock = useRef(false);
  const dmCommands = useRef(new Map<string, ReturnType<typeof command>>());
  async function openDm(agent: Agent) {
    if (openingLock.current) return;
    openingLock.current = true;
    setOpening(agent.agent_id);
    setError("");
    try {
      const token = await getToken();
      const body =
        dmCommands.current.get(agent.agent_id) ??
        command("thread.ensure_dm", { agent_id: agent.agent_id });
      dmCommands.current.set(agent.agent_id, body);
      const result = await api<{ thread: Thread }>(`${base}/agents/${agent.agent_id}/dm`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const id = result.thread.thread_id;
      await navigate({ to: "/conversations/$threadId", params: { threadId: id } });
    } catch {
      setError("DM belum dapat dibuka. Coba buka kembali.");
    } finally {
      openingLock.current = false;
      setOpening(null);
    }
  }
  const [data, setData] = useState<Listing | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(!!initialAgent);
  const [selected, setSelected] = useState<Agent | null>(initialAgent ?? null);
  const [draft, setDraft] = useState<Draft>(
    initialAgent
      ? {
          display_name: initialAgent.display_name,
          handle: initialAgent.handle,
          config: { ...initialAgent.config },
        }
      : empty,
  );
  const [archived, setArchived] = useState(false);
  const pending = useRef<{ signature: string; body: string } | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      let result = await api<Listing>(`${base}/agents`, token);
      const items = [...result.items];
      while (result.next_cursor) {
        result = await api<Listing>(`${base}/agents?after=${result.next_cursor}`, token);
        items.push(...result.items);
      }
      setData({ ...result, items });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Agent belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);
  useEffect(() => {
    void load();
  }, [load]);

  function edit(agent: Agent | null) {
    setSelected(agent);
    setDraft(
      agent
        ? { display_name: agent.display_name, handle: agent.handle, config: { ...agent.config } }
        : { ...empty, config: { ...empty.config, model: data?.models[0]?.id ?? "" } },
    );
    setError("");
    setNotice("");
    setOpen(true);
  }
  async function mutate(type: string, payload: object, revision: string | null) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const signature = JSON.stringify({ type, payload, revision });
    if (pending.current?.signature !== signature) {
      pending.current = {
        signature,
        body: JSON.stringify({
          schema_version: "nma.v1",
          command_id: crypto.randomUUID(),
          type,
          expected_revision: revision,
          payload,
        }),
      };
    }
    try {
      await api(`${base}/commands`, await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: pending.current.body,
      });
      pending.current = null;
      setOpen(false);
      onClose?.();
      setNotice(
        type === "agent.archive"
          ? "Agent diarsipkan. Identitas dan riwayatnya tetap tersimpan."
          : "Perubahan agent tersimpan.",
      );
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Perubahan belum terkonfirmasi. Coba simpan kembali.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Container>
      {!initialAgent && (
        <div className="mx-auto max-w-3xl space-y-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold">Agent</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Pilih agent untuk melanjutkan percakapan atau buat agent baru.
              </p>
            </div>
            <Button disabled={loading || !data?.models.length} onClick={() => edit(null)}>
              Buat agent
            </Button>
          </header>
          {data && data.models.length === 0 && (
            <p role="status" className="text-sm text-muted-foreground">
              Hubungkan provider dan pilih model untuk menggunakan agent.{" "}
              <Link to="/connections" className="underline underline-offset-4">
                Tambahkan koneksi model
              </Link>
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-xl border p-4 text-sm">
              {notice}
            </p>
          )}
          {error && !open && (
            <div role="alert" className="space-y-3 rounded-xl border p-4 text-sm">
              <p>{error}</p>
              <Button variant="outline" onClick={() => void load()}>
                Muat ulang
              </Button>
            </div>
          )}
          <PortableImport />
          <div className="flex gap-2">
            <Button variant={!archived ? "secondary" : "ghost"} onClick={() => setArchived(false)}>
              Agent aktif
            </Button>
            <Button variant={archived ? "secondary" : "ghost"} onClick={() => setArchived(true)}>
              Arsip
            </Button>
          </div>
          {loading ? (
            <p role="status">Memuat agent…</p>
          ) : (
            data && (
              <div className="space-y-3">
                {!data.items.some((a) => (a.status === "archived") === archived) && (
                  <div className="rounded-2xl border border-dashed px-6 py-12 text-center">
                    <h2 className="font-medium">
                      {archived ? "Belum ada agent di arsip" : "Mulai dengan satu agent"}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {archived
                        ? "Agent yang kamu arsipkan akan muncul di sini."
                        : "Beri nama, tentukan karakter, lalu pilih modelnya."}
                    </p>
                  </div>
                )}
                {data.items
                  .filter((a) => (a.status === "archived") === archived)
                  .map((agent) => (
                    <article
                      key={agent.agent_id}
                      className="flex flex-wrap items-center justify-between gap-4 border-b px-2 py-4"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <AgentAvatar name={agent.display_name} url={agent.config.avatar_url} />
                        <div className="min-w-0">
                          <h2 className="break-words text-base font-medium">
                            {agent.display_name}
                          </h2>
                          <p className="text-sm text-muted-foreground">
                            @{agent.handle} · {statusLabels[agent.status]}
                          </p>
                        </div>
                      </div>
                      {agent.status === "archived" ? (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              "agent.restore",
                              { agent_id: agent.agent_id, status: "active" },
                              agent.revision,
                            )
                          }
                        >
                          Pulihkan {agent.display_name}
                        </Button>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={opening !== null || agent.status !== "active"}
                            onClick={() => void openDm(agent)}
                            aria-label={`Buka DM ${agent.display_name}`}
                          >
                            {opening === agent.agent_id ? "Membuka…" : "Buka DM"}
                          </Button>
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => edit(agent)}
                            aria-label={`Edit ${agent.display_name}`}
                          >
                            Edit
                          </Button>
                        </div>
                      )}
                    </article>
                  ))}
              </div>
            )
          )}
          {data && <AgentThreads agents={data.items} edit={edit} />}
        </div>
      )}
      <Sheet
        open={open}
        onOpenChange={(value) => {
          if (!busy) {
            setOpen(value);
            if (!value) onClose?.();
          }
        }}
      >
        <SheetContent
          side="right"
          overlayClassName="lg:hidden"
          data-context-editor="true"
          className="gap-4 border-0 p-5 data-[side=right]:w-full data-[side=right]:sm:max-w-[360px] [background:var(--app-shell-fill)]"
        >
          <SheetHeader className="px-0 pt-8">
            <SheetTitle>{selected ? `Edit ${selected.display_name}` : "Buat agent"}</SheetTitle>
            <SheetDescription>Atur nama dan karakter agent.</SheetDescription>
          </SheetHeader>
          <form
            className="space-y-4 rounded-2xl bg-background/70 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void mutate(
                selected ? "agent.configure" : "agent.create",
                { ...draft, ...(selected ? { agent_id: selected.agent_id } : {}) },
                selected?.revision ?? null,
              );
            }}
          >
            <fieldset disabled={busy} className="space-y-4">
              <label htmlFor="agent-name" className="block space-y-2 text-sm">
                Nama
                <Input
                  id="agent-name"
                  required
                  maxLength={80}
                  value={draft.display_name}
                  onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
                />
              </label>
              <label htmlFor="agent-handle" className="block space-y-2 text-sm">
                Handle
                <Input
                  id="agent-handle"
                  aria-label="Handle"
                  required
                  pattern="[a-z][a-z0-9_-]{0,39}"
                  maxLength={40}
                  placeholder="researcher"
                  value={draft.handle}
                  onChange={(e) => setDraft({ ...draft, handle: e.target.value })}
                />
                <span className="block text-xs text-muted-foreground">
                  Huruf kecil, angka, garis bawah, atau tanda hubung. Awali dengan huruf.
                </span>
              </label>
              <PersonalityPresets
                onSelect={(soul) => setDraft({ ...draft, config: { ...draft.config, soul } })}
              />
              <label htmlFor="agent-soul" className="block space-y-2 text-sm">
                Karakter
                <Textarea
                  id="agent-soul"
                  className="min-h-28 max-h-48 overflow-y-auto"
                  rows={3}
                  maxLength={16000}
                  placeholder="Teliti, ingin tahu, dan menjelaskan sumber dengan jelas."
                  value={draft.config.soul}
                  onChange={(e) =>
                    setDraft({ ...draft, config: { ...draft.config, soul: e.target.value } })
                  }
                />
              </label>
              <details className="rounded-lg border p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  Lanjutan · Model dan kemampuan
                </summary>
                <div className="mt-4 space-y-4">
                  <label htmlFor="agent-instructions" className="block space-y-2 text-sm">
                    Instruksi
                    <Textarea
                      id="agent-instructions"
                      className="min-h-28 max-h-48 overflow-y-auto"
                      rows={3}
                      maxLength={16000}
                      placeholder="Cara kerja dan hal yang perlu diperhatikan agent."
                      value={draft.config.instructions}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          config: { ...draft.config, instructions: e.target.value },
                        })
                      }
                    />
                  </label>
                  <Link to="/connections" className="text-sm underline underline-offset-4">
                    Hubungkan atau perbaiki akun model
                  </Link>
                  <label className="block space-y-2 text-sm">
                    Model
                    <NativeSelect
                      id="agent-model"
                      className="h-10 w-full rounded-md border bg-background px-3"
                      required
                      value={draft.config.model}
                      onChange={(e) =>
                        setDraft({ ...draft, config: { ...draft.config, model: e.target.value } })
                      }
                    >
                      {!data?.models.some((model) => model.id === draft.config.model) && (
                        <option value={draft.config.model}>
                          Model belum tersedia — hubungkan akun
                        </option>
                      )}
                      {data?.models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                  <InferenceSettingsEditor
                    value={draft.config.inference}
                    primary={draft.config.model}
                    models={data?.models ?? []}
                    onChange={(inference) =>
                      setDraft({ ...draft, config: { ...draft.config, inference } })
                    }
                  />
                  <SessionSettingsEditor
                    value={draft.config.session}
                    onChange={(session) =>
                      setDraft({ ...draft, config: { ...draft.config, session } })
                    }
                  />
                  <details className="rounded-lg border p-4">
                    <summary className="cursor-pointer text-sm font-medium">
                      Kemampuan agent
                    </summary>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Pilih tools, koneksi, dan skills untuk agent ini. Mencabut kemampuan
                      menghentikan pekerjaan yang masih memakai akses tersebut.
                    </p>
                    {(Object.keys(capabilityLabels) as CapabilityField[]).map((field) => {
                      const assigned = draft.config[field] ?? [];
                      const available = data?.capabilities?.[field] ?? [];
                      const options: CapabilityOption[] = [
                        ...available,
                        ...assigned
                          .filter((id) => !available.some((item) => item.id === id))
                          .map((id) => ({ id, label: `${id} (tidak tersedia)` })),
                      ];
                      return (
                        <fieldset key={field} className="mt-4 space-y-2">
                          <legend className="text-sm font-medium">{capabilityLabels[field]}</legend>
                          {options.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                              Belum ada yang tersedia.
                            </p>
                          )}
                          {options.map((item) => (
                            <label key={item.id} className="flex items-center gap-2 text-sm">
                              <NativeChoice
                                type="checkbox"
                                checked={assigned.includes(item.id)}
                                disabled={
                                  "runtime_ready" in item &&
                                  item.runtime_ready === false &&
                                  !assigned.includes(item.id)
                                }
                                onChange={(event) =>
                                  setDraft({
                                    ...draft,
                                    config: {
                                      ...draft.config,
                                      [field]: event.target.checked
                                        ? [...assigned, item.id]
                                        : assigned.filter((id) => id !== item.id),
                                    },
                                  })
                                }
                              />
                              <span>
                                {item.label}
                                {"runtime_ready" in item && item.runtime_ready === false && (
                                  <span className="block text-xs text-muted-foreground">
                                    Belum siap:{" "}
                                    {capabilityReasons[item.reason ?? ""] ??
                                      "konfigurasi perlu diperiksa operator"}
                                  </span>
                                )}
                                {"requires" in item &&
                                  item.requires &&
                                  item.requires.length > 0 && (
                                    <span className="block text-xs text-muted-foreground">
                                      Memerlukan: {item.requires.join(", ")}
                                    </span>
                                  )}
                              </span>
                            </label>
                          ))}
                        </fieldset>
                      );
                    })}
                  </details>
                </div>
              </details>
            </fieldset>
            {error && (
              <div role="alert" className="space-y-2 text-sm text-destructive-foreground">
                <p>{error}</p>
                <p>
                  Jika konfigurasi telah berubah, tutup editor dan muat ulang sebelum mengedit lagi.
                </p>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              {selected && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  className="mr-auto"
                  onClick={() =>
                    void mutate("agent.archive", { agent_id: selected.agent_id }, selected.revision)
                  }
                >
                  Arsipkan
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  onClose?.();
                }}
              >
                Batal
              </Button>
              <Button type="submit" disabled={busy || !draft.config.model}>
                {busy ? "Menyimpan…" : "Simpan agent"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </Container>
  );
}
