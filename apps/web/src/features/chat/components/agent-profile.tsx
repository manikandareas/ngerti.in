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
      className="pointer-events-auto -mt-5 h-auto max-w-[min(180px,40vw)] flex-col gap-0 cursor-pointer rounded-full bg-transparent! px-2 py-0 hover:bg-transparent! [&>span[aria-hidden]]:size-[88px]"
      onClick={onClick}
      aria-label="Buka panel asisten"
      aria-expanded={open}
      aria-controls="assistant-panel"
    >
      <PersonaAvatar profile={persona.data?.profile} />
      <span className="relative -mt-4 max-w-full truncate rounded-full bg-muted/90 px-3 py-1 text-xs font-medium">
        {persona.data?.profile.name ?? "Gwen"}
      </span>
    </Button>
  );
}
