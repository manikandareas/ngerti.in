import { useEffect, useMemo, useState } from "react";
import type { AISelection } from "@/features/account/types";
import { ApiError, command } from "@/lib/api-client";
import { repairMessage } from "@/lib/api-errors";
import { clientScope } from "@/lib/client-scope";
import { queueModelSelection } from "../lib/model-selection";

type Selection = NonNullable<AISelection["selection"]>;
type Target = Pick<AISelection, "thread_id" | "agent_id" | "harness">;

/** Display immediately; serialize writes and retain only the latest queued choice. */
export function useModelSelection({
  target,
  value,
  disabled,
  refresh,
  report,
}: {
  target: Target | null;
  value: Selection | null;
  disabled: boolean;
  refresh: () => Promise<unknown>;
  report: (error: string) => void;
}) {
  const scope = clientScope();
  const threadId = target?.thread_id;
  const agentId = target?.agent_id;
  const harness = target?.harness;
  const session = useMemo(
    () => ({
      target:
        threadId && agentId && harness ? { thread_id: threadId, agent_id: agentId, harness } : null,
      scope,
      active: true,
      saving: false,
      pending: null as Selection | null,
      confirmed: null as Selection | null,
      version: 0,
      reconciliation: Promise.resolve(),
    }),
    [scope, threadId, agentId, harness],
  );
  const [view, setView] = useState<{
    session: typeof session;
    selection?: Selection | null;
    error: string;
  } | null>(null);
  const currentView = view?.session === session ? view : null;
  const selection = currentView?.selection === undefined ? value : currentView.selection;

  useEffect(() => {
    session.active = true;
    return () => {
      session.active = false;
    };
  }, [session]);

  function active() {
    return session.active && session.scope === clientScope();
  }

  async function save() {
    if (!session.target) return false;
    session.saving = true;
    let savedLatest = false;
    // Navigation may finish an explicit choice for its original target, within the same account.
    while (session.pending && session.scope === clientScope()) {
      const next = session.pending;
      const version = session.version;
      session.pending = null;
      try {
        const saved = await command<AISelection>("/v1/ai/selections", {
          scope: "conversation",
          ...session.target,
          selection: next,
        });
        session.confirmed = saved.selection;
        savedLatest = true;
        if (active() && version === session.version)
          setView({ session, selection: saved.selection, error: "" });
      } catch (failure) {
        savedLatest = false;
        if (active() && version === session.version) {
          const error =
            failure instanceof ApiError
              ? repairMessage(failure.code)
              : failure instanceof Error
                ? failure.message
                : "Your choice could not be saved.";
          setView({ session, selection: session.confirmed, error });
          report(error);
        }
      }
    }
    session.saving = false;
    const version = session.version;
    // Older refreshes must finish before the latest projection can replace the local choice.
    session.reconciliation = session.reconciliation.then(async () => {
      if (!active() || session.saving || version !== session.version) return;
      try {
        await refresh();
      } catch {
        // A failed projection read does not undo an acknowledged selection.
        return;
      }
      if (active() && !session.saving && version === session.version)
        setView((previous) =>
          previous?.session === session ? { ...previous, selection: undefined } : previous,
        );
    });
    return savedLatest;
  }

  function select(next: Selection) {
    if (disabled || !session.target || !active()) return;
    if (!session.saving) session.confirmed = selection;
    session.pending = next;
    session.version += 1;
    setView({ session, selection: next, error: "" });
    report("");
    if (!session.saving) {
      session.saving = true;
      queueModelSelection(session.target.thread_id, session.target.agent_id, save);
    }
  }

  function clearError() {
    setView((previous) => (previous?.session === session ? { ...previous, error: "" } : previous));
  }

  return { selection, select, error: currentView?.error ?? "", clearError };
}
