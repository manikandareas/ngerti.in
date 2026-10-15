import { UserButton, useUser } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { diagnosticsEnabled } from "../lib/api";
import { Brand } from "./brand";

export function AppShell({ children }: { children: ReactNode }) {
  const { isSignedIn } = useUser();
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" aria-label="Ngertiin beranda">
          <Brand />
        </Link>
        <nav aria-label="Navigasi utama">
          <Link to="/">Ruang belajar</Link>
          {diagnosticsEnabled ? <Link to="/dev/system">Diagnostik</Link> : null}
          {isSignedIn ? (
            <UserButton />
          ) : (
            <Link className="button small" to="/sign-in">
              Masuk
            </Link>
          )}
        </nav>
      </header>
      <main id="main" className="app-content">
        {children}
      </main>
      <footer className="app-footer">Satu langkah kecil, sedikit lebih paham.</footer>
    </div>
  );
}
