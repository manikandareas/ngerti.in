import { useEffect, useState } from "react";
import { ApiError, durableCommand } from "@/lib/api-client";
import { scopedStorageKey } from "@/lib/client-scope";
import type { HumanRequest } from "@/types/work";
import { HumanReplyCard } from "./human-reply-card";

/** Text-only requests stay in the normal conversation; only structured choices draw a card. */
export function HumanReply({
  request,
  author,
  question,
  refresh,
}: {
  request: HumanRequest;
  author: string;
  question?: string;
  refresh: () => Promise<unknown>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(
    () => localStorage.getItem(scopedStorageKey(`ngertiin:pending:human:${request.id}`)) !== null,
  );
  useEffect(() => {
    if (request.state !== "pending")
      localStorage.removeItem(scopedStorageKey(`ngertiin:pending:human:${request.id}`));
  }, [request.id, request.state]);
  if (request.purpose !== "approval" && !request.options) return null;
  async function submit(decision: "approve" | "reject" | null = null) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await durableCommand(`human:${request.id}`, `/v1/human-requests/${request.id}/reply`, {
        expected_revision: request.revision,
        selected_ids: selected,
        text: text.trim(),
        decision,
      });
      setUncertain(false);
      await refresh();
    } catch (failure) {
      setUncertain(
        !(failure instanceof ApiError) ||
          !["INVALID_REQUEST", "SCOPE_DENIED", "UNAUTHORIZED", "NOT_FOUND"].includes(failure.code),
      );
      setError(failure instanceof Error ? failure.message : "Submission is not confirmed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <HumanReplyCard
      request={request}
      author={author}
      question={question}
      selected={selected}
      text={text}
      busy={busy}
      uncertain={uncertain}
      error={error}
      setSelected={setSelected}
      setText={setText}
      submit={submit}
    />
  );
}
