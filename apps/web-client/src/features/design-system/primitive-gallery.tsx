import { Link } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CodeBlock,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ui/code-block";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import type { ComponentName } from "@/lib/component-catalog";
import { type Category, catalog, categories, componentImport } from "./catalog";

const exampleGroups = {
  actions: lazy(() => import("./examples/actions")),
  forms: lazy(() => import("./examples/forms")),
  navigation: lazy(() => import("./examples/navigation")),
  overlays: lazy(() => import("./examples/overlays")),
  display: lazy(() => import("./examples/display")),
  feedback: lazy(() => import("./examples/feedback")),
  conversation: lazy(() => import("./examples/conversation")),
};

export function PrimitiveGallery({ selected }: { selected: ComponentName }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [revision, setRevision] = useState(0);
  const current = catalog.find((item) => item.name === selected);
  if (!current) throw new Error("Unknown component.");
  const Example = exampleGroups[current.category];
  const filtered = catalog.filter(
    (item) =>
      (category === "all" || item.category === category) &&
      `${item.name} ${item.title} ${item.description}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const source = componentImport(selected);

  return (
    <div className="flex flex-col items-start gap-6 lg:flex-row">
      <aside className="w-full shrink-0 space-y-4 lg:w-64" aria-label="Daftar primitive">
        <div className="space-y-2">
          <Label htmlFor="component-search">Cari komponen</Label>
          <Input
            id="component-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Button, input, dialog…"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="component-category">Kategori</Label>
          <NativeSelect
            id="component-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as Category | "all")}
          >
            <NativeSelectOption value="all">Semua kategori</NativeSelectOption>
            {Object.entries(categories).map(([key, label]) => (
              <NativeSelectOption key={key} value={key}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <p role="status" className="text-caption text-muted-foreground">
          {filtered.length} dari {catalog.length} komponen
        </p>
        <nav
          className="max-h-72 space-y-1 overflow-y-auto rounded-lg border bg-card p-2 lg:max-h-96"
          aria-label="Primitive components"
        >
          {filtered.map((item) => (
            <Link
              key={item.name}
              to="/design-system"
              search={{ component: item.name }}
              resetScroll={false}
              aria-current={selected === item.name ? "page" : undefined}
              className={`block rounded-control px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected === item.name ? "bg-accent font-medium text-link" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              {item.title}
            </Link>
          ))}
          {filtered.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">
              Tidak ada komponen yang cocok. Coba kata kunci lain.
            </p>
          )}
        </nav>
      </aside>
      <section className="min-w-0 w-full flex-1 space-y-5" aria-label="Detail primitive">
        <div className="space-y-3">
          <Badge variant="secondary">{categories[current.category]}</Badge>
          <h2 className="text-heading-mobile font-medium">{current.title}</h2>
          <p className="text-muted-foreground">{current.description}</p>
        </div>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>
              <h3>Preview</h3>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setRevision((value) => value + 1)}>
              Reset contoh
            </Button>
          </CardHeader>
          <CardContent>
            <div
              data-preview={selected}
              className="flex min-h-64 min-w-0 items-center justify-center overflow-hidden rounded-lg border border-dashed bg-background p-4 sm:p-6"
            >
              <div className="w-full min-w-0 max-w-2xl" key={`${selected}-${revision}`}>
                <Suspense
                  fallback={
                    <div role="status" aria-label="Memuat contoh" className="space-y-3">
                      <Skeleton className="h-8 w-1/2" />
                      <Skeleton className="h-20 w-full" />
                    </div>
                  }
                >
                  <div data-example={selected}>
                    <Example name={selected} />
                  </div>
                </Suspense>
              </div>
            </div>
          </CardContent>
        </Card>
        <CodeBlock>
          <CodeBlockHeader>
            <CodeBlockTitle>Import</CodeBlockTitle>
            <CodeBlockCopyButton value={source} className="ml-auto" />
          </CodeBlockHeader>
          <CodeBlockContent>{source}</CodeBlockContent>
        </CodeBlock>
        <p className="text-caption text-muted-foreground">
          Contoh memakai primitive asli dari aplikasi. Ubah tema di header untuk memeriksa warna dan
          state yang sama.
        </p>
      </section>
    </div>
  );
}
