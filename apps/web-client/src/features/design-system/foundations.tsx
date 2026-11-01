import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const colorGroups = [
  {
    title: "Surfaces",
    tokens: [
      "background",
      "card",
      "muted",
      "popover",
      "surface-raised",
      "surface-inverse",
      "frame",
      "panel",
      "composer",
      "control",
      "control-hover",
      "menu-hover",
      "menu-active",
      "scrollbar",
    ],
  },
  {
    title: "Content & borders",
    tokens: [
      "foreground",
      "muted-foreground",
      "text-tertiary",
      "text-disabled",
      "border",
      "input",
      "input-focus",
    ],
  },
  {
    title: "Primary & actions",
    tokens: [
      "primary",
      "primary-hover",
      "primary-pressed",
      "link",
      "accent",
      "primary-foreground",
      "ring",
    ],
  },
  {
    title: "Semantic feedback",
    tokens: [
      "success",
      "success-foreground",
      "warning",
      "warning-foreground",
      "danger-soft",
      "destructive",
      "danger-action",
      "disabled-surface",
    ],
  },
  {
    title: "Agent identity · separate from primary",
    tokens: [
      "identity-pink",
      "identity-blue",
      "identity-teal",
      "identity-purple",
      "identity-orange",
      "identity-silver",
    ],
  },
  { title: "Data visualization", tokens: ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] },
];

const typeScale = [
  {
    name: "Display",
    className: "text-display-mobile sm:text-display font-medium tracking-tight",
    value: "64/64 · mobile 38/44",
  },
  {
    name: "Heading",
    className: "text-heading-mobile sm:text-heading font-medium tracking-tight",
    value: "30/36 · mobile 24/32",
  },
  { name: "Title", className: "text-title font-medium", value: "20/28 · medium" },
  { name: "Body", className: "text-base leading-6", value: "16/24 · regular" },
  { name: "UI", className: "text-ui", value: "14/20 · regular" },
  {
    name: "Control",
    className: "text-(length:--text-control-label)/5 font-medium",
    value: "13/20 · medium",
  },
  { name: "Label", className: "text-sm leading-6 font-medium", value: "14/24 · medium" },
  { name: "Caption", className: "text-caption", value: "12/18 · regular" },
  {
    name: "Code",
    className: "font-mono text-(length:--text-control-label)/5",
    value: "Geist Mono · 13/20",
  },
];

const radii = [
  { name: "Control", className: "rounded-control", value: "8px" },
  { name: "Small surface", className: "rounded-lg", value: "8px" },
  { name: "Navigation", className: "rounded-nav", value: "10px" },
  { name: "Card", className: "rounded-card", value: "16px" },
  { name: "Dialog", className: "rounded-dialog", value: "12px" },
  { name: "Menu", className: "rounded-menu", value: "14px" },
  { name: "Menu item", className: "rounded-menu-item", value: "6px" },
  { name: "Pill", className: "rounded-pill", value: "999px" },
];

export function Foundations() {
  const { resolvedTheme } = useTheme();
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;
    const frame = requestAnimationFrame(() => {
      const style = getComputedStyle(document.documentElement);
      const names = colorGroups
        .flatMap((group) => group.tokens)
        .concat([
          "duration-fast",
          "duration-enter",
          "duration-exit",
          "duration-pop",
          "duration-sheet",
        ]);
      setValues(
        Object.fromEntries(names.map((name) => [name, style.getPropertyValue(`--${name}`).trim()])),
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);

  async function copyToken(name: string) {
    try {
      await navigator.clipboard.writeText(`var(--${name})`);
      toast.success(`Token ${name} disalin`);
    } catch {
      toast.error("Browser tidak mengizinkan akses clipboard.");
    }
  }

  return (
    <div className="space-y-8" data-testid="foundations">
      <section aria-labelledby="colors-title" className="space-y-5">
        <div>
          <h2 id="colors-title" className="text-title font-medium">
            Colors & surfaces
          </h2>
          <p className="mt-2 text-muted-foreground">
            Nilai langsung dari tema {resolvedTheme === "dark" ? "gelap" : "terang"} yang aktif.
            Klik swatch untuk menyalin token CSS.
          </p>
        </div>
        {colorGroups.map((group) => (
          <Card key={group.title}>
            <CardHeader>
              <CardTitle>
                <h3>{group.title}</h3>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {group.tokens.map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-label={`Salin token ${name}`}
                  onClick={() => void copyToken(name)}
                  className="min-w-0 space-y-3 rounded-control text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span
                    data-token={name}
                    aria-hidden="true"
                    className="block h-20 rounded-lg border"
                    style={{ backgroundColor: `var(--${name})` }}
                  />
                  <span className="block truncate font-mono text-caption">{name}</span>
                  <span
                    className="block font-mono text-caption text-muted-foreground"
                    data-token-value={name}
                  >
                    {values[name] ?? "…"}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
        ))}
      </section>

      <Card id="typography">
        <CardHeader>
          <CardTitle>
            <h2>Typography</h2>
          </CardTitle>
          <CardDescription>
            Geist untuk display, heading, dan UI. Geist Mono untuk kode. Regular 400, medium 500,
            semibold 600.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {typeScale.map((type) => (
            <div
              key={type.name}
              className="flex min-w-0 flex-wrap items-center justify-between gap-4 py-5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className={type.className}>Aa {type.name}</p>
              </div>
              <p className="font-mono text-caption text-muted-foreground">{type.value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Spacing</h2>
            </CardTitle>
            <CardDescription>
              Ritme 4px dengan half-step 2px dan 6px untuk detail kecil.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 112, 160].map((size) => (
              <div key={size} className="flex items-center gap-4">
                <span className="w-12 shrink-0 font-mono text-caption text-muted-foreground">
                  {size}px
                </span>
                <span
                  className="h-3 rounded-control bg-primary"
                  style={{ width: `calc(var(--spacing) * ${size / 4})` }}
                />
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Radius</h2>
              </CardTitle>
              <CardDescription>Shape berdasarkan peran komponen.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-5">
              {radii.map((radius) => (
                <div key={radius.name} className="space-y-2">
                  <div
                    className={`size-16 border border-primary/50 bg-accent ${radius.className}`}
                  />
                  <p className="text-sm">{radius.name}</p>
                  <p className="font-mono text-caption text-muted-foreground">{radius.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Elevation</h2>
              </CardTitle>
              <CardDescription>
                Permukaan netral membentuk hierarki; shadow tipis untuk elemen yang mengambang.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              {["shadow-sm", "shadow-md", "shadow-lg"].map((shadow) => (
                <div
                  key={shadow}
                  className={`rounded-lg bg-popover p-4 text-center font-mono text-caption ${shadow}`}
                >
                  {shadow.replace("shadow-", "")}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Sizing, focus & motion</h2>
          </CardTitle>
          <CardDescription>
            Control 28/32/36px. Menu row minimal 30px, atau 40px pada layar sentuh. Input memakai
            border focus yang lembut; kontrol form memakai ring tipis 1px. Aksi umum memakai focus
            ring 2px dengan offset 2px. Gunakan Tab untuk mencobanya.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small · 28</Button>
            <Button>Default · 32</Button>
            <Button size="lg">Large · 36</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap gap-6 font-mono text-caption text-muted-foreground">
            <span>Fast {values["duration-fast"]}</span>
            <span>Enter {values["duration-enter"]}</span>
            <span>Exit {values["duration-exit"]}</span>
            <span>Popup {values["duration-pop"]}</span>
            <span>Sheet {values["duration-sheet"]}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Layout: max-content 1216px, page 1440px. Preferensi reduced motion menonaktifkan animasi
            dekoratif.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
