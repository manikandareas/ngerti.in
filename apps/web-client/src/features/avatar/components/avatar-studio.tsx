import {
  ArrowDown01Icon,
  ArrowLeft02Icon,
  Cursor01Icon,
  DiceFaces05Icon,
  Download04Icon,
  FileUploadIcon,
  Moon02Icon,
  RotateLeft01Icon,
  SparklesIcon,
  Sun03Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useSearch } from "@tanstack/react-router";

import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { command, request } from "@/lib/api-client";
import type { Agent } from "@/types/workspace";
import {
  type AvatarAction,
  type AvatarColor,
  type AvatarFace,
  type AvatarShape,
  type AvatarState,
  avatarActions,
  avatarColors,
  avatarFaces,
  avatarShapes,
  avatarStates,
} from "../engine/catalog";
import {
  type AvatarConfig,
  createAvatar,
  defaultAgentAvatar,
  parseAvatarConfig,
} from "../engine/config";
import type { AvatarController } from "../engine/controller";
import { downloadAvatarFile, exportAvatar } from "../engine/export";
import { AgentAvatar } from "./agent-avatar";
import "./studio.css";

const storageKey = "ngertiin-avatar-studio-v1";
const initialConfig = createAvatar("tobi-circle", {
  shape: "circle",
  color: "lilac",
  face: "calm",
});
const tabs = { shape: "Bentuk", face: "Ekspresi", motion: "Gerak" } as const;
const stateLabels: Record<AvatarState, string> = {
  idle: "Santai",
  listening: "Mendengarkan",
  thinking: "Berpikir",
  working: "Bekerja",
  celebrating: "Merayakan",
  sleeping: "Tidur",
  error: "Perlu bantuan",
};
const actionLabels: Record<AvatarAction, string> = {
  boop: "Boop!",
  wave: "Menyapa",
  hop: "Melompat",
  wiggle: "Bergoyang",
  spin: "Berputar",
  wink: "Mengedip",
};

function loadConfig(): AvatarConfig {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved ? (parseAvatarConfig(JSON.parse(saved)) ?? initialConfig) : initialConfig;
  } catch {
    return initialConfig;
  }
}

function randomAvatar(): AvatarConfig {
  return createAvatar(crypto.randomUUID());
}

function makeFamily(): AvatarConfig[] {
  return ["circle", "oval", "squircle", "capsule", "triangle", "hexagon"].map((shape, index) =>
    createAvatar(`little-friends-${index}`, {
      shape: shape as AvatarShape,
      color: (["lilac", "sky", "rose", "mint", "butter", "tangerine"] as AvatarColor[])[index],
      face: (["happy", "curious", "shy", "calm", "excited", "happy"] as AvatarFace[])[index],
    }),
  );
}

export default function AvatarStudio() {
  const { agent: agentId } = useSearch({ from: "/avatar-studio" });
  const [target, setTarget] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(!!agentId);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [config, setConfig] = useState(loadConfig);
  const [tab, setTab] = useState<keyof typeof tabs>("shape");
  const [state, setState] = useState<AvatarState>("idle");
  const [family, setFamily] = useState(makeFamily);
  const [exporting, setExporting] = useState(false);
  const [followPointer, setFollowPointer] = useState(true);
  const [reaction, setReaction] = useState("");
  const [storageError, setStorageError] = useState(false);
  const controller = useRef<AvatarController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    if (!agentId) {
      setTarget(null);
      setLoading(false);
      return;
    }
    const abort = new AbortController();
    setLoading(true);
    setLoadError("");
    setSaved(null);
    setSaveError("");
    request<Agent>(
      `/v1/entities/agent/${encodeURIComponent(agentId)}`,
      undefined,
      undefined,
      abort.signal,
    )
      .then((agent) => {
        if (abort.signal.aborted) return;
        setTarget(agent);
        setConfig(
          parseAvatarConfig(agent.avatar_config) ??
            defaultAgentAvatar(agent.id, agent.system_role === "tobi"),
        );
        setState("idle");
      })
      .catch((error) => {
        if (!abort.signal.aborted) setLoadError(error.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [agentId]);

  useEffect(() => {
    if (agentId) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(config));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [config, agentId]);
  useEffect(() => () => clearTimeout(reactionTimer.current), []);

  function play(action: AvatarAction) {
    controller.current?.play(action);
    setReaction(actionLabels[action]);
    clearTimeout(reactionTimer.current);
    reactionTimer.current = setTimeout(() => setReaction(""), 1600);
  }

  async function download(format: "svg" | "png") {
    setExporting(true);
    try {
      await exportAvatar(config, format, state);
    } catch {
      toast.error("Avatar belum bisa diunduh. Silakan coba lagi.");
    } finally {
      setExporting(false);
    }
  }

  async function importRecipe(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 16384) throw new Error("Recipe too large.");
      const recipe = parseAvatarConfig(JSON.parse(await file.text()));
      if (!recipe) throw new Error("Invalid recipe.");
      setConfig(recipe);
      setState("idle");
      toast.success("Karakter berhasil dibuka.");
    } catch {
      toast.error("File karakter tidak valid. Gunakan resep avatar versi 1.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function chooseConfig(value: AvatarConfig) {
    setConfig(value);
    setState("idle");
  }

  async function saveToAgent() {
    if (!target || saving) return;
    setSaving(true);
    setSaveError("");
    setSaved(null);
    try {
      const updated = await command<Agent>(`/v1/agents/${target.id}/configuration`, {
        expected_revision: target.revision,
        changes: { avatar_config: config },
      });
      setTarget(updated);
      setSaved(JSON.stringify(config));
      toast.success(`Avatar ${updated.name} tersimpan.`);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? `${error.message} Buka ulang editor untuk memuat profil terbaru sebelum mencoba lagi.`
          : "Avatar belum tersimpan.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (agentId && (loading || loadError || target?.id !== agentId))
    return (
      <main className="avatar-studio space-y-4 py-12">
        <Link to="/">Kembali ke Ngertiin</Link>
        <p role={loadError ? "alert" : "status"}>{loadError || "Memuat avatar agent…"}</p>
      </main>
    );

  return (
    <main className="avatar-studio">
      <header className="studio-header">
        <div className="studio-breadcrumb">
          <Link to="/" className="studio-icon-button" aria-label="Kembali ke Ngertiin">
            <HugeiconsIcon icon={ArrowLeft02Icon} size={17} />
          </Link>
          <span className="studio-wordmark">
            ngertiin<span>.</span>
          </span>
          <span className="studio-divider">/</span>
          <span>Avatar Studio</span>
        </div>
        <button
          type="button"
          className="studio-icon-button"
          aria-label={resolvedTheme === "dark" ? "Gunakan tema terang" : "Gunakan tema gelap"}
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {resolvedTheme === "dark" ? (
            <HugeiconsIcon icon={Sun03Icon} size={18} />
          ) : (
            <HugeiconsIcon icon={Moon02Icon} size={18} />
          )}
        </button>
      </header>

      <section className="studio-intro">
        <div>
          <h1>Teman kecil, banyak ekspresi.</h1>
          <p>
            {target
              ? `Karakter untuk ${target.name}. Dipakai di DM dan grup.`
              : "Beri agent-mu karakter yang hidup. Mulai dari satu bentuk."}
          </p>
        </div>
        <button
          type="button"
          className="studio-button"
          onClick={() => {
            chooseConfig(randomAvatar());
            play("wave");
          }}
        >
          <HugeiconsIcon icon={DiceFaces05Icon} size={16} /> Acak karakter
        </button>
      </section>

      {target && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="studio-button studio-button-primary"
            disabled={saving}
            onClick={() => void saveToAgent()}
          >
            {saving ? "Menyimpan…" : `Gunakan untuk ${target.name}`}
          </button>
          {saved === JSON.stringify(config) && (
            <span role="status" className="text-sm text-muted-foreground">
              Avatar tersimpan untuk {target.name}.
            </span>
          )}
          {saveError && (
            <p role="alert" className="text-sm text-destructive">
              {saveError}
            </p>
          )}
        </div>
      )}

      <div className="studio-workbench">
        <section className="studio-preview" aria-label="Pratinjau avatar">
          <div className="studio-stage">
            <div className="studio-stage-top">
              <span className="studio-live">
                <span /> {stateLabels[state]}
              </span>
              <button
                type="button"
                className="studio-icon-button"
                aria-label="Reset karakter"
                onClick={() => chooseConfig(initialConfig)}
              >
                <HugeiconsIcon icon={RotateLeft01Icon} size={16} />
              </button>
            </div>
            <button
              type="button"
              className="studio-character"
              aria-label="Sapa avatar"
              onClick={() => play("boop")}
            >
              <AgentAvatar
                ref={controller}
                config={config}
                state={state}
                size={360}
                followPointer={followPointer}
                shadow
              />
            </button>
            <span className="studio-reaction" role="status">
              {reaction}
            </span>
            <div className="studio-stage-caption">
              <span>{avatarShapes[config.shape].label}</span>
              <span>·</span>
              <span>{avatarColors[config.color].label}</span>
            </div>
            <p className="studio-stage-hint">
              Klik untuk menyapa.{" "}
              {followPointer ? "Aku melihat ke arah kursormu." : "Aku di sini menemanimu."}
            </p>
          </div>

          <div className="studio-preview-toolbar">
            <label className="studio-state-label" htmlFor="avatar-state">
              <span>State agent</span>
              <span className="studio-select-wrap">
                <select
                  id="avatar-state"
                  value={state}
                  onChange={(event) => setState(event.target.value as AvatarState)}
                >
                  {Object.keys(avatarStates).map((value) => (
                    <option key={value} value={value}>
                      {stateLabels[value as AvatarState]}
                    </option>
                  ))}
                </select>
                <HugeiconsIcon icon={ArrowDown01Icon} size={14} />
              </span>
            </label>
            <label className="studio-pointer-toggle">
              <input
                type="checkbox"
                checked={followPointer}
                onChange={(event) => setFollowPointer(event.target.checked)}
              />
              <HugeiconsIcon icon={Cursor01Icon} size={14} />
              <span>Ikuti kursor</span>
            </label>
          </div>
          <div className="studio-export-row">
            <div className="studio-size-preview">
              <AgentAvatar config={config} state={state} size={28} animated={false} />
              <AgentAvatar config={config} state={state} size={40} animated={false} />
              <AgentAvatar config={config} state={state} size={56} animated={false} />
              <span>Lucu di setiap ukuran.</span>
            </div>
            <div className="studio-export-buttons">
              <button
                type="button"
                className="studio-button studio-button-primary"
                disabled={exporting}
                onClick={() => download("png")}
              >
                <HugeiconsIcon icon={Download04Icon} size={15} />
                {exporting ? "Menyiapkan…" : "Unduh PNG"}
              </button>
              <button
                type="button"
                className="studio-button"
                disabled={exporting}
                onClick={() => download("svg")}
              >
                SVG
              </button>
            </div>
          </div>
          <p className="studio-export-note">
            Gambar transparan 512 × 512. Animasi berjalan di engine.
          </p>
        </section>

        <section className="studio-controls" aria-label="Atur karakter">
          <fieldset className="studio-tabs" aria-label="Bagian editor">
            {Object.entries(tabs).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={tab === value}
                onClick={() => setTab(value as keyof typeof tabs)}
              >
                {label}
              </button>
            ))}
          </fieldset>
          <div className="studio-control-content">
            {tab === "shape" ? (
              <fieldset className="studio-fieldset">
                <legend>
                  Pilih bentuknya<span>{Object.keys(avatarShapes).length} bentuk</span>
                </legend>
                <div className="studio-shape-grid">
                  {Object.entries(avatarShapes).map(([shape, definition]) => (
                    <label key={shape} className="studio-avatar-option">
                      <input
                        type="radio"
                        name="avatar-shape"
                        value={shape}
                        checked={config.shape === shape}
                        onChange={() => setConfig({ ...config, shape: shape as AvatarShape })}
                      />
                      <AgentAvatar
                        config={{ ...config, shape: shape as AvatarShape, face: "happy" }}
                        size={66}
                        animated={false}
                      />
                      <span>{definition.label}</span>
                      {config.shape === shape ? (
                        <HugeiconsIcon
                          icon={Tick02Icon}
                          className="studio-selected-check"
                          size={12}
                        />
                      ) : null}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {tab === "face" ? (
              <fieldset className="studio-fieldset">
                <legend>
                  Bagaimana perasaannya?<span>8 ekspresi</span>
                </legend>
                <div className="studio-face-grid">
                  {Object.entries(avatarFaces).map(([face, label]) => (
                    <label key={face} className="studio-avatar-option">
                      <input
                        type="radio"
                        name="avatar-face"
                        value={face}
                        checked={config.face === face}
                        onChange={() => {
                          setConfig({ ...config, face: face as AvatarFace });
                          setState("idle");
                        }}
                      />
                      <AgentAvatar
                        config={{ ...config, face: face as AvatarFace }}
                        size={74}
                        animated={false}
                      />
                      <span>{label}</span>
                      {config.face === face ? (
                        <HugeiconsIcon
                          icon={Tick02Icon}
                          className="studio-selected-check"
                          size={12}
                        />
                      ) : null}
                    </label>
                  ))}
                </div>
                <p className="studio-control-hint">
                  Ekspresi ini dipakai saat santai. State agent menyesuaikan ekspresinya saat aktif.
                </p>
              </fieldset>
            ) : null}
            {tab === "motion" ? (
              <div className="studio-motion-panel">
                <h2>Ayo, coba bergerak.</h2>
                <p>Gerakan singkat untuk memberi sedikit kepribadian.</p>
                <div className="studio-motion-grid">
                  {Object.keys(avatarActions).map((action) => (
                    <button
                      type="button"
                      className="studio-button"
                      key={action}
                      onClick={() => play(action as AvatarAction)}
                    >
                      <span className="studio-motion-mark" aria-hidden="true">
                        {
                          { boop: "•", wave: "⌁", hop: "↑", wiggle: "∿", spin: "↻", wink: "◡" }[
                            action as AvatarAction
                          ]
                        }
                      </span>
                      {actionLabels[action as AvatarAction]}
                    </button>
                  ))}
                </div>
                <div className="studio-motion-note">
                  <HugeiconsIcon icon={Cursor01Icon} size={18} />
                  <p>
                    Mata mengikuti kursor, berkedip, dan bereaksi saat disapa. Coba juga ubah state
                    agent di bawah pratinjau.
                  </p>
                </div>
                <p className="studio-control-hint">
                  Pengaturan reduced motion perangkatmu tetap dihormati.
                </p>
              </div>
            ) : null}
          </div>
          <fieldset className="studio-fieldset studio-colors">
            <legend>
              Warna<span>{avatarColors[config.color].label}</span>
            </legend>
            <div className="studio-swatches">
              {Object.entries(avatarColors).map(([color, palette]) => (
                <label
                  key={color}
                  className="studio-swatch"
                  style={{ backgroundColor: palette.base }}
                >
                  <input
                    type="radio"
                    name="avatar-color"
                    value={color}
                    aria-label={palette.label}
                    checked={config.color === color}
                    onChange={() => setConfig({ ...config, color: color as AvatarColor })}
                  />
                  {config.color === color ? <HugeiconsIcon icon={Tick02Icon} size={15} /> : null}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="studio-recipe">
            <div>
              <span>
                {target
                  ? `Avatar ${target.name}`
                  : storageError
                    ? "Penyimpanan browser tidak tersedia"
                    : "Karakter tersimpan di browser"}
              </span>
              <p>Simpan resep untuk memakai karakter ini lagi.</p>
            </div>
            <div className="studio-recipe-actions">
              <button
                type="button"
                className="studio-button"
                onClick={() =>
                  downloadAvatarFile(
                    new Blob([JSON.stringify(config, null, 2)], { type: "application/json" }),
                    `ngertiin-${config.shape}.json`,
                  )
                }
              >
                <HugeiconsIcon icon={Download04Icon} size={14} />
                Simpan resep
              </button>
              <button
                type="button"
                className="studio-icon-button"
                aria-label="Buka resep karakter"
                onClick={() => fileInput.current?.click()}
              >
                <HugeiconsIcon icon={FileUploadIcon} size={16} />
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                aria-label="File resep karakter"
                hidden
                onChange={(event) => importRecipe(event.target.files?.[0])}
              />
            </div>
          </div>
        </section>
      </div>

      <section className="studio-family" aria-labelledby="family-title">
        <div className="studio-family-heading">
          <div>
            <h2 id="family-title">Kenalan dengan yang lain.</h2>
            <p>Satu engine, banyak kepribadian. Pilih yang kamu suka.</p>
          </div>
          <button
            type="button"
            className="studio-text-button"
            onClick={() => setFamily(Array.from({ length: 6 }, randomAvatar))}
          >
            <HugeiconsIcon icon={SparklesIcon} size={15} />
            Buat keluarga baru
          </button>
        </div>
        <div className="studio-family-grid">
          {family.map((friend) => (
            <button
              type="button"
              key={friend.seed}
              className="studio-friend"
              onClick={() => chooseConfig(friend)}
            >
              <AgentAvatar config={friend} size={108} animated={false} />
              <span>
                {avatarShapes[friend.shape].label}
                <small>{avatarColors[friend.color].label}</small>
              </span>
            </button>
          ))}
        </div>
      </section>
      <footer className="studio-footer">
        <span>Dibuat untuk agent Ngertiin.</span>
        <span>Karakter prosedural, kepribadian personal.</span>
      </footer>
    </main>
  );
}
