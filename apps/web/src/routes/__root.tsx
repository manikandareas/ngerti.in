import { idID } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/tanstack-react-start";
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import styleUrl from "../styles.css?url";
import { ThemeToggle } from "../ui/theme-toggle";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Ngertiin — Teman belajarmu" },
      {
        name: "description",
        content: "Belajar dari materimu, dengan teman yang memahami tujuanmu.",
      },
    ],
    links: [{ rel: "stylesheet", href: styleUrl }],
  }),
  component: Root,
  notFoundComponent: () => (
    <main className="center-page">
      <h1>Halaman tidak ditemukan</h1>
      <Link to="/">Kembali ke beranda</Link>
    </main>
  ),
  errorComponent: ({ error, reset }) => (
    <main className="center-page">
      <h1>Halaman belum dapat dibuka</h1>
      <p>{error instanceof Error ? error.message : "Silakan coba lagi."}</p>
      <button type="button" onClick={reset}>
        Coba lagi
      </button>
    </main>
  ),
});

function Root() {
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
              fontFamily: '"Nunito Sans", system-ui, sans-serif',
            },
            elements: {
              cardBox: { boxShadow: "none", border: "1px solid var(--border)" },
              formButtonPrimary: { color: "var(--primary-foreground)" },
            },
          }}
        >
          <Outlet />
        </ClerkProvider>
      ) : (
        <main className="center-page">
          <h1>Ngertiin belum dikonfigurasi</h1>
          <p>Isi VITE_CLERK_PUBLISHABLE_KEY pada .env root, lalu restart web.</p>
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
        <a className="skip-link" href="#main">
          Langsung ke konten
        </a>
        <div className="theme-control">
          <ThemeToggle />
        </div>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
