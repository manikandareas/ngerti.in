import { personaFields } from "@/features/persona/hooks/use-persona-draft";
import type { PersonaContent } from "@/features/persona/types";

const labels = { name: "Nama", tagline: "Deskripsi", avatar: "Avatar", soul: "Karakter" };
export function PersonaChanges({
  before,
  after,
}: {
  before: PersonaContent;
  after: PersonaContent;
}) {
  const fields = personaFields.filter((field) => before[field] !== after[field]);
  return (
    <div className="space-y-4 text-sm">
      {fields.length ? (
        fields.map((field) => (
          <div key={field}>
            <p className="font-bold">{labels[field]}</p>
            <div className="mt-2 space-y-2">
              <div className="rounded-lg bg-muted p-3">
                <p className="mb-1 text-xs text-muted-foreground">Sebelumnya</p>
                <p className="whitespace-pre-wrap wrap-anywhere">
                  {before[field] || "Belum diisi"}
                </p>
              </div>
              <div className="rounded-lg bg-primary/10 p-3">
                <p className="mb-1 text-xs text-muted-foreground">Menjadi</p>
                <p className="whitespace-pre-wrap wrap-anywhere">{after[field] || "Dikosongkan"}</p>
              </div>
            </div>
          </div>
        ))
      ) : (
        <p className="text-muted-foreground">Belum ada perubahan.</p>
      )}
    </div>
  );
}
