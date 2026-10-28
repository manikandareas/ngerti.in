import { useAuth } from "@clerk/tanstack-react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { command, submit } from "./client";

// Only the visible end of a conversation advances the durable read watermark.
export function useReadState(threadId: string, sequence: string | undefined, away: boolean) {
  const { getToken, userId } = useAuth();
  const cache = useQueryClient();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const changed = () => setVisible(document.visibilityState === "visible");
    changed();
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  useEffect(() => {
    if (!sequence || away || !visible || !userId) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const token = await getToken();
        if (!active) return;
        await submit(
          command("thread.mark_read", { thread_id: threadId, message_seq: sequence }),
          token,
        );
        if (active) void cache.invalidateQueries({ queryKey: ["conversation-summaries", userId] });
      } catch {
        // A failed acknowledgement never claims that unread results were seen.
      }
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [threadId, sequence, away, visible, userId, getToken, cache]);
}
