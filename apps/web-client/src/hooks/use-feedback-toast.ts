import { useEffect, useRef } from "react";
import { toast } from "sonner";

type FeedbackOptions = {
  description?: string;
  tone?: "error" | "info" | "warning" | "success";
  retry?: () => void;
  action?: { label: string; onClick: () => void };
  cancel?: { label: string; onClick: () => void };
};

/** Keep one notification for the current state and retire it when that state clears. */
export function useFeedbackToast(message: string, options: FeedbackOptions = {}) {
  const current = useRef(options);
  current.current = options;
  useEffect(() => {
    if (!message) return;
    const { description, retry, action, cancel, tone = "error" } = current.current;
    const id = toast[tone](message, {
      description,
      duration: tone === "success" || tone === "info" ? 5000 : Infinity,
      action:
        action || retry
          ? {
              label: action?.label ?? "Retry",
              onClick: (event) => {
                event.preventDefault();
                const latest = current.current;
                (latest.action?.onClick ?? latest.retry)?.();
              },
            }
          : undefined,
      cancel: cancel
        ? {
            label: cancel.label,
            onClick: () => current.current.cancel?.onClick(),
          }
        : undefined,
    });
    return () => {
      toast.dismiss(id);
    };
  }, [message]);
}
