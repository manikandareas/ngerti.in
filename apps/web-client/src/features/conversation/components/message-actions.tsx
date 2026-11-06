import { Copy01Icon, PencilEdit01Icon, RefreshIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useContentCopy } from "@/features/conversation/lib/rich-content-actions";
import "./conversation-interactions.css";

export function MessageActions({
  text,
  children,
  retry,
  edit,
  busy = false,
  user = false,
}: {
  text: string;
  children: ReactNode;
  retry?: () => void;
  edit?: () => void;
  busy?: boolean;
  user?: boolean;
}) {
  const copy = useContentCopy(text);
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  return (
    <div
      className="message-action-anchor"
      data-user={user || undefined}
      data-actions-open={open || undefined}
      onPointerEnter={(event) => {
        if (event.pointerType === "touch") return;
        clearTimeout(closeTimer.current);
        setOpen(true);
      }}
      onPointerDown={(event) => {
        if (
          event.pointerType === "touch" &&
          !(event.target as Element).closest("button, a, input, textarea")
        )
          setOpen((value) => !value);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(() => setOpen(false), 180);
      }}
    >
      {children}
      <fieldset className="message-hover-actions" aria-label="Aksi pesan">
        <button
          type="button"
          aria-label={copy.state === "copied" ? "Pesan disalin" : "Salin pesan"}
          title={copy.state === "copied" ? "Pesan disalin" : "Salin pesan"}
          onClick={() => void copy.copy()}
          disabled={!text.trim()}
        >
          <HugeiconsIcon icon={copy.state === "copied" ? Tick02Icon : Copy01Icon} size={16} />
        </button>
        {retry && (
          <button
            type="button"
            aria-label="Try again"
            title="Try again"
            disabled={busy}
            onClick={retry}
          >
            <HugeiconsIcon icon={RefreshIcon} size={16} />
          </button>
        )}
        {edit && (
          <button
            type="button"
            aria-label="Edit pesan"
            title="Edit pesan"
            disabled={busy}
            onClick={edit}
          >
            <HugeiconsIcon icon={PencilEdit01Icon} size={16} />
          </button>
        )}
      </fieldset>
      {copy.state === "failed" && (
        <span role="status" className="message-copy-error">
          Pesan belum dapat disalin.
        </span>
      )}
    </div>
  );
}
