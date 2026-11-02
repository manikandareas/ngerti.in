export type SettingsSectionId = "general" | "providers" | "about";

export function validateSettingsSearch(search: Record<string, unknown>): {
  settings?: SettingsSectionId;
  provider?: "codex" | "muse";
} {
  return {
    settings:
      search.settings === "general" ||
      search.settings === "providers" ||
      search.settings === "about"
        ? search.settings
        : undefined,
    provider:
      search.settings === "providers" && (search.provider === "codex" || search.provider === "muse")
        ? search.provider
        : undefined,
  };
}
