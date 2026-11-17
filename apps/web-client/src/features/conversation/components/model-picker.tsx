import { Loading03Icon, RefreshIcon, Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useContext, useMemo, useRef, useState } from "react";
import { HarnessIcon } from "@/components/harness-icon";
import { ModelPicker as HarnessModelPicker } from "@/components/ui/model-picker";
import { SettingsWorkspaceContext } from "@/hooks/settings-workspace";
import { ApiError, command, request } from "@/lib/api-client";
import { repairMessage } from "@/lib/api-errors";
import { harnessModelCatalog, harnessModelKey } from "@/lib/harness-models";
import { type HarnessId, harnesses, isHarness } from "@/lib/harnesses";
import { cn } from "@/lib/utils";
import type { Agent, Connection } from "@/types/workspace";

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

/** Account selection and persistence only. The picker and observed catalog are shared with onboarding. */
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
  const workspace = useContext(SettingsWorkspaceContext);
  const [open, setOpen] = useState(false);
  const [browsing, setBrowsing] = useState<HarnessId>(agent?.harness ?? "codex");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const allowed = useMemo(
    () =>
      connections.filter(
        (connection) =>
          connection.actor_id !== null ||
          workspace?.allowedOrganizationConnectionIds?.includes(connection.id),
      ),
    [connections, workspace?.allowedOrganizationConnectionIds],
  );
  const catalog = useMemo(
    () => harnessModelCatalog(allowed, agent?.harness),
    [allowed, agent?.harness],
  );
  const providers = useMemo(
    () =>
      catalog.providers.map((provider) => ({
        ...provider,
        icon: <HarnessIcon id={provider.id as HarnessId} className="rounded-sm" />,
      })),
    [catalog.providers],
  );
  const current = allowed.find((connection) => connection.id === agent?.connection_id);
  const running = workspace?.snapshot?.runs.find(
    (run) =>
      run.agent_id === agent?.id &&
      ["dispatching", "running", "cancel_requested"].includes(run.status),
  )?.provider_selection;
  const changedDuringRun =
    running &&
    (running.connection_id !== agent?.connection_id || running.model_id !== agent?.model_id);
  const connected = allowed.filter(
    (connection) => connection.harness === agent?.harness && connection.state === "active",
  );
  const selected =
    agent?.connection_id && agent.model_id
      ? harnessModelKey(agent.connection_id, agent.model_id)
      : undefined;

  async function perform(action: () => Promise<void>) {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
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
      await refresh().catch(() => {});
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function select(key: string, harness: string, reasoning?: string | null) {
    const choice = catalog.choices.get(key);
    if (
      !agent ||
      !choice ||
      harness !== agent.harness ||
      choice.connection.harness !== agent.harness
    )
      return;
    const threadId = workspace?.snapshot?.thread.id;
    if (!threadId) return;
    void perform(async () => {
      await command("/v1/ai/selections", {
        scope: "conversation",
        thread_id: threadId,
        agent_id: agent.id,
        harness: agent.harness,
        selection: {
          connection_id: choice.connection.id,
          model_id: choice.model.id,
          reasoning: reasoning ?? null,
        },
      });
      await refresh();
      setOpen(false);
    });
  }

  function empty(harness: string) {
    if (agent && harness !== agent.harness)
      return `This agent uses ${harnesses[agent.harness].name}. Its harness is managed in agent settings.`;
    return connected.length
      ? "Verify this connection to load its available models."
      : `Connect ${isHarness(harness) ? harnesses[harness].name : "a harness"} to choose a model.`;
  }

  return (
    <div
      className={
        contained ? "flex min-h-[46px] w-full items-center justify-between gap-4" : "contents"
      }
      aria-busy={busy}
    >
      {contained && label}
      <HarnessModelPicker
        providers={providers}
        activeProvider={browsing}
        onProviderChange={(id) => {
          if (isHarness(id)) setBrowsing(id);
        }}
        value={selected}
        thinking={agent?.reasoning ?? null}
        onValueChange={select}
        showEmptyProviders
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setBrowsing(agent?.harness ?? "codex");
            setError("");
          }
        }}
        disabled={disabled || !agent || busy}
        ariaLabel="Pilih model"
        placeholder={agent?.model_id ?? "Pilih model"}
        align="end"
        className={cn(
          "model-selector h-8 min-w-0 max-w-52 gap-1.5 px-2.5 text-[13px] text-muted-foreground shadow-none ring-foreground/10 [&>span]:max-w-40 [&>span]:truncate",
          contained && "max-w-[58%]",
          className,
        )}
        emptyProvider={empty}
        footer={
          <div className="space-y-2 border-t border-border/60 p-3 text-xs text-muted-foreground">
            {changedDuringRun && (
              <p>
                Active work keeps its selected account and model. Your choice applies to later work.
              </p>
            )}
            {busy && (
              <p role="status" className="flex items-center gap-2">
                <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />
                Saving your choice…
              </p>
            )}
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            {current && !catalog.choices.has(selected ?? "") && (
              <p>Your selected connection or model needs verification.</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {browsing === agent?.harness && connected.length > 0 && (
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-muted"
                  onClick={() =>
                    void perform(async () => {
                      for (const connection of connected)
                        await request(`/v1/connections/${connection.id}/inspect`, {});
                      await refresh();
                    })
                  }
                >
                  <HugeiconsIcon icon={RefreshIcon} size={14} />
                  Refresh models
                </button>
              )}
              <button
                type="button"
                className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-muted"
                onClick={() => {
                  setOpen(false);
                  manageProviders();
                }}
              >
                <HugeiconsIcon icon={Settings01Icon} size={14} />
                Manage connections
              </button>
            </div>
          </div>
        }
      />
    </div>
  );
}
