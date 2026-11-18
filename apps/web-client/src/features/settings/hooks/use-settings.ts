import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import type { ProviderId } from "@/features/settings/components/shared";
import type { SettingsSectionId } from "@/features/settings/lib/settings-search";

export function useSettings() {
  const { settings, provider, workgroup, settingsTab, setting } = useSearch({ from: "/workspace" });
  const navigate = useNavigate({ from: "/" });
  const open = useCallback(
    (section: SettingsSectionId = "general", provider?: ProviderId, replace = false) =>
      navigate({
        search: (previous) => ({
          ...previous,
          settings: section,
          provider,
          workgroup: undefined,
          settingsTab: undefined,
          setting: undefined,
          marketplace: undefined,
          item: undefined,
          category: undefined,
        }),
        replace,
        resetScroll: false,
      }),
    [navigate],
  );
  const close = useCallback(
    () =>
      navigate({
        search: (previous) => ({
          ...previous,
          settings: undefined,
          provider: undefined,
          workgroup: undefined,
          settingsTab: undefined,
          setting: undefined,
        }),
        resetScroll: false,
      }),
    [navigate],
  );
  return {
    isOpen: settings !== undefined,
    section: settings,
    provider,
    workgroup,
    settingsTab,
    setting,
    open,
    close,
  };
}
