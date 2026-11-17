import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import "./workspace-chrome.css";

const desktopWindow = window.ngertiinDesktop?.customTitlebar ? window.ngertiinDesktop : null;
export const isDesktop = desktopWindow !== null;
const TitlebarTarget = createContext<HTMLElement | null>(null);

export function DesktopShell({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const windowAction = desktopWindow?.windowAction;
    if (!windowAction || !target) return;
    const drag = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        !(event.target instanceof Element) ||
        event.target.closest("button, a, input, select, textarea, [role=button], [data-no-drag]")
      )
        return;
      event.preventDefault();
      const action = event.detail === 2 ? "toggle-maximize" : "drag";
      void windowAction(action).catch(() => {
        toast.error("The window could not be moved or resized. Try again.");
      });
    };
    target.addEventListener("mousedown", drag);
    return () => target.removeEventListener("mousedown", drag);
  }, [target]);
  if (!isDesktop) return children;

  return (
    <TitlebarTarget.Provider value={target}>
      <div className="desktop-shell">
        <header
          ref={setTarget}
          className="desktop-titlebar"
          role="toolbar"
          aria-label="Window toolbar"
        />
        <div className="desktop-content">{children}</div>
      </div>
    </TitlebarTarget.Provider>
  );
}

export function WorkspaceHeaderSlot({ children }: { children: ReactNode }) {
  const target = useContext(TitlebarTarget);
  if (!isDesktop)
    return (
      <header className="web-titlebar" role="toolbar" aria-label="Workspace toolbar">
        {children}
      </header>
    );
  return target ? createPortal(children, target) : null;
}
