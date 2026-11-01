import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Foundations } from "@/features/design-system/foundations";
import { PrimitiveGallery } from "@/features/design-system/primitive-gallery";
import { components } from "@/lib/component-catalog";

export default function DesignSystemPage() {
  const { component } = useSearch({ from: "/design-system" });
  const navigate = useNavigate();
  useEffect(() => {
    const previous = document.title;
    document.title = "Design System · Ngertiin";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-3 px-6 py-4 sm:px-10">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/" aria-label="Kembali ke beranda">
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
              </Link>
            </Button>
            <span className="font-medium">
              Ngertiin <span className="font-normal text-muted-foreground">/ Design system</span>
            </span>
          </div>
          <ThemeSwitcher />
        </div>
      </header>
      <main className="mx-auto max-w-content space-y-8 px-6 py-8 sm:px-10 sm:py-12">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Page 1</Badge>
            <Badge variant="secondary">Light & dark</Badge>
          </div>
          <h1 className="text-heading-mobile font-medium tracking-tight sm:text-heading">
            Design system
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Satu fondasi visual untuk seluruh aplikasi. Jelajahi token, aturan penggunaan, dan{" "}
            {components.length} primitive components yang bisa langsung dicoba.
          </p>
        </div>
        <Tabs
          value={component ? "primitives" : "foundations"}
          onValueChange={(value) =>
            void navigate({
              to: "/design-system",
              search: value === "primitives" ? { component: "button" } : {},
              resetScroll: false,
            })
          }
        >
          <TabsList aria-label="Bagian design system" className="mb-6">
            <TabsTrigger value="foundations">Fondasi</TabsTrigger>
            <TabsTrigger value="primitives">
              Primitive <span className="font-mono text-caption">{components.length}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="foundations">
            <Foundations />
          </TabsContent>
          <TabsContent value="primitives">
            {component && <PrimitiveGallery selected={component} />}
          </TabsContent>
        </Tabs>
      </main>
      <footer className="mx-auto max-w-content border-t px-6 py-6 text-caption text-muted-foreground sm:px-10">
        Page 1 · Inter & Geist Mono · shadcn primitives · Hugeicons
      </footer>
    </>
  );
}
