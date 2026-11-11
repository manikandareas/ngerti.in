import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import type { MarketplaceSection } from "../lib/marketplace-search";

export function useMarketplace() {
  const { marketplace, item, category } = useSearch({ from: "/workspace" });
  const navigate = useNavigate({ from: "/" });
  const open = useCallback(
    (section: MarketplaceSection = "plugins", item?: string, category?: string) =>
      navigate({
        search: (previous) => ({
          ...previous,
          settings: undefined,
          provider: undefined,
          marketplace: section,
          item,
          category: section === "plugins" ? category : undefined,
        }),
        resetScroll: false,
      }),
    [navigate],
  );
  const close = useCallback(
    () =>
      navigate({
        search: (previous) => ({
          ...previous,
          marketplace: undefined,
          item: undefined,
          category: undefined,
        }),
        resetScroll: false,
      }),
    [navigate],
  );
  return {
    isOpen: marketplace !== undefined,
    section: marketplace ?? "plugins",
    item,
    category,
    open,
    close,
  };
}
