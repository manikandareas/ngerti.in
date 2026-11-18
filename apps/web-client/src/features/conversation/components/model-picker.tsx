import { RefreshIcon, UnfoldMoreIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useContext, useMemo, useState } from "react";
import { HarnessIcon } from "@/components/harness-icon";
import {
  ClaudeIcon,
  ModelPicker as HarnessModelPicker,
  OpenAIIcon,
} from "@/components/ui/model-picker";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SettingsWorkspaceContext } from "@/hooks/settings-workspace";
import { harnessModelCatalog, harnessModelKey } from "@/lib/harness-models";
import { type HarnessId, harnesses, isHarness } from "@/lib/harnesses";
import { refreshLocalModels } from "@/lib/local-models";
import { cn } from "@/lib/utils";
import type { Agent, Connection } from "@/types/workspace";
import { useModelSelection } from "../hooks/use-model-selection";

export interface ModelPickerProps {
  agent?: Agent;
  connections: Connection[];
  refresh: () => Promise<unknown>;
  report: (error: string) => void;
  disabled?: boolean;
  className?: string;
  contained?: boolean;
  label?: ReactNode;
  titlebar?: boolean;
}

/** Account selection and persistence only. The picker and observed catalog are shared with onboarding. */
export function ModelPicker({
  agent,
  connections,
  refresh,
  report,
  disabled = false,
  className,
  contained = false,
  label,
  titlebar = false,
}: ModelPickerProps) {
  const workspace = useContext(SettingsWorkspaceContext);
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [browsing, setBrowsing] = useState<HarnessId>(agent?.harness ?? "codex");
  const threadId = workspace?.snapshot?.thread.id;
  const {
    selection,
    select: selectChoice,
    error,
    clearError,
  } = useModelSelection({
    target:
      agent && threadId
        ? { agent_id: agent.id, thread_id: threadId, harness: agent.harness }
        : null,
    value:
      agent?.connection_id && agent.model_id
        ? {
            connection_id: agent.connection_id,
            model_id: agent.model_id,
            reasoning: agent.reasoning ?? null,
          }
        : null,
    disabled,
    refresh,
    report,
  });
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
        icon:
          titlebar && provider.id === "codex" ? (
            <OpenAIIcon />
          ) : titlebar && provider.id === "claude" ? (
            <ClaudeIcon />
          ) : (
            <HarnessIcon id={provider.id} size={20} className="rounded-sm" />
          ),
      })),
    [catalog.providers, titlebar],
  );
  const current = allowed.find((connection) => connection.id === selection?.connection_id);
  const running = workspace?.snapshot?.runs.find(
    (run) =>
      run.agent_id === agent?.id &&
      ["dispatching", "running", "cancel_requested"].includes(run.status),
  )?.provider_selection;
  const changedDuringRun =
    running &&
    (running.connection_id !== selection?.connection_id ||
      running.model_id !== selection?.model_id);
  const connected = allowed.filter(
    (connection) => connection.harness === agent?.harness && connection.state === "active",
  );
  const selected = selection ? harnessModelKey(selection.connection_id, selection.model_id) : null;

  function select(key: string, harness: string, reasoning?: string | null) {
    const choice = catalog.choices.get(key);
    if (
      !agent ||
      !choice ||
      harness !== agent.harness ||
      choice.connection.harness !== agent.harness
    )
      return;
    selectChoice({
      connection_id: choice.connection.id,
      model_id: choice.model.id,
      reasoning: reasoning ?? null,
    });
  }

  const localHarness =
    current?.authentication.method === "local_config" ||
    agent?.harness === "pi" ||
    agent?.harness === "opencode";
  async function refreshCatalog() {
    setRefreshing(true);
    try {
      if (await refreshLocalModels()) await refresh();
      else report("Local setup is available on the device hosting this workspace.");
    } catch (failure) {
      report(failure instanceof Error ? failure.message : "Could not refresh the local catalog.");
    } finally {
      setRefreshing(false);
    }
  }

  function empty(harness: string) {
    if (agent && harness !== agent.harness)
      return `This agent uses ${harnesses[agent.harness].name}. Its harness is managed in agent settings.`;
    if (localHarness && agent)
      return `Configure models in ${harnesses[agent.harness].name} on this device, then refresh.`;
    return connected.length
      ? "Verify this connection to load its available models."
      : `Connect ${isHarness(harness) ? harnesses[harness].name : "a harness"} to choose a model.`;
  }

  return (
    <div
      className={
        contained ? "flex min-h-[46px] w-full items-center justify-between gap-4" : "contents"
      }
    >
      {contained && label}
      <HarnessModelPicker
        providers={providers}
        activeProvider={browsing}
        onProviderChange={(id) => {
          if (isHarness(id)) setBrowsing(id);
        }}
        value={selected}
        thinking={selection?.reasoning ?? null}
        side={titlebar ? "bottom" : "top"}
        onValueChange={select}
        showEmptyProviders
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setBrowsing(agent?.harness ?? "codex");
            clearError();
          }
        }}
        disabled={disabled || !agent}
        ariaLabel="Pilih model"
        dropdownIcon={
          titlebar ? (
            <HugeiconsIcon
              icon={UnfoldMoreIcon}
              size={14}
              aria-hidden="true"
              className="shrink-0 text-muted-foreground"
            />
          ) : undefined
        }
        placeholder={agent?.model_id ?? "Pilih model"}
        align="end"
        className={cn(
          "model-selector h-10 min-w-0 max-w-60 gap-2.5 px-3.5 text-sm shadow-none [&>span]:max-w-40 [&>span]:truncate",
          contained && "max-w-[58%]",
          className,
        )}
        emptyProvider={empty}
        railFooter={
          localHarness && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Refresh local models"
                  aria-busy={refreshing}
                  disabled={refreshing}
                  onClick={() => void refreshCatalog()}
                  className="flex h-9 w-full items-center justify-center rounded-xl text-muted-foreground hover:bg-popover/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <HugeiconsIcon
                    icon={RefreshIcon}
                    size={16}
                    aria-hidden="true"
                    className={refreshing ? "motion-safe:animate-spin" : undefined}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">Refresh local models</TooltipContent>
            </Tooltip>
          )
        }
        footer={
          changedDuringRun || error || (current && !catalog.choices.has(selected ?? "")) ? (
            <div className="space-y-2 px-4 pb-3 text-xs text-muted-foreground">
              {changedDuringRun && (
                <p>
                  Active work keeps its selected account and model. Your choice applies to later
                  work.
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
            </div>
          ) : null
        }
      />
    </div>
  );
}
