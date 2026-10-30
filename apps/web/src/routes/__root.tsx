import { idID } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/tanstack-react-start";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import styleUrl from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Ngertiin — Asisten personalmu" },
      {
        name: "description",
        content: "Asisten personal untuk ide, analisis, dan pekerjaanmu.",
      },
    ],
    links: [{ rel: "stylesheet", href: styleUrl }],
  }),
  component: Root,
  notFoundComponent: () => (
    <main
      id="main"
      className="flex min-h-[80svh] flex-col items-center justify-center gap-5 p-6 text-center"
    >
      <h1 className="text-2xl font-semibold">Halaman tidak ditemukan</h1>
      <Link to="/">Kembali ke beranda</Link>
    </main>
  ),
  errorComponent: ({ reset }) => (
    <main
      id="main"
      className="flex min-h-[80svh] flex-col items-center justify-center gap-5 p-6 text-center"
    >
      <h1 className="text-2xl font-semibold">Halaman belum dapat dibuka</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Terjadi kendala saat membuka halaman. Coba lagi atau kembali ke beranda.
      </p>
      <Button type="button" onClick={reset}>
        Coba lagi
      </Button>
    </main>
  ),
});

function Root() {
  const [queryClient] = useState(() => new QueryClient());
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  return (
    <Document>
      {key ? (
        <ClerkProvider
          publishableKey={key}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          afterSignOutUrl="/"
          localization={idID}
          appearance={{
            variables: {
              colorPrimary: "var(--primary)",
              colorPrimaryForeground: "var(--primary-foreground)",
              colorForeground: "var(--foreground)",
              colorMutedForeground: "var(--muted-foreground)",
              colorBackground: "var(--card)",
              colorInput: "var(--card)",
              colorInputForeground: "var(--foreground)",
              colorDanger: "var(--danger)",
              borderRadius: "0.75rem",
              fontFamily: '"Geist", system-ui, sans-serif',
            },
            elements: {
              rootBox: { width: "100%" },
              cardBox: { width: "100%", boxShadow: "none", border: "1px solid var(--border)" },
              footer: { background: "var(--muted)" },
              formButtonPrimary: { color: "var(--primary-foreground)" },
            },
          }}
        >
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <Outlet />
            </TooltipProvider>
          </QueryClientProvider>
        </ClerkProvider>
      ) : (
        <main
          id="main"
          className="flex min-h-[80svh] flex-col items-center justify-center gap-5 p-6 text-center"
        >
          <h1 className="text-2xl font-semibold">Ngertiin belum dikonfigurasi</h1>
          <p>Layanan belum siap digunakan. Hubungi pengelola untuk menyelesaikan konfigurasi.</p>
        </main>
      )}
    </Document>
  );
}

function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script>{`try{document.documentElement.dataset.theme=localStorage.getItem('ngertiin-theme')||'light'}catch{}`}</script>
      </head>
      <body>
        <a className="fixed -top-24 left-3 z-50 bg-card p-3 focus:top-3" href="#main">
          Langsung ke konten
        </a>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
