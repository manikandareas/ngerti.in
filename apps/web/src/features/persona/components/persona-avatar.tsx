import { Mascot } from "@/components/mascot/mascot";
import type { PersonaContent } from "@/features/persona/types";

export function PersonaAvatar({ profile }: { profile?: Pick<PersonaContent, "name" | "avatar"> }) {
  return profile?.avatar === "initial" ? (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 font-bold text-foreground"
    >
      {Array.from(profile.name)[0]?.toLocaleUpperCase()}
    </span>
  ) : (
    <Mascot className="size-9" />
  );
}
