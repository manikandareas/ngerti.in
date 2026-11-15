/** Retained pages and snapshots may overlap; only the selected thread can supply history. */
export function mergeConversationHistory<T extends { id: string; thread_id: string }>(
  threadId: string | null,
  retained: T[],
  current: T[],
): T[] {
  return [
    ...new Map(
      [...retained, ...current]
        .filter((item) => item.thread_id === threadId)
        .map((item) => [item.id, item]),
    ).values(),
  ];
}
