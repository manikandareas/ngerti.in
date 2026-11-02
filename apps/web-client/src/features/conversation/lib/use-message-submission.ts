import { useEffect, useRef, useState } from "react";
import {
  clearSubmission,
  executeSubmission,
  type MessageSubmission,
  pendingSubmission,
  RejectedSubmission,
  saveSubmission,
} from "./message-submission";

export function useMessageSubmission(threadId: string | null) {
  const [pending, setPending] = useState<MessageSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const current = useRef(threadId);
  current.current = threadId;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailure("");
    if (!threadId) {
      setPending(null);
      setLoading(false);
      return;
    }
    void pendingSubmission(threadId)
      .then((operation) => {
        if (active) setPending(operation);
      })
      .catch(() => {
        if (active)
          setFailure(
            "Pengiriman sebelumnya belum dapat dipulihkan. Muat ulang untuk mencoba lagi.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [threadId]);
  async function send(
    operation: MessageSubmission,
    progress: (id: string, state: "uploading" | "ready" | "failed") => void,
  ) {
    const saved = await saveSubmission(operation);
    const scope = saved.body.thread_id;
    if (current.current === scope) setPending(saved);
    try {
      const result = await executeSubmission(saved, progress);
      await clearSubmission(saved);
      if (current.current === scope) setPending(null);
      return result;
    } catch (error) {
      if (error instanceof RejectedSubmission) {
        await clearSubmission(saved);
        if (current.current === scope) setPending(null);
      } else for (const file of saved.files) progress(file.id, "failed");
      throw error;
    }
  }
  return { pending: pending?.body.thread_id === threadId ? pending : null, loading, failure, send };
}
