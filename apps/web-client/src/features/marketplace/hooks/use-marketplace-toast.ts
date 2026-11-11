import { useEffect, useId, useRef } from "react";
import { toast } from "sonner";

/** One recoverable notification per current failure; ordinary rerenders do not repeat it. */
export function useMarketplaceToast(
  message: string,
  options: {
    description?: string;
    retry?: () => void;
    tone?: "error" | "warning" | "success";
  } = {},
) {
  const id = useId();
  const current = useRef(options);
  current.current = options;
  useEffect(() => {
    // Cleanup retires an existing toast. Dismissing an id before its first
    // notification can race Sonner's deferred removal during fast navigation.
    if (!message) return;
    const { description, retry, tone = "error" } = current.current;
    toast[tone](message, {
      id,
      description,
      closeButton: true,
      duration: tone === "success" ? 5000 : Infinity,
      action: retry
        ? {
            label: "Retry",
            onClick: (event) => {
              event.preventDefault();
              current.current.retry?.();
            },
          }
        : undefined,
    });
    return () => {
      toast.dismiss(id);
    };
  }, [message, id]);
}
