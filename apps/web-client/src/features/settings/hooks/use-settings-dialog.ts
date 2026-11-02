import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import type { ProviderId } from "@/features/settings/components/shared";
import type { SettingsSectionId } from "@/features/settings/lib/settings-search";

export function useSettingsDialog() {
  const { settings, provider } = useSearch({ from: "/workspace" });
  const navigate = useNavigate({ from: "/" });
  const open = useCallback(
    (section: SettingsSectionId = "general", provider?: ProviderId, replace = false) =>
      navigate({
        search: (previous) => ({ ...previous, settings: section, provider }),
        replace,
        resetScroll: false,
      }),
    [navigate],
  );
  const close = useCallback(
    () =>
      navigate({
        search: (previous) => ({ ...previous, settings: undefined, provider: undefined }),
        resetScroll: false,
      }),
    [navigate],
  );
  return { isOpen: settings !== undefined, section: settings, provider, open, close };
}
