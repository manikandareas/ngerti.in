import { isAbsolute, relative, resolve } from "node:path";
import type * as acp from "@agentclientprotocol/sdk/unstable";
import { toolActivityKind } from "../../runs/activity";
import { type NativeProgress, nativeProgress } from "../../runs/native-progress";
import type { Redactor } from "../context";
import { HarnessError, type NativeEvent } from "../contracts";

/** One live-turn projector. Session-load replay is never passed to this instance. */
export class AcpProjection {
  readonly tools = new Map<string, acp.ToolCallUpdate>();
  #text = "";
  #dirty = false;
  #hasFinal = false;
  #message: string | null = null;
  readonly #messages = new Set<string>();
  readonly #summaries = new Map<string, string>();
  readonly #progress: NativeProgress = {
    plans: [],
    usage: null,
    commands: [],
    compactions: [],
    file_changes: [],
  };

  constructor(
    private readonly redactor: Redactor,
    private readonly roots: readonly string[] = [],
    private readonly messagePhases = false,
  ) {}

  private progress(): NativeEvent {
    const progress = nativeProgress.parse(this.#progress);
    if (Buffer.byteLength(JSON.stringify(progress)) > 128 * 1024)
      throw new HarnessError("PROTOCOL_ERROR", "unknown");
    return { type: "progress", progress };
  }

  private text(value: string, limit: number) {
    return this.redactor.text(value).slice(0, limit);
  }

  private plan(id: string, entries: acp.PlanEntry[], text: string | null) {
    if (entries.length > 100 || id.length > 1000)
      throw new HarnessError("PROTOCOL_ERROR", "unknown");
    const plan = {
      id: this.text(id, 1000),
      text: text === null ? null : this.text(text, 16000),
      entries: entries.map((entry) => ({
        text: this.text(entry.content, 1000),
        priority: entry.priority,
        state: entry.status,
      })),
    };
    this.#progress.plans = [
      ...this.#progress.plans.filter((previous) => previous.id !== plan.id),
      plan,
    ].slice(-10);
    return this.progress();
  }

  update(update: acp.SessionUpdate): NativeEvent[] {
    if (update.sessionUpdate === "plan") return [this.plan("legacy", update.entries, null)];
    if (update.sessionUpdate === "plan_update")
      return [
        update.plan.type === "items"
          ? this.plan(`plan:${update.plan.planId}`, update.plan.entries, null)
          : this.plan(`plan:${update.plan.planId}`, [], update.plan.content),
      ];
    if (update.sessionUpdate === "plan_removed") {
      this.#progress.plans = this.#progress.plans.filter(
        (plan) => plan.id !== this.text(`plan:${update.planId}`, 1000),
      );
      return [this.progress()];
    }
    if (update.sessionUpdate === "usage_update") {
      this.#progress.usage = {
        used: update.used,
        size: update.size,
        cost: update.cost
          ? { amount: update.cost.amount, currency: this.text(update.cost.currency, 50) }
          : null,
      };
      return [this.progress()];
    }
    if (update.sessionUpdate === "available_commands_update") {
      if (update.availableCommands.length > 100)
        throw new HarnessError("PROTOCOL_ERROR", "unknown");
      this.#progress.commands = update.availableCommands.map((command) => ({
        name: this.text(command.name, 100),
        description: this.text(command.description, 2000),
        input_hint: command.input ? this.text(command.input.hint, 1000) : null,
      }));
      return [this.progress()];
    }
    if (
      update.sessionUpdate === "compaction_update" ||
      update.sessionUpdate === "compaction_summary_chunk"
    ) {
      const id = this.text(update.compactionId, 1000);
      const prior = this.#progress.compactions.find((compaction) => compaction.id === id);
      const state =
        update.sessionUpdate === "compaction_summary_chunk"
          ? (prior?.state ?? "in_progress")
          : update.status;
      const observedState: NativeProgress["compactions"][number]["state"] = [
        "in_progress",
        "completed",
        "failed",
        "cancelled",
      ].includes(state)
        ? (state as "in_progress" | "completed" | "failed" | "cancelled")
        : "unknown";
      let raw = this.#summaries.get(id) ?? "";
      let truncated = prior?.summary_truncated ?? false;
      if (update.sessionUpdate === "compaction_update" && update.summary !== undefined) {
        raw = (update.summary ?? [])
          .flatMap((block) => (block.type === "text" ? [block.text] : []))
          .join("\n");
        truncated = (update.summary ?? []).some((block) => block.type !== "text");
      } else if (update.sessionUpdate === "compaction_summary_chunk") {
        if (update.content.type === "text") raw += update.content.text;
        else truncated = true;
      }
      if (raw.length > 16_000) throw new HarnessError("PROTOCOL_ERROR", "unknown");
      this.#summaries.set(id, raw);
      const summary =
        observedState === "in_progress" ? this.redactor.stream(raw) : this.redactor.text(raw);
      const value = {
        id,
        state: observedState,
        summary: raw ? summary.slice(0, 8000) : null,
        summary_truncated: truncated || summary.length > 8000,
        error:
          update.sessionUpdate === "compaction_update" && update.error !== undefined
            ? update.error === null
              ? null
              : this.text(update.error, 1000)
            : (prior?.error ?? null),
      };
      const index = this.#progress.compactions.findIndex((compaction) => compaction.id === id);
      if (index < 0) this.#progress.compactions.push(value);
      else this.#progress.compactions[index] = value;
      this.#progress.compactions = this.#progress.compactions.slice(-50);
      for (const key of this.#summaries.keys())
        if (!this.#progress.compactions.some((compaction) => compaction.id === key))
          this.#summaries.delete(key);
      return [this.progress()];
    }
    if (update.sessionUpdate === "agent_message_chunk") {
      if (update.content.type !== "text") return [];
      if (this.messagePhases) {
        const meta = update._meta?.ngertiin;
        const phase = meta && typeof meta === "object" && "phase" in meta ? meta.phase : null;
        if (phase === "commentary" || (this.#hasFinal && phase !== "final_answer")) return [];
        if (phase === "final_answer" && !this.#hasFinal) {
          this.#hasFinal = true;
          this.#text = "";
          this.#message = null;
          this.#messages.clear();
        }
      }
      const message = update.messageId ?? null;
      if (message && message !== this.#message) {
        if (this.#messages.has(message)) throw new HarnessError("PROTOCOL_ERROR", "unknown");
        this.#messages.add(message);
        if (this.#text) this.#text += "\n\n";
        this.#message = message;
      }
      this.#text += update.content.text;
      if (this.#text.length > 100_000) throw new HarnessError("PROTOCOL_ERROR", "unknown");
      this.#dirty = true;
      return [];
    }
    if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
      if (
        update.toolCallId.length > 1000 ||
        (this.tools.size >= 200 && !this.tools.has(update.toolCallId))
      )
        throw new HarnessError("PROTOCOL_ERROR", "unknown");
      const previous = this.tools.get(update.toolCallId);
      const merged = {
        ...previous,
        ...Object.fromEntries(
          Object.entries(update).filter(([, value]) => value !== undefined && value !== null),
        ),
        toolCallId: update.toolCallId,
      } as acp.ToolCallUpdate;
      // Keep only the fields needed for bounded public activity; raw inputs/results stay private.
      const safe: acp.ToolCallUpdate = {
        toolCallId: merged.toolCallId,
        name: merged.name,
        kind: merged.kind,
        status: merged.status,
      };
      this.tools.set(update.toolCallId, safe);
      const state =
        safe.status === "failed" ? "failed" : safe.status === "completed" ? "completed" : "started";
      const events: NativeEvent[] = [
        {
          type: "tool_activity",
          call_id: `native:${this.text(safe.toolCallId, 1000)}`,
          kind:
            safe.kind === "search"
              ? "searching"
              : safe.kind === "read"
                ? "reading"
                : safe.kind === "edit"
                  ? "updating"
                  : safe.kind === "fetch"
                    ? "browsing"
                    : toolActivityKind(safe.name ?? ""),
          target_agent_id: null,
          state,
        },
        {
          type: "native_tool",
          item_id: this.redactor.text(safe.toolCallId),
          name: this.redactor.text(safe.name ?? safe.kind ?? "Tool").slice(0, 200),
          command: null,
          state,
          exit_code: null,
        },
      ];
      let changed = false;
      for (const content of update.content ?? []) {
        if (content.type !== "diff") continue;
        const path = this.roots
          .map((root) => relative(resolve(root), resolve(root, content.path)))
          .find((path) => path && path !== ".." && !path.startsWith("../") && !isAbsolute(path));
        if (!path || path.length > 4000) continue;
        const toolId = this.text(update.toolCallId, 1000);
        const preview = {
          tool_id: toolId,
          path: this.text(path, 4000),
          old_text: content.oldText == null ? null : this.text(content.oldText, 4000),
          new_text: this.text(content.newText, 4000),
          truncated: (content.oldText?.length ?? 0) > 4000 || content.newText.length > 4000,
          provenance: "native_tool_preview" as const,
        };
        this.#progress.file_changes = [
          ...this.#progress.file_changes.filter(
            (previous) => previous.tool_id !== toolId || previous.path !== preview.path,
          ),
          preview,
        ].slice(-10);
        changed = true;
      }
      if (changed) events.push(this.progress());
      return events;
    }
    // Thoughts, replayed user messages, raw observations and subagent content are private.
    return [];
  }

  final(): NativeEvent {
    this.#dirty = false;
    return { type: "text_snapshot", text: this.redactor.text(this.#text) };
  }

  flush(): NativeEvent | null {
    if (!this.#dirty) return null;
    this.#dirty = false;
    return { type: "text_snapshot", text: this.redactor.stream(this.#text) };
  }
}

export function promptOutcome(reason: acp.StopReason) {
  switch (reason) {
    case "end_turn":
      return "succeeded" as const;
    case "cancelled":
      return "cancelled" as const;
    case "refusal":
    case "max_tokens":
    case "max_turn_requests":
      return "failed" as const;
    default:
      throw new HarnessError("PROTOCOL_ERROR", "unknown");
  }
}
