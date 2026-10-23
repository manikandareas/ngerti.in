import type { ReactNode } from "react";
import { createContext, useContext, useRef } from "react";
import type { ResourceRef } from "../types";

interface ResourceContext {
  threadId: string | null;
  opened: ResourceRef | null;
  open: (ref: ResourceRef | null) => void;
  discuss: () => void;
  prepare: (text: string) => void;
}
const Context = createContext<ResourceContext | null>(null);
export function ResourceProvider({
  threadId,
  discuss,
  prepare,
  onOpen,
  opened,
  setOpened,
  children,
}: {
  threadId: string | null;
  discuss: () => void;
  prepare: (text: string) => void;
  onOpen?: () => void;
  opened: ResourceRef | null;
  setOpened: (ref: ResourceRef | null) => void;
  children: ReactNode;
}) {
  const trigger = useRef<HTMLElement | null>(null);
  return (
    <Context.Provider
      value={{
        threadId,
        opened,
        open: (ref) => {
          if (ref) {
            if (!opened || ref.id !== opened.id || ref.kind !== opened.kind)
              trigger.current = document.activeElement as HTMLElement;
            onOpen?.();
          }
          setOpened(ref);
          if (!ref)
            requestAnimationFrame(() => {
              const target = trigger.current;
              if (target?.isConnected && target !== document.body && !target.closest("[inert]"))
                target.focus();
              else document.querySelector<HTMLTextAreaElement>("#main textarea")?.focus();
            });
        },
        discuss,
        prepare,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useResourceContext() {
  const value = useContext(Context);
  if (!value) throw new Error("ResourceProvider diperlukan");
  return value;
}
