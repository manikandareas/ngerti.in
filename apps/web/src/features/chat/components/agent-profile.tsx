import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { PersonaAvatar } from "@/features/persona/components/persona-avatar";
import { usePersona } from "@/features/persona/hooks/use-persona";

export function AgentProfile({
  onClick,
  open,
  triggerRef,
}: {
  onClick: () => void;
  open: boolean;
  triggerRef: Ref<HTMLButtonElement>;
}) {
  const persona = usePersona();
  return (
    <Button
      ref={triggerRef}
      variant="ghost"
      className="h-11 max-w-[min(220px,48vw)] gap-2 rounded-xl px-3"
      onClick={onClick}
      aria-label="Buka panel asisten"
      aria-expanded={open}
      aria-controls="assistant-panel"
    >
      <PersonaAvatar profile={persona.data?.profile} />
      <span className="truncate text-sm font-bold">{persona.data?.profile.name ?? "Gwen"}</span>
    </Button>
  );
}
