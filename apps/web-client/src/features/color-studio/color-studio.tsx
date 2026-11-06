import { Link } from "@tanstack/react-router";
import { type CSSProperties, useState } from "react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { AttachmentChip } from "@/features/conversation/components/attachment-chip";
import { AgentAvatar } from "@/features/conversation/components/identity";
import { InlineReferenceChip } from "@/features/conversation/components/inline-references";
import { palettes } from "./palettes";
import "./studio.css";

const demoFile = {
  id: "studio-file",
  name: "brand-guide.pdf",
  mediaType: "application/pdf",
  size: 245760,
  state: "ready" as const,
};
function FileMention() {
  return (
    <InlineReferenceChip reference={{ kind: "file", id: "studio-brief", label: "brief.md" }} />
  );
}
function SkillMention() {
  return (
    <InlineReferenceChip
      reference={{
        kind: "skill",
        id: "studio-skill",
        label: "/design-review",
        source: "application",
        agentId: "studio-agent",
      }}
    />
  );
}

const states = ["Lengkap", "Kosong", "Mengirim", "Error"] as const;
type State = (typeof states)[number];

function Preview({
  dark,
  palette,
  state,
  name,
  group,
}: {
  dark: boolean;
  palette: (typeof palettes)[number];
  state: State;
  name: string;
  group: boolean;
}) {
  const [draft, setDraft] = useState(
    state === "Kosong" ? "" : "Bantu rangkum arah visual dari referensi ini.",
  );
  const [sent, setSent] = useState("");
  const [attachment, setAttachment] = useState(true);
  const style = {
    "--agent-color": palette.base,
    "--agent-bubble": group ? "var(--primary)" : palette.bubble,
  } as CSSProperties;
  return (
    <section
      className={`cs-preview ${dark ? "cs-dark dark" : "theme-light-preview"}`}
      style={style}
      aria-label={`Preview ${dark ? "dark" : "light"}`}
    >
      <header>
        <AgentAvatar name="Tobi" animated={false} />
        <div>
          <strong>Tobi</strong>
          <small>
            {name} · {dark ? "Dark mode" : "Light mode"}
          </small>
        </div>
        <span className="cs-status">Siap membantu</span>
      </header>
      <div className="cs-thread">
        <p className="cs-timestamp">HARI INI · 09.41</p>
        <Bubble className="chat-user-bubble" align="end">
          <BubbleContent>
            Buat arah visual yang terasa lebih personal.
            <br />
            <AttachmentChip file={demoFile} />
          </BubbleContent>
        </Bubble>
        <Bubble className="chat-agent-bubble" variant="secondary">
          <BubbleContent>
            {group && <strong className="group-bubble-author">Tobi</strong>}
            <p>Kita bisa mulai dari warna yang tenang, dengan aksen yang mudah dikenali.</p>
            <p>
              Sudah kubaca <FileMention /> menggunakan <SkillMention />.
            </p>
            <blockquote>Warna memberi identitas. Konten tetap menjadi fokus.</blockquote>
          </BubbleContent>
        </Bubble>
        <div className="cs-tool">
          ✓ Referensi selesai dibaca <span>3 file</span>
        </div>
        {sent && (
          <Bubble className="chat-user-bubble" align="end">
            <BubbleContent>{sent}</BubbleContent>
          </Bubble>
        )}
        {state === "Mengirim" && (
          <p role="status" className="cs-working">
            Tobi sedang menyusun jawaban…
          </p>
        )}
      </div>
      <form
        className="cs-composer conversation-composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim()) {
            setSent(draft);
            setDraft("");
          }
        }}
      >
        {state !== "Kosong" && (
          <div className="cs-context">
            {attachment && (
              <AttachmentChip
                file={{
                  ...demoFile,
                  state:
                    state === "Error" ? "failed" : state === "Mengirim" ? "uploading" : "ready",
                }}
                remove={() => setAttachment(false)}
                retry={() => setAttachment(false)}
              />
            )}
            <FileMention />
            <SkillMention />
            <InlineReferenceChip
              reference={{ kind: "agent", id: "studio-agent", label: "@Tobi" }}
              actor={{ id: "studio-agent", name: "Tobi", handle: null }}
            />
          </div>
        )}
        <textarea
          aria-label={`Pesan ${dark ? "dark" : "light"}`}
          placeholder="Tulis pesan untuk Tobi…"
          value={draft}
          disabled={state === "Mengirim"}
          onChange={(event) => setDraft(event.target.value)}
        />
        {state === "Error" && (
          <p className="cs-error" role="alert">
            Attachment gagal diunggah. Hapus file atau coba lagi.
          </p>
        )}
        <footer>
          <button
            type="button"
            onClick={() => setAttachment(true)}
            disabled={attachment || state === "Kosong"}
          >
            + Attachment contoh
          </button>
          <button
            type="submit"
            aria-label="Kirim pesan"
            className="composer-send"
            disabled={!draft.trim() || state === "Mengirim" || state === "Error"}
          >
            {" "}
            {state === "Mengirim" ? "Mengirim…" : "↑"}
          </button>
        </footer>
      </form>
      <p className="cs-footnote">Preview interaktif · pesan hanya tampil di studio</p>
    </section>
  );
}

export default function ColorStudio() {
  const [group, setGroup] = useState(false);
  const [selected, setSelected] = useState(0);
  const [state, setState] = useState<State>("Lengkap");
  const [copied, setCopied] = useState("");
  const palette = palettes[selected];
  return (
    <main className="color-studio">
      <nav>
        <Link to="/">← Workspace</Link>
        <Link to="/assistant-studio">Assistant studio ↗</Link>
        <Link to="/avatar-studio">Avatar studio ↗</Link>
      </nav>
      <div className="cs-heading">
        <div>
          <p className="cs-eyebrow">IDENTITY LAB / 02</p>
          <h1>Warna yang terasa seperti mereka.</h1>
          <p>Eksplorasi identitas agent, dari percakapan sampai detail terkecil.</p>
        </div>
        <span>Color studio</span>
      </div>
      <div className="cs-layout">
        <aside>
          <h2>Katalog warna</h2>
          <p>{palettes.length} warna dari katalog Avatar Studio.</p>
          <div className="cs-palettes">
            {palettes.map((color, index) => (
              <button
                type="button"
                key={color.id}
                aria-pressed={selected === index}
                onClick={() => {
                  setSelected(index);
                  setCopied("");
                }}
              >
                <i
                  style={{ background: color.base, boxShadow: `inset 0 -12px 0 ${color.bubble}` }}
                />
                <span>
                  <strong>{color.label}</strong>
                  <small>{color.contrast.toFixed(2)}:1 · teks putih</small>
                </span>
                <span>{selected === index ? "✓" : ""}</span>
              </button>
            ))}
          </div>
          <p className="cs-note">
            Swatch menampilkan warna avatar dan turunannya untuk bubble (kontras teks putih ≥
            4.5:1). Memilih warna di sini belum mengubah identitas agent di workspace.
          </p>
          <button
            type="button"
            className="cs-export"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  JSON.stringify(
                    {
                      id: palette.id,
                      name: palette.label,
                      accent: palette.base,
                      bubble: palette.bubble,
                    },
                    null,
                    2,
                  ),
                );
                setCopied("Resep warna disalin");
              } catch {
                setCopied("Clipboard tidak tersedia");
              }
            }}
          >
            Salin resep warna
          </button>
          <p role="status">{copied}</p>
        </aside>
        <div>
          <label className="cs-mode">
            <input
              type="checkbox"
              checked={group}
              onChange={(event) => setGroup(event.target.checked)}
            />{" "}
            Preview percakapan grup
          </label>
          <p className="cs-note">
            DM: bubble pengguna dan tombol kirim mengikuti agent. Grup: keduanya memakai warna
            aplikasi; nama pengirim mengikuti agent. Avatar memiliki warna tersendiri.
          </p>
          <div className="cs-toolbar">
            <h2>
              {palette.label} <span>/ Preview</span>
            </h2>
            <fieldset aria-label="Kondisi preview">
              {states.map((item) => (
                <button
                  type="button"
                  key={item}
                  aria-pressed={state === item}
                  onClick={() => setState(item)}
                >
                  {item}
                </button>
              ))}
            </fieldset>
          </div>
          <div className="cs-previews">
            {[false, true].map((dark) => (
              <Preview
                key={`${dark}-${state}`}
                dark={dark}
                group={group}
                palette={palette}
                state={state}
                name={palette.label}
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
