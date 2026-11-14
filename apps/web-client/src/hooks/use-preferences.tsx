import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { clientScope, scopedStorageKey } from "@/lib/client-scope";

export const preferencesKey = "ngertiin:preferences:v1";
export const defaultPreferences = {
  startup: "last" as "last" | "tobi",
  textSize: "default" as "small" | "default" | "large",
  readingWidth: "wide" as "comfortable" | "wide",
  sendShortcut: "enter" as "enter" | "mod-enter",
  smoothStreaming: true,
  showTimestamps: true,
  animateAvatars: true,
  followPointer: true,
  alwaysShowActions: false,
  persistDrafts: true,
};
export type Preferences = typeof defaultPreferences;

export function parsePreferences(raw: string | null): Preferences {
  try {
    const saved: unknown = JSON.parse(raw ?? "null");
    if (!saved || typeof saved !== "object" || !("version" in saved) || saved.version !== 1)
      return { ...defaultPreferences };
    const values = saved as Record<string, unknown>;
    const result = { ...defaultPreferences };
    for (const key of [
      "smoothStreaming",
      "showTimestamps",
      "animateAvatars",
      "followPointer",
      "alwaysShowActions",
      "persistDrafts",
    ] as const) {
      if (typeof values[key] === "boolean") result[key] = values[key];
    }
    if (values.startup === "last" || values.startup === "tobi") result.startup = values.startup;
    if (values.textSize === "small" || values.textSize === "default" || values.textSize === "large")
      result.textSize = values.textSize;
    if (values.readingWidth === "comfortable" || values.readingWidth === "wide")
      result.readingWidth = values.readingWidth;
    if (values.sendShortcut === "enter" || values.sendShortcut === "mod-enter")
      result.sendShortcut = values.sendShortcut;
    return result;
  } catch {
    return { ...defaultPreferences };
  }
}
function readPreferences() {
  try {
    return parsePreferences(localStorage.getItem(scopedStorageKey(preferencesKey)));
  } catch {
    return { ...defaultPreferences };
  }
}

const PreferencesContext = createContext<{
  preferences: Preferences;
  update: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  reset: () => void;
  error: string;
} | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const storageKey = scopedStorageKey(preferencesKey);
  const scopePrefix = clientScope()?.key;
  const [preferences, setPreferences] = useState(readPreferences);
  const [error, setError] = useState("");
  function save(next: Preferences) {
    setPreferences(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, ...next }));
      setError("");
    } catch {
      setError("Preferensi berlaku saat ini, tetapi belum dapat disimpan di perangkat ini.");
    }
  }
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === storageKey || event.key === null))
        setPreferences(readPreferences());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [storageKey]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.chatTextSize = preferences.textSize;
    root.dataset.readingWidth = preferences.readingWidth;
    root.dataset.messageActions = preferences.alwaysShowActions ? "always" : "hover";
    if (!preferences.persistDrafts) {
      try {
        for (const key of Object.keys(localStorage))
          if (key.startsWith(scopePrefix ? `${scopePrefix}draft:` : "ngertiin:draft:"))
            localStorage.removeItem(key);
      } catch {
        // In-memory editing remains available without browser storage.
      }
    }
  }, [
    preferences.textSize,
    preferences.readingWidth,
    preferences.alwaysShowActions,
    preferences.persistDrafts,
    scopePrefix,
  ]);
  return (
    <PreferencesContext.Provider
      value={{
        preferences,
        update: (key, value) => save({ ...preferences, [key]: value }),
        reset: () => save({ ...defaultPreferences }),
        error,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}
export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("Preferences requires the application provider.");
  return context;
}
