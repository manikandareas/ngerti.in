import type { HumanRequest } from "@/types/work";
import type { Run } from "@/types/workspace";
import type { ConversationEntry } from "./conversation-parts";
import { conversationDay } from "./conversation-time";
import type { NativeTranscriptFragment, useNativeTranscript } from "./native-transcript";

type MessageEntry = Extract<ConversationEntry, { type: "message" }>;
type RowContent =
  | { type: "message"; entry: MessageEntry; text: string; first: boolean; last: boolean }
  | { type: "activity"; parts: Extract<ConversationEntry, { type: "activity" }>["parts"] }
  | { type: "native"; fragment: NativeTranscriptFragment; fallback: boolean }
  | { type: "run"; run: Run };
export type ConversationRow = RowContent & { key: string; at: string; startsDay: boolean };
type DraftRow = RowContent & { key: string; at: string };

function later(left: string, right: string | undefined) {
  return right && Date.parse(right) > Date.parse(left) ? right : left;
}

/** Preserve publication/verified text order; date groups describe every visible row, including cards. */
export function conversationRows(
  entries: ConversationEntry[],
  {
    native,
    activity,
    requests = [],
    runs = [],
  }: {
    native: Pick<ReturnType<typeof useNativeTranscript>, "anchors" | "fallback">;
    activity: Map<string, Run[]>;
    requests?: HumanRequest[];
    runs?: Run[];
  },
): ConversationRow[] {
  const rows: DraftRow[] = [];
  const inputTimes = new Map<string, string>();
  const retried = new Set(runs.filter((run) => run.retried_by_run_id).map((run) => run.id));
  const questions = new Map(
    requests
      .filter((request) => request.options || request.purpose === "approval")
      .map((request) => [request.message_id, request]),
  );
  function nativeRows(fragment: NativeTranscriptFragment, fallback = false) {
    const cards: Extract<DraftRow, { type: "native" }>[] = [];
    for (const id of fragment.recordIds) {
      const record = fragment.run.native_interactions.find((record) => record.id === id);
      if (!record) continue;
      const previous = cards.at(-1);
      if (previous && conversationDay(previous.at) === conversationDay(record.observed_at))
        previous.fragment.recordIds.push(id);
      else
        cards.push({
          type: "native",
          key: `native:${fragment.key}:${conversationDay(record.observed_at) ?? record.id}`,
          at: record.observed_at,
          fragment: { ...fragment, recordIds: [id] },
          fallback,
        });
    }
    return cards;
  }
  for (const entry of entries) {
    if (entry.type === "activity") {
      const visible = entry.parts.filter((part) => part.kind !== "handoff_requested");
      if (visible.length)
        rows.push({
          type: "activity",
          key: visible[0].id,
          at: visible[0].created_at,
          parts: visible,
        });
      continue;
    }
    const { message, part } = entry;
    const messageEntry = entry;
    if (message.author === "agent" && message.run_id && retried.has(message.run_id)) continue;
    const request = questions.get(message.id);
    let at = request?.created_at ?? part.created_at;
    inputTimes.set(message.id, at);
    const anchors = native.anchors.get(message.id) ?? [];
    if (
      message.author === "agent" &&
      !message.text.trim() &&
      !message.artifact_ids.length &&
      !request &&
      !anchors.length
    )
      continue;
    let start = 0;
    let first = true;
    function textRow(end: number, last: boolean) {
      rows.push({
        type: "message",
        key:
          first &&
          message.author === "agent" &&
          message.run_id &&
          message.purpose === "conversation" &&
          !request
            ? `response:${message.run_id}`
            : `message:${message.id}:${start}`,
        at,
        entry: messageEntry,
        text: message.text.slice(start, end),
        first,
        last,
      });
      first = false;
    }
    for (const anchor of anchors) {
      if (message.author === "agent" && anchor.offset > start) textRow(anchor.offset, false);
      // User messages are never split by a native request anchored to their end.
      if (message.author !== "agent" && first) textRow(message.text.length, true);
      start = anchor.offset;
      for (const fragment of anchor.fragments) {
        const cards = nativeRows(fragment);
        rows.push(...cards);
        // There is one retained answer per run. Text after an interaction cannot precede
        // that persisted boundary; do not invent a per-token delivery timestamp.
        for (const card of cards) {
          const record = fragment.run.native_interactions.find(
            (record) => record.id === card.fragment.recordIds.at(-1),
          );
          at = later(later(at, record?.observed_at), record?.submission?.started_at);
        }
      }
    }
    if (message.author === "agent" ? start < message.text.length || first : first)
      textRow(message.text.length, true);
    else if (message.author === "agent") {
      const lastText = rows.findLast(
        (row) => row.type === "message" && row.entry.message.id === message.id,
      );
      if (lastText?.type === "message") lastText.last = true;
    }
  }
  // Extra run/native observations have their own persisted clocks. Insert them without
  // sorting messages by intake time or moving verified text/interaction boundaries.
  function insert(row: DraftRow, afterMessageId?: string) {
    const anchor = afterMessageId
      ? rows.findLastIndex(
          (candidate) =>
            candidate.type === "message" && candidate.entry.message.id === afterMessageId,
        )
      : -1;
    const next = rows.findIndex(
      (candidate, index) => index > anchor && Date.parse(candidate.at) > Date.parse(row.at),
    );
    rows.splice(next < 0 ? rows.length : next, 0, row);
  }
  const seenRuns = new Set<string>();
  for (const [entryId, runs] of activity)
    for (const run of runs) {
      if (seenRuns.has(run.id)) continue;
      seenRuns.add(run.id);
      const anchor = rows.findLast(
        (row) => row.type === "message" && row.entry.part.id === entryId,
      );
      const at =
        run.computer_activity?.started_at ??
        later(run.created_at, anchor?.at ?? inputTimes.get(run.input_message_id));
      const after =
        run.computer_activity || anchor?.type !== "message"
          ? run.input_message_id
          : anchor.entry.message.id;
      const hasAnswer = entries.some(
        (entry) =>
          entry.type === "message" &&
          entry.message.author === "agent" &&
          entry.message.run_id === run.id &&
          entry.message.text?.trim(),
      );
      insert(
        { type: "run", key: hasAnswer ? `run:${run.id}:status` : `response:${run.id}`, at, run },
        after,
      );
    }
  for (const fragment of native.fallback)
    for (const row of nativeRows(fragment, true)) insert(row, fragment.run.input_message_id);
  let previousDay: string | null = null;
  return rows.map((row) => {
    const day = conversationDay(row.at);
    const startsDay = day !== null && day !== previousDay;
    if (day) previousDay = day;
    return { ...row, startsDay };
  });
}
