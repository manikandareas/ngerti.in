import type { CatalogEntry } from "./catalog";

export const categoryPreviewLimit = 6;
const acronyms = new Set(["ai", "api", "crm", "hr", "it", "seo", "sms"]);

export function categoryLabel(name: string) {
  return name.replace(
    /(^|[\s-])(\p{L}+)/gu,
    (_match, prefix: string, word: string) =>
      prefix +
      (acronyms.has(word.toLowerCase())
        ? word.toUpperCase()
        : word[0].toUpperCase() + word.slice(1)),
  );
}

export function primaryCategory(entry: CatalogEntry) {
  return (
    entry.categories?.[0] ?? {
      slug:
        entry.category
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "other-apps",
      name: entry.category,
    }
  );
}

export function belongsToCategory(entry: CatalogEntry, slug: string) {
  return (
    primaryCategory(entry).slug === slug ||
    entry.categories?.some((category) => category.slug === slug)
  );
}

export function groupCatalog(entries: CatalogEntry[]) {
  const groups = new Map<string, { slug: string; label: string; entries: CatalogEntry[] }>();
  for (const entry of entries) {
    const category = primaryCategory(entry);
    const group = groups.get(category.slug);
    if (group) group.entries.push(entry);
    else
      groups.set(category.slug, {
        slug: category.slug,
        label: categoryLabel(category.name),
        entries: [entry],
      });
  }
  return [...groups.values()];
}
