import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MarkdownDocument } from "@/features/conversation/components/answer";
import { ComposerInput } from "@/features/conversation/components/composer-input";
import { AgentAvatar } from "@/features/avatar/components/agent-avatar";
import { createAvatar } from "../../../packages/avatar/src/config";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Search01Icon,
  Add01Icon,
  ComputerIcon,
  ArrowUp02Icon,
  Sun03Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import reply from "../fixtures/reply.md?raw";
import "./client.css";
import "./reference.css";
import "./comparison.css";

const recipes = {
  tobi: createAvatar("tobi-circle", { shape: "circle", color: "lilac", face: "calm" }),
  kira: createAvatar("gpui-kira", { shape: "capsule", color: "seafoam", face: "curious" }),
  nara: createAvatar("gpui-nara", { shape: "squircle", color: "rose", face: "calm" }),
};
const welcome =
  "Hi, I'm Tobi. Tell me what you'd like to work on. I can help you create and configure agents through our conversation.";
const question =
  "Bantu cek apakah UI Ngertiin bisa kita buat dengan GPUI. Mulai dari percakapan dan composer.";
function Reference() {
  const [dark, setDark] = useState(new URLSearchParams(location.search).get("theme") === "dark");
  const [scene, setScene] = useState(
    new URLSearchParams(location.search).get("scene") ?? "conversation",
  );
  const [panel, setPanel] = useState(new URLSearchParams(location.search).has("panel"));
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  const portrait = (name: keyof typeof recipes, size: number) => (
    <AgentAvatar config={recipes[name]} size={size} animated={false} />
  );
  const bubble = (text: string, user = false) => (
    <div className={`ref-message ${user ? "ref-user" : ""}`}>
      <div className="ref-bubble">
        <MarkdownDocument text={text} />
        <time className="message-time">10.25</time>
      </div>
    </div>
  );
  return (
    <div className={dark ? "dark" : ""}>
      <div className="workspace-shell ref-shell">
        <aside className="workspace-sidebar">
          <div className="ref-sidebar">
            <div className="ref-search">
              <span>
                <HugeiconsIcon icon={Search01Icon} size={15} /> Search
              </span>
              <button onClick={() => setDraft("[@Tobi](ngertiin://agent/tobi)")}>
                <HugeiconsIcon icon={Add01Icon} size={18} />
              </button>
            </div>
            <div className="ref-contacts">
              {(["tobi", "kira", "nara"] as const).map((name, index) => (
                <button
                  key={name}
                  className={`contact-row ref-contact ${index === 0 ? "contact-row-active" : ""}`}
                  onClick={() => setScene("conversation")}
                >
                  {portrait(name, 44)}
                  <span>
                    <strong>{name[0].toUpperCase() + name.slice(1)}</strong>
                    <small>
                      {
                        [
                          "Let's explore the native workspace",
                          "Design, research, and a little curiosity",
                          "Belum ada pesan",
                        ][index]
                      }
                    </small>
                  </span>
                </button>
              ))}
            </div>
            <small>Web reference</small>
            <div className="ref-footer">
              <button onClick={() => setDark(!dark)}>
                <HugeiconsIcon icon={Sun03Icon} size={18} />
              </button>
              <button onClick={() => setPanel(!panel)}>
                <HugeiconsIcon icon={Settings01Icon} size={15} /> Experiments
              </button>
            </div>
          </div>
        </aside>
        <main className="workspace-main ref-main" data-details={panel}>
          <header className="ref-header">
            <span />
            <button className="header-action ref-identity" onClick={() => setPanel(!panel)}>
              {portrait("tobi", 25)} {scene === "html" ? "report.html" : "Tobi"}
            </button>
            <button className="header-action ref-computer" onClick={() => setScene("html")}>
              <HugeiconsIcon icon={ComputerIcon} size={18} />
            </button>
          </header>
          {scene === "html" ? (
            <iframe className="ref-html" src="/preview.html" title="report.html" />
          ) : (
            <div className="ref-scroll">
              <div className="ref-column">
                {scene === "rich" ? (
                  bubble(reply)
                ) : (
                  <>
                    {bubble(welcome)}
                    {bubble(question, true)}
                    {sent.map((text) => bubble(text, true))}
                    <div className="ref-quick">
                      <button onClick={() => setScene("rich")}>Rich answer</button>
                      <button onClick={() => setScene("avatars")}>Avatar</button>
                      <button onClick={() => setScene("html")}>HTML preview</button>
                    </div>
                    {scene === "avatars" && (
                      <div className="ref-portraits">
                        {portrait("tobi", 160)}
                        {portrait("kira", 160)}
                        {portrait("nara", 160)}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          <div className="ref-composer-dock">
            <form
              className="conversation-composer ref-composer"
              onSubmit={(event) => event.preventDefault()}
            >
              <button
                type="button"
                className="ref-attach"
                onClick={() => setDraft("[@Tobi](ngertiin://agent/tobi)")}
              >
                <HugeiconsIcon icon={Add01Icon} size={18} />
              </button>
              <ComposerInput
                value={draft}
                placeholder="Pesan untuk Tobi…"
                readOnly={false}
                lookup={() => undefined}
                retry={() => {}}
                onChange={setDraft}
                onEnter={() => {
                  if (draft.trim()) {
                    setSent([...sent, draft]);
                    setDraft("");
                  }
                }}
                onFiles={() => {}}
                onMultiline={() => {}}
                report={() => {}}
                suggestions={false}
              />
              <button
                type="button"
                className="composer-send"
                onClick={() => {
                  if (draft.trim()) {
                    setSent([...sent, draft]);
                    setDraft("");
                  }
                }}
              >
                <HugeiconsIcon icon={ArrowUp02Icon} size={16} />
              </button>
            </form>
            <div className="ref-status">
              <small>Local fixture · no model inference</small>
              <small>Save draft　 Restore</small>
            </div>
          </div>
        </main>
        {panel && (
          <aside className="ref-panel">
            <div className="ref-panel-tabs">
              <button>Detail</button>
              <button onClick={() => setScene("rich")}>Library</button>
              <button onClick={() => setScene("html")}>Computer</button>
              <button onClick={() => setPanel(false)}>×</button>
            </div>
            <div className="ref-panel-content">
              {portrait("tobi", 90)}
              <strong>Tobi</strong>
              <small>Your persistent workspace agent</small>
              <hr />
              <p>About</p>
              <small>A small native experiment using the existing Ngertiin design language.</small>
              <p>Goals</p>
              <small>Explore visual fidelity with GPUI</small>
              <p>Routine</p>
              <small>No scheduled work in this experiment</small>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <ThemeProvider forcedTheme="light">
    <TooltipProvider>
      <Reference />
    </TooltipProvider>
  </ThemeProvider>,
);
