import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import type { ResourceRef } from "../types";

interface ResourceContext {
  threadId: string | null;
  opened: ResourceRef | null;
  open: (ref: ResourceRef | null) => void;
  discuss: () => void;
}
const Context = createContext<ResourceContext | null>(null);
export function ResourceProvider({
  threadId,
  discuss,
  onOpen,
  opened,
  setOpened,
  children,
}: {
  threadId: string | null;
  discuss: () => void;
  onOpen?: () => void;
  opened: ResourceRef | null;
  setOpened: (ref: ResourceRef | null) => void;
  children: ReactNode;
}) {
  return (
    <Context.Provider
      value={{
        threadId,
        opened,
        open: (ref) => {
          if (ref) onOpen?.();
          setOpened(ref);
        },
        discuss,
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
