import { useEffect, useRef, useState } from "react";

function useMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return mobile;
}

export function useChatHistory() {
  const mobile = useMobile();
  const [panelOpen, setPanelOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const historyToggle = useRef<HTMLButtonElement>(null);
  const chatArea = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mobile || !panelOpen) return;
    function dismissOnChatClick(event: PointerEvent) {
      if (event.target instanceof Node && chatArea.current?.contains(event.target)) {
        setPanelOpen(false);
      }
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) {
        setPanelOpen(false);
        historyToggle.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismissOnChatClick);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOnChatClick);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [mobile, panelOpen]);

  function toggleHistory(): void {
    if (mobile) setDrawerOpen((open) => !open);
    else setPanelOpen((open) => !open);
  }

  function closePanel(): void {
    setPanelOpen(false);
    historyToggle.current?.focus();
  }

  function closeDrawer(): void {
    setDrawerOpen(false);
  }

  return {
    mobile,
    panelOpen,
    drawerOpen,
    setDrawerOpen,
    historyToggle,
    chatArea,
    toggleHistory,
    closePanel,
    closeDrawer,
  };
}
