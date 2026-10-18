import { UserButton, useUser } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { diagnosticsEnabled } from "../lib/api";
import { Brand } from "./brand";

export function AppShell({ children }: { children: ReactNode }) {
  const { isSignedIn } = useUser();
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-3 border-b py-5 pl-5 pr-20 min-[701px]:px-8 min-[701px]:pr-24 [&_nav]:flex [&_nav]:items-center [&_nav]:gap-4 [&_nav]:text-sm [&_nav]:font-bold">
        <Link to="/" aria-label="Ngertiin beranda">
          <Brand />
        </Link>
        <nav aria-label="Navigasi utama">
          <Link to="/">Percakapan</Link>
          {diagnosticsEnabled ? <Link to="/dev/system">Diagnostik</Link> : null}
          {isSignedIn ? (
            <UserButton />
          ) : (
            <Button asChild size="sm">
              <Link to="/sign-in">Masuk</Link>
            </Button>
          )}
        </nav>
      </header>
      <main
        id="main"
        className="mx-auto w-full max-w-[1200px] flex-1 px-[18px] py-8 min-[701px]:px-8 min-[701px]:py-12"
      >
        {children}
      </main>
      <footer className="border-t p-6 text-center text-xs text-muted-foreground">
        Satu langkah kecil, sedikit lebih paham.
      </footer>
    </div>
  );
}
