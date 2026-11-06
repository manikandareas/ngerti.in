import { ArrowLeft01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type FileView, FileViewer } from "@/features/conversation/components/file-viewer";
import { agentStyle } from "@/features/conversation/components/identity";
import { ActivityPreview, RoutingPreview } from "./activity-preview";
import { findStudioSection, studioSections } from "./catalog";
import { ComputerPreview } from "./computer-preview";
import { AnswerPreview, FilesPreview, SourcesPreview, TimelinePreview } from "./content-previews";
import { sampleFiles, tobi } from "./fixtures";
import { ProductInputPreview } from "./interaction-previews";
import type { OpenSample } from "./preview-primitives";
import { StudioComposer } from "./studio-composer";
import "./studio.css";

const stateCount = studioSections.reduce((count, section) => count + section.states.length, 0);

export default function AssistantStudio() {
  const search = useSearch({ from: "/assistant-studio" });
  const navigate = useNavigate();
  const section = findStudioSection(search.section);
  const selected = section.states.find((state) => state.id === search.state) ?? section.states[0];
  const group = search.mode !== "dm";
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const [file, setFile] = useState<FileView | null>(null);
  const filtered = studioSections.filter((item) =>
    [item.label, item.description, ...item.states.map((state) => state.label)]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    const previous = document.title;
    document.title = "Assistant studio · Ngertiin";
    return () => {
      document.title = previous;
    };
  }, []);

  const open: OpenSample = (kind, id) => {
    if (kind === "files") {
      const sample = sampleFiles.find((item) => item.id === id);
      if (sample)
        setFile({
          name: sample.name,
          mediaType: sample.mediaType,
          url: `data:${sample.mediaType};charset=utf-8,${encodeURIComponent(sample.content)}`,
        });
    } else if (kind === "agent") setNotice("Tobi · contoh identitas agent di studio.");
    else
      setNotice(
        kind === "goals"
          ? "Detail contoh: Siapkan katalog produk."
          : "Detail contoh: Tinjau katalog setiap Senin pukul 09.00.",
      );
  };
  function chooseState(id: string) {
    setNotice("");
    void navigate({
      to: "/assistant-studio",
      search: { section: section.id, state: id, mode: group ? "group" : "dm" },
      resetScroll: false,
    });
  }

  const props = { variant: selected.id, group, open, notify: setNotice };
  let preview: ReactNode;
  switch (section.id) {
    case "computer":
      preview = <ComputerPreview {...props} />;
      break;
    case "activity":
      preview = <ActivityPreview {...props} />;
      break;
    case "routing":
      preview = <RoutingPreview {...props} />;
      break;
    case "input":
      preview = (
        <StudioComposer
          initialText={
            ["filled", "submitting", "unconfirmed", "error"].includes(selected.id)
              ? "Ringkas (5 poin)."
              : ""
          }
        >
          <ProductInputPreview {...props} />
        </StudioComposer>
      );
      break;
    case "files":
      preview = <FilesPreview {...props} />;
      break;
    case "sources":
      preview = <SourcesPreview {...props} />;
      break;
    case "timeline":
      preview = <TimelinePreview {...props} />;
      break;
    default:
      preview = <AnswerPreview {...props} />;
  }

  return (
    <div className="assistant-studio">
      <header className="as-topbar">
        <nav aria-label="Studio navigation">
          <Link to="/" className="as-back">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
            Workspace
          </Link>
          <span aria-hidden="true">/</span>
          <span>Assistant studio</span>
        </nav>
        <div className="as-related">
          <Link to="/avatar-studio">Avatar</Link>
          <Link to="/color-studio">Warna</Link>
          <Link to="/design-system">Design system</Link>
          <ThemeSwitcher />
        </div>
      </header>
      <main className="as-main">
        <div className="as-heading">
          <div>
            <h1>Semua yang muncul di sisi assistant.</h1>
            <p>
              Jelajahi tampilan percakapan yang tersedia saat ini, termasuk sebelum dan sesudah kamu
              merespons.
            </p>
          </div>
          <p className="as-count">
            {studioSections.length} kategori <span>·</span> {stateCount} kondisi
          </p>
        </div>
        <div className="as-layout">
          <aside className="as-sidebar" aria-label="Katalog tampilan assistant">
            <label htmlFor="assistant-studio-search">Cari tampilan</label>
            <Input
              id="assistant-studio-search"
              type="search"
              placeholder="Pertanyaan, file, berhenti…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <nav aria-label="Kategori tampilan">
              {filtered.map((item, index) => (
                <Link
                  key={item.id}
                  to="/assistant-studio"
                  search={{
                    section: item.id,
                    state: item.states[0].id,
                    mode: group ? "group" : "dm",
                  }}
                  resetScroll={false}
                  aria-current={item.id === section.id ? "page" : undefined}
                  onClick={() => setNotice("")}
                >
                  <span className="as-nav-number">{String(index + 1).padStart(2, "0")}</span>
                  <span>{item.label}</span>
                  <span className="as-nav-count">{item.states.length}</span>
                </Link>
              ))}
            </nav>
            {filtered.length === 0 && (
              <p className="as-empty">Tidak ada tampilan yang cocok. Coba kata kunci lain.</p>
            )}
            <p className="as-local-note">
              Data contoh lokal. Interaksi di studio tidak mengirim pesan atau menjalankan agent.
            </p>
          </aside>
          <section className="as-content" aria-labelledby="studio-section-title">
            <header className="as-section-heading">
              <p className="as-placement">{section.placement}</p>
              <h2 id="studio-section-title">{section.label}</h2>
              <p>{section.description}</p>
            </header>
            <fieldset className="as-states" aria-label="Kondisi tampilan">
              {section.states.map((state) => (
                <button
                  key={state.id}
                  type="button"
                  aria-pressed={state.id === selected.id}
                  onClick={() => chooseState(state.id)}
                >
                  {state.label}
                </button>
              ))}
            </fieldset>
            <div className="as-preview-frame">
              <header className="as-preview-toolbar">
                <span>
                  Preview <span aria-hidden="true">/</span> <strong>{selected.label}</strong>
                </span>
                <div>
                  <fieldset className="as-mode" aria-label="Jenis percakapan">
                    {(["dm", "group"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={mode === (group ? "group" : "dm")}
                        onClick={() =>
                          void navigate({
                            to: "/assistant-studio",
                            search: { section: section.id, state: selected.id, mode },
                            resetScroll: false,
                          })
                        }
                      >
                        {mode === "dm" ? "DM" : "Grup"}
                      </button>
                    ))}
                  </fieldset>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRevision((value) => value + 1);
                      setNotice("");
                    }}
                  >
                    <HugeiconsIcon icon={RefreshIcon} size={14} />
                    Ulangi contoh
                  </Button>
                </div>
              </header>
              <div
                className="as-canvas"
                data-group={group}
                style={{
                  ...agentStyle(tobi),
                  ...(group ? { "--agent-bubble": "var(--primary)" } : {}),
                }}
              >
                <div
                  className="as-thread"
                  data-studio-preview={section.id}
                  data-studio-state={selected.id}
                  key={`${section.id}:${selected.id}:${group}:${revision}`}
                >
                  {preview}
                  {selected.id === "handoff_requested" && (
                    <p className="as-hidden-state">Tidak ada bar handoff yang ditampilkan.</p>
                  )}
                </div>
              </div>
            </div>
            <div className="as-caption">
              <span aria-hidden="true" />
              {selected.description}
            </div>
            <div className="as-feedback" role="status" aria-live="polite">
              {notice}
            </div>
            <details className="as-source">
              <summary>Komponen yang digunakan</summary>
              <p>{section.source}</p>
              <p>
                Preview memakai komponen percakapan yang sama dengan app. Pertanyaan dan persetujuan
                mengikuti abstraksi aplikasi di DM dan grup.
              </p>
            </details>
          </section>
        </div>
      </main>
      <FileViewer file={file} close={() => setFile(null)} />
    </div>
  );
}
