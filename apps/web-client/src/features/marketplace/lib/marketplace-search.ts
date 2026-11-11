export type MarketplaceSection = "plugins" | "skills";

export function validateMarketplaceSearch(search: Record<string, unknown>): {
  marketplace?: MarketplaceSection;
  item?: string;
  category?: string;
} {
  const marketplace =
    search.marketplace === "plugins" || search.marketplace === "skills"
      ? search.marketplace
      : undefined;
  return {
    marketplace,
    category:
      marketplace === "plugins" &&
      typeof search.category === "string" &&
      /^[a-z0-9][a-z0-9_-]{0,159}$/.test(search.category)
        ? search.category
        : undefined,
    item:
      marketplace && typeof search.item === "string" && search.item.length <= 256
        ? search.item
        : undefined,
  };
}
