import { useId, useState } from "react";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePersonaCommands } from "@/features/persona/hooks/use-persona";
import { personaFields, usePersonaDraft } from "@/features/persona/hooks/use-persona-draft";
import type { PersonaProfile } from "@/features/persona/types";
import { PersonaAvatar } from "./persona-avatar";
import { PersonaChanges } from "./persona-changes";

export function PersonaEditor({
  profile,
  section,
  onDiscuss,
}: {
  profile: PersonaProfile;
  section: "profile" | "soul";
  onDiscuss: () => void;
}) {
  const editor = usePersonaDraft();
  const formId = useId();
  const command = usePersonaCommands();
  const [message, setMessage] = useState("");
  const draft = editor.draft;
  const content = draft?.content ?? profile;
  const stale = Boolean(draft && draft.base.revision !== profile.revision);
  const changed = Boolean(draft && personaFields.some((f) => draft.base[f] !== content[f]));
  async function save() {
    if (!draft) return;
    const { name, tagline, avatar, soul } = content;
    const result = await command.send("/edit", {
      expected_revision: draft.base.revision,
      content: { name, tagline, avatar, soul },
    });
    if (result) {
      editor.clear();
      setMessage("Perubahan tersimpan. Berlaku pada percakapan dan pekerjaan baru.");
    }
  }
  return (
    <section
      className="space-y-5"
      aria-label={section === "soul" ? `Karakter ${profile.name}` : `Profil ${profile.name}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold">
            {section === "soul" ? `Karakter ${profile.name}` : `Profil ${profile.name}`}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {section === "soul"
              ? "Cara asistenmu membantu, berbicara, dan bersikap."
              : "Identitas yang kamu lihat di semua percakapan."}
          </p>
        </div>
        {!draft ? (
          <Button
            variant="outline"
            onClick={() => {
              editor.begin(profile);
              setMessage("");
            }}
          >
            Edit
          </Button>
        ) : null}
      </div>
      {draft ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className="space-y-5"
        >
          <fieldset disabled={command.pending} className="space-y-4">
            {section === "profile" ? (
              <>
                <label htmlFor={`${formId}-name`} className="block space-y-2 text-sm font-medium">
                  Nama asisten
                  <Input
                    id={`${formId}-name`}
                    value={content.name}
                    maxLength={50}
                    required
                    onChange={(e) => editor.change({ ...content, name: e.target.value })}
                  />
                </label>
                <label
                  htmlFor={`${formId}-tagline`}
                  className="block space-y-2 text-sm font-medium"
                >
                  Deskripsi singkat
                  <Input
                    id={`${formId}-tagline`}
                    value={content.tagline}
                    maxLength={160}
                    onChange={(e) => editor.change({ ...content, tagline: e.target.value })}
                  />
                </label>
                <div>
                  <p className="mb-2 text-sm font-medium">Avatar</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={content.avatar === "gwen" ? "default" : "outline"}
                      aria-pressed={content.avatar === "gwen"}
                      onClick={() => editor.change({ ...content, avatar: "gwen" })}
                    >
                      Gwen
                    </Button>
                    <Button
                      type="button"
                      variant={content.avatar === "initial" ? "default" : "outline"}
                      aria-pressed={content.avatar === "initial"}
                      onClick={() => editor.change({ ...content, avatar: "initial" })}
                    >
                      Inisial nama
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <label htmlFor={`${formId}-soul`} className="block space-y-2 text-sm font-medium">
                Soul
                <Textarea
                  id={`${formId}-soul`}
                  className="min-h-72 resize-y leading-relaxed"
                  value={content.soul}
                  maxLength={4000}
                  required
                  onChange={(e) => editor.change({ ...content, soul: e.target.value })}
                />
                <span className="block text-xs font-normal text-muted-foreground">
                  Tulis dengan bahasa biasa. Heading dan daftar Markdown juga bisa digunakan.
                </span>
              </label>
            )}
          </fieldset>
          {stale ? (
            <div role="alert" className="space-y-3 rounded-lg bg-muted p-3 text-sm">
              <p>Profil berubah di tempat lain. Draftmu tetap tersimpan.</p>
              <Button type="button" variant="outline" onClick={() => editor.rebase(profile)}>
                Tinjau draft pada versi terbaru
              </Button>
            </div>
          ) : null}
          {changed ? (
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Lihat perubahan sebelum menyimpan
              </summary>
              <div className="mt-3">
                <PersonaChanges before={draft.base} after={content} />
              </div>
            </details>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!changed || stale || command.pending}>
              {command.pending ? "Menyimpan…" : "Simpan perubahan"}
            </Button>
            <Button type="button" variant="ghost" disabled={command.pending} onClick={editor.clear}>
              Batalkan draft
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Draft disimpan pada perangkat ini sampai kamu menyimpan atau membatalkannya.
          </p>
        </form>
      ) : section === "profile" ? (
        <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-5">
          <PersonaAvatar profile={profile} />
          <div className="min-w-0">
            <p className="font-bold wrap-anywhere">{profile.name}</p>
            <p className="text-sm text-muted-foreground wrap-anywhere">{profile.tagline}</p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-5 text-sm leading-relaxed wrap-anywhere [&_h1]:text-lg [&_h2]:text-base [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-5">
          <Streamdown mode="static">{profile.soul}</Streamdown>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" onClick={onDiscuss}>
          Bicarakan lewat chat
        </Button>
        <span className="text-xs text-muted-foreground">
          {section === "soul" ? "SOUL.md" : "IDENTITY.md"} · versi {profile.revision}
        </span>
      </div>
      {message ? (
        <p role="status" className="text-sm text-foreground">
          {message}
        </p>
      ) : null}
      {command.error ? (
        <p role="alert" className="text-sm text-danger">
          {command.error}
        </p>
      ) : null}
    </section>
  );
}
