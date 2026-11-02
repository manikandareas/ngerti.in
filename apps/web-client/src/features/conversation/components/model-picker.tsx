import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  KeyRound,
  Loader2,
  LogIn,
  RefreshCw,
  Search,
  Settings,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  type ModelMenuTypeahead,
  modelMenuKey,
  modelMenuPointerMove,
} from "@/features/conversation/components/model-picker-keys";
import { billingLabel, ProviderMark } from "@/features/settings/components/shared";
import { ApiError, command, request } from "@/lib/api-client";
import { repairMessage } from "@/lib/api-errors";
import { cn } from "@/lib/utils";
import type { Agent, Connection } from "@/types/workspace";

// OpenMausBot 0.1.137: SimpleModelMenu.tsx, ModelPicker.tsx and menu-recipe.ts.
// Rows retain Ngertiin's account, billing and revision-aware configuration contract.
const row =
  "group flex min-h-[30px] w-full min-w-0 shrink-0 items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] leading-[18px] text-foreground hover:bg-menu-hover focus-visible:bg-menu-hover active:bg-menu-active disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent touch:min-h-10";
const meta = "min-w-0 max-w-full truncate text-[12px] leading-4 text-(--text-tertiary)";
const gutter = "flex size-4 shrink-0 items-center justify-center";
const separator = "mx-2 my-[5px] h-[0.5px] shrink-0 bg-foreground/10";

function accountGroups(
  connections: Connection[],
  agent: Agent | undefined,
  term: string,
  expanded: ReadonlySet<string>,
) {
  const ordered = connections
    .filter((connection) => connection.state === "active" || connection.id === agent?.connection_id)
    .sort(
      (first, second) =>
        Number(second.id === agent?.connection_id) - Number(first.id === agent?.connection_id) ||
        Number(first.authentication.billing_source === "api_key") -
          Number(second.authentication.billing_source === "api_key"),
    );
  return ordered.flatMap((connection) => {
    const ready = connection.state === "active" && connection.login === "authenticated";
    const accountMatches =
      `${providerName(connection)} ${billingLabel(connection.authentication.billing_source)}`
        .toLocaleLowerCase()
        .includes(term);
    const available = connection.models.filter((model) =>
      term
        ? accountMatches || model.id.toLocaleLowerCase().includes(term)
        : connection.id !== agent?.connection_id || model.id !== agent.model_id,
    );
    if (term && (!ready || (!accountMatches && available.length === 0))) return [];
    // Simple mode shows the selected model above four alternatives; other accounts get three.
    // A single remaining option is shown directly instead of adding a disclosure for one row.
    const limit = connection.id === agent?.connection_id ? 4 : 3;
    const hasMore = ready && !term && available.length - limit > 1;
    const isExpanded = hasMore && expanded.has(connection.id);
    if (!term && ready && connection.models.length > 0 && available.length === 0) return [];
    return [
      {
        connection,
        choices: hasMore && !isExpanded ? available.slice(0, limit) : available,
        toggle: hasMore ? (isExpanded ? ("less" as const) : ("more" as const)) : null,
      },
    ];
  });
}

function Mark({ connection }: { connection?: Connection }) {
  return connection ? (
    <span className="inline-flex shrink-0 [&>span]:size-3.5 [&>span]:rounded-none [&>span]:border-0 [&>span]:bg-transparent [&_svg]:size-3.5">
      <ProviderMark id={connection.harness} />
    </span>
  ) : (
    <span className="size-3.5 rounded-full bg-foreground/10" aria-hidden="true" />
  );
}

function providerName(connection?: Connection) {
  return connection?.harness === "muse" ? "Muse Code" : "ChatGPT";
}

function unavailable(connection?: Connection) {
  if (!connection) return "Pilih akun & model";
  if (connection.state === "revoked") return "Koneksi diputus";
  if (connection.login !== "authenticated") return "Perlu login";
  if (connection.effective_billing_source !== connection.authentication.billing_source)
    return "Sumber biaya belum terverifikasi";
  return null;
}

export interface ModelPickerProps {
  agent?: Agent;
  connections: Connection[];
  refresh: () => Promise<unknown>;
  report: (error: string) => void;
  manageProviders: () => void;
  disabled?: boolean;
  className?: string;
  contained?: boolean;
  label?: ReactNode;
}

export function ModelPicker({
  agent,
  connections,
  refresh,
  report,
  manageProviders,
  disabled = false,
  className,
  contained = false,
  label,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const typed = useRef<ModelMenuTypeahead | null>(null);
  const id = useId();
  const current = connections.find((item) => item.id === agent?.connection_id);
  const currentModel = current?.models.find((item) => item.id === agent?.model_id);
  const warning =
    unavailable(current) ??
    (agent?.model_id && !currentModel
      ? current?.discovery === "succeeded"
        ? "Model tidak tersedia"
        : "Model belum diverifikasi"
      : !agent?.model_id
        ? "Pilih model"
        : null);
  const models = currentModel?.reasoning ?? [];
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  const showSearch =
    connections
      .filter((connection) => connection.state === "active" && connection.login === "authenticated")
      .reduce((total, connection) => total + connection.models.length, 0) > 12;
  const term = showSearch ? query.trim().toLocaleLowerCase() : "";
  const accounts = accountGroups(connections, agent, term, expanded);
  const noAccounts = !connections.some(
    (connection) => connection.state === "active" || connection.id === agent?.connection_id,
  );

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery("");
      setExpanded(new Set());
      typed.current = null;
      setError("");
    }
  }

  function manage() {
    setOpen(false);
    manageProviders();
  }

  async function perform(key: string, action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(key);
    setError("");
    try {
      await action();
      report("");
    } catch (failure) {
      const message =
        failure instanceof ApiError
          ? repairMessage(failure.code)
          : failure instanceof Error
            ? failure.message
            : "Perubahan belum dapat disimpan.";
      setError(message);
      report(message);
      // A response may be lost after the change commits. Read the authoritative projection.
      await refresh().catch(() => {});
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }

  async function configure(changes: Record<string, unknown>, key: string, close: boolean) {
    if (!agent) return;
    await perform(key, async () => {
      await command(`/v1/agents/${agent.id}/configuration`, {
        expected_revision: agent.revision,
        changes,
      });
      await refresh();
      if (close) setOpen(false);
    });
  }

  function pick(connection: Connection, model: Connection["models"][number]) {
    if (connection.id === agent?.connection_id && model.id === agent.model_id) {
      setOpen(false);
      return;
    }
    void configure(
      {
        connection_id: connection.id,
        harness: connection.harness,
        billing_source: connection.authentication.billing_source,
        model_id: model.id,
        reasoning: model.reasoning.includes(agent?.reasoning ?? "") ? agent?.reasoning : null,
      },
      `${connection.id}:${model.id}`,
      true,
    );
  }

  return (
    <div
      className={
        contained ? "flex min-h-[46px] w-full items-center justify-between gap-4" : "contents"
      }
    >
      {contained && label}
      <Popover open={open && !disabled} onOpenChange={changeOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "model-selector group flex h-8 min-w-0 items-center rounded-full px-2.5 text-[13px] leading-[18px] text-muted-foreground transition-colors duration-150 hover:bg-menu-hover hover:text-foreground aria-expanded:bg-menu-hover aria-expanded:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
              contained
                ? "max-w-[58%] bg-transparent"
                : "shrink-0 bg-composer shadow-[0_4px_12px_-1px_#1c1c1c14,0_2px_4px_-2px_#1c1c1c0f] ring-[0.5px] ring-foreground/10 dark:shadow-none",
              className,
            )}
            aria-label="Pilih model"
            title={[
              agent?.model_id?.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase()) ??
                providerName(current),
              current && providerName(current),
              current && billingLabel(current.authentication.billing_source),
              warning,
            ]
              .filter(Boolean)
              .join(" · ")}
            disabled={!agent || disabled}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                changeOpen(true);
              }
            }}
          >
            <span className="relative mr-1.5 flex shrink-0">
              <Mark connection={current} />
              {warning && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full bg-warning-foreground ring-[1.5px] ring-background"
                  aria-hidden="true"
                />
              )}
            </span>
            <span className="min-w-0 max-w-40 truncate capitalize">
              {agent?.model_id ?? (current ? providerName(current) : "Pilih model")}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          ref={menu}
          align="end"
          sideOffset={6}
          data-model-picker-content
          aria-label="Pilih model"
          aria-busy={busy !== null}
          className="flex max-h-[min(600px,var(--radix-popover-content-available-height))] w-[300px] max-w-[calc(100vw-24px)] gap-0 overflow-hidden rounded-menu p-0 shadow-[0_8px_24px_-6px_#0000001f,0_1px_2px_#0000000a] ring-[0.5px] ring-foreground/10 dark:shadow-none"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (search.current) search.current.focus();
            else menu.current?.querySelector<HTMLButtonElement>("[data-menu-row]")?.focus();
          }}
          onKeyDown={(event) =>
            modelMenuKey(event, { query: term, typed, close: () => setOpen(false) })
          }
          onPointerMove={modelMenuPointerMove}
        >
          {showSearch && (
            <div className="group/search flex h-9 shrink-0 items-center gap-2 border-b-[0.5px] border-foreground/10 pl-3.5 pr-2">
              <Search
                size={16}
                strokeWidth={1.75}
                className="shrink-0 text-(--text-tertiary)"
                aria-hidden="true"
              />
              <input
                ref={search}
                data-menu-search
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari model…"
                aria-label="Cari model"
                className="min-w-0 flex-1 bg-transparent text-[13px] leading-[18px] outline-none placeholder:text-(--text-tertiary)"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    search.current?.focus();
                  }}
                  aria-label="Hapus pencarian model"
                  className="flex size-5 shrink-0 items-center justify-center rounded-full text-(--text-tertiary) hover:bg-menu-hover"
                >
                  <X size={14} strokeWidth={1.75} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="flex flex-col gap-0.5 p-1.5">
              {!term && agent?.model_id && (
                <>
                  <button
                    type="button"
                    data-menu-row
                    data-current-model
                    aria-pressed="true"
                    className={row}
                    onClick={() => (warning ? manage() : setOpen(false))}
                  >
                    <span className={gutter}>
                      <Mark connection={current} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate capitalize">{agent.model_id}</span>
                      <span className={cn(meta, warning && "text-warning-foreground")}>
                        {warning ??
                          `${providerName(current)} · ${current ? billingLabel(current.authentication.billing_source) : "Akun tidak tersedia"}`}
                      </span>
                    </span>
                    <Check size={14} className="shrink-0 text-link" aria-hidden="true" />
                  </button>
                  <hr className={cn(separator, "border-0")} />
                </>
              )}
              {accounts.map(({ connection, choices, toggle }, index) => {
                const ready = connection.state === "active" && connection.login === "authenticated";
                const labelId = `${id}-account-${connection.id}`;
                return (
                  <section
                    key={connection.id}
                    data-simple-provider={connection.id}
                    aria-labelledby={labelId}
                    className={cn("flex flex-col gap-0.5", index > 0 && "mt-1")}
                  >
                    <h3
                      id={labelId}
                      className="flex min-h-6 shrink-0 items-end gap-2 px-2 pb-0.5 text-[12px] font-medium leading-4 text-(--text-tertiary)"
                    >
                      <span className={gutter}>
                        <Mark connection={connection} />
                      </span>
                      <span className="min-w-0 truncate">{providerName(connection)}</span>
                      {connection.authentication.billing_source === "api_key" && (
                        <KeyRound size={12} className="ml-auto shrink-0" aria-label="API key" />
                      )}
                    </h3>
                    <p className="pl-8 pr-2 text-[12px] leading-4 text-(--text-tertiary)">
                      {billingLabel(connection.authentication.billing_source)}
                      {connection.effective_billing_source !==
                        connection.authentication.billing_source && " · Biaya belum terverifikasi"}
                    </p>
                    {!ready ? (
                      <button
                        type="button"
                        data-menu-row
                        data-simple-sign-in
                        className={row}
                        onClick={manage}
                      >
                        <span className={gutter}>
                          <LogIn
                            size={16}
                            strokeWidth={1.75}
                            className="text-muted-foreground"
                            aria-hidden="true"
                          />
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {connection.state === "revoked" ? "Hubungkan kembali" : "Login akun"}
                        </span>
                        <ChevronRight
                          size={16}
                          strokeWidth={1.75}
                          className="text-(--text-tertiary)"
                          aria-hidden="true"
                        />
                      </button>
                    ) : choices.length > 0 ? (
                      choices.map((model) => {
                        const selected =
                          connection.id === agent?.connection_id && model.id === agent?.model_id;
                        const key = `${connection.id}:${model.id}`;
                        return (
                          <button
                            key={model.id}
                            type="button"
                            data-menu-row
                            aria-pressed={selected}
                            disabled={busy !== null}
                            className={row}
                            onClick={() => pick(connection, model)}
                            title={`${model.id.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase())} · ${billingLabel(connection.authentication.billing_source)}`}
                          >
                            <span className={gutter} />
                            <span className="min-w-0 flex-1 truncate capitalize">{model.id}</span>
                            {busy === key ? (
                              <Loader2
                                size={14}
                                className="shrink-0 animate-spin"
                                aria-hidden="true"
                              />
                            ) : (
                              selected && (
                                <Check
                                  size={14}
                                  className="shrink-0 text-link"
                                  aria-hidden="true"
                                />
                              )
                            )}
                          </button>
                        );
                      })
                    ) : (
                      <>
                        <p className="py-1 pl-8 pr-2 text-[12px] leading-4 text-(--text-tertiary)">
                          {term
                            ? "Tidak ada model yang cocok."
                            : ["not_attempted", "unknown"].includes(connection.discovery)
                              ? "Model belum diperiksa."
                              : "Belum ada model tersedia."}
                        </p>
                        {!term && (
                          <button
                            type="button"
                            data-menu-row
                            disabled={busy !== null}
                            className={row}
                            onClick={() =>
                              void perform(connection.id, async () => {
                                await request(`/v1/connections/${connection.id}/inspect`, {});
                                await refresh();
                              })
                            }
                          >
                            <span className={gutter}>
                              {busy === connection.id ? (
                                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                              ) : (
                                <RefreshCw
                                  size={16}
                                  strokeWidth={1.75}
                                  className="text-muted-foreground"
                                  aria-hidden="true"
                                />
                              )}
                            </span>
                            <span className="min-w-0 flex-1 truncate">Periksa akun & model</span>
                          </button>
                        )}
                      </>
                    )}
                    {toggle && (
                      <div
                        className={cn(
                          toggle === "less" &&
                            "sticky bottom-0 -mx-1.5 bg-linear-to-b from-transparent to-popover to-[12px] px-1.5 pt-3",
                        )}
                      >
                        <button
                          type="button"
                          data-menu-row
                          data-simple-show-all
                          className={cn(row, "text-muted-foreground hover:text-foreground")}
                          aria-expanded={toggle === "less"}
                          onClick={() =>
                            setExpanded((previous) => {
                              const next = new Set(previous);
                              if (next.has(connection.id)) next.delete(connection.id);
                              else next.add(connection.id);
                              return next;
                            })
                          }
                        >
                          <span className={gutter} />
                          <span className="min-w-0 flex-1 truncate">
                            {toggle === "less"
                              ? "Tampilkan saran"
                              : `Tampilkan semua ${connection.models.length} model`}
                          </span>
                          {toggle === "less" ? (
                            <ChevronUp
                              size={16}
                              strokeWidth={1.75}
                              className="shrink-0 text-(--text-tertiary)"
                              aria-hidden="true"
                            />
                          ) : (
                            <ChevronDown
                              size={16}
                              strokeWidth={1.75}
                              className="shrink-0 text-(--text-tertiary)"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      </div>
                    )}
                  </section>
                );
              })}
              {!accounts.length && (term || noAccounts) && (
                <p role="status" className="px-2 py-2 text-[12px] leading-4 text-(--text-tertiary)">
                  {term
                    ? `Tidak ada hasil untuk “${query}”.`
                    : "Hubungkan akun AI untuk memilih model."}
                </p>
              )}
              {error && (
                <p role="alert" className="px-2 py-2 text-[12px] leading-4 text-destructive">
                  {error}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-0.5 border-t-[0.5px] border-foreground/10 p-1.5">
            {(models.length > 0 || agent?.reasoning) && (
              <>
                <div className="flex h-6 items-end justify-between gap-2 px-2 pb-0.5">
                  <span
                    id={`${id}-reasoning`}
                    className="text-[12px] font-medium leading-4 text-(--text-tertiary)"
                  >
                    Reasoning
                  </span>
                  {agent?.reasoning ? (
                    <button
                      type="button"
                      disabled={busy !== null || current?.state !== "active"}
                      onClick={() => void configure({ reasoning: null }, "reasoning", false)}
                      className="-mr-1 rounded-[5px] px-1 text-[12px] leading-4 text-muted-foreground hover:bg-menu-hover hover:text-foreground disabled:opacity-50"
                    >
                      Gunakan default
                    </button>
                  ) : (
                    <span className={meta}>Default harness</span>
                  )}
                </div>
                {models.length > 0 && (
                  <fieldset
                    data-simple-effort
                    aria-labelledby={`${id}-reasoning`}
                    className="m-1 flex rounded-full bg-foreground/5 p-[3px]"
                  >
                    {models.map((level, index) => (
                      <button
                        key={level}
                        type="button"
                        data-effort-pill
                        aria-pressed={agent?.reasoning === level}
                        tabIndex={
                          models.includes(agent?.reasoning ?? "")
                            ? agent?.reasoning === level
                              ? 0
                              : -1
                            : index === 0
                              ? 0
                              : -1
                        }
                        disabled={busy !== null || current?.state !== "active"}
                        onClick={() => void configure({ reasoning: level }, "reasoning", false)}
                        title={level}
                        className={cn(
                          "h-6 min-w-0 flex-1 truncate rounded-full px-1 text-[12px] leading-4 transition-colors disabled:opacity-50 touch:h-8",
                          agent?.reasoning === level
                            ? "bg-foreground/10 font-medium text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {level}
                      </button>
                    ))}
                  </fieldset>
                )}
                {agent?.reasoning && !models.includes(agent.reasoning) && (
                  <p className="px-2 py-1 text-[12px] leading-4 text-warning-foreground">
                    {agent.reasoning} · Dukungan belum diketahui.
                  </p>
                )}
                <hr className={cn(separator, "border-0")} />
              </>
            )}
            <button type="button" data-menu-row data-simple-manage className={row} onClick={manage}>
              <span className={gutter}>
                <Settings
                  size={16}
                  strokeWidth={1.75}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              </span>
              <span className="min-w-0 flex-1 truncate">Kelola akun & model</span>
              <ChevronRight
                size={16}
                strokeWidth={1.75}
                className="shrink-0 text-(--text-tertiary)"
                aria-hidden="true"
              />
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
