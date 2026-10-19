import { useAuth } from "@clerk/tanstack-react-start";
import { useEffect, useState } from "react";
import type { PersonaContent, PersonaProfile } from "@/features/persona/types";

interface Draft {
  base: PersonaProfile;
  content: PersonaContent;
}
export const personaFields = ["name", "tagline", "avatar", "soul"] as const;

export function usePersonaDraft() {
  const { userId } = useAuth();
  const key = `persona-draft:v1:${userId}`;
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    setDraft(null);
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
      if (
        saved &&
        Number.isInteger(saved.base?.revision) &&
        personaFields.every(
          (field) =>
            typeof saved.content?.[field] === "string" && typeof saved.base?.[field] === "string",
        )
      )
        setDraft(saved);
    } catch {
      /* Optional draft storage. */
    }
  }, [key]);
  function write(value: Draft | null) {
    setDraft(value);
    try {
      if (value) sessionStorage.setItem(key, JSON.stringify(value));
      else sessionStorage.removeItem(key);
    } catch {
      /* Draft stays in memory if persistence is unavailable. */
    }
  }
  return {
    draft,
    begin: (profile: PersonaProfile) => write({ base: profile, content: { ...profile } }),
    change: (content: PersonaContent) => {
      if (draft) write({ ...draft, content });
    },
    clear: () => write(null),
    rebase: (profile: PersonaProfile) => {
      if (!draft) return;
      const content: PersonaContent = { ...profile };
      for (const field of personaFields) {
        if (draft.content[field] !== draft.base[field])
          Object.assign(content, { [field]: draft.content[field] });
      }
      write({ base: profile, content });
    },
  };
}
