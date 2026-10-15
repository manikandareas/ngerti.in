import { useAuth, useUser } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { type Account, api } from "../lib/api";
import { AppShell } from "../ui/app-shell";
import { AuthPage } from "../ui/auth-page";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth();
  const { user } = useUser();
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setAccount(null);
    setError("");
    if (isSignedIn && userId)
      getToken()
        .then((token) => api<Account>("/me", token))
        .then((value) => {
          if (active) setAccount(value);
        })
        .catch(() => {
          if (active) setError("Akunmu belum dapat dihubungkan. Coba muat ulang halaman.");
        });
    return () => {
      active = false;
    };
  }, [isSignedIn, getToken, userId]);
  if (!isLoaded)
    return (
      <main id="main" className="center-page" aria-busy="true">
        <p>Menyiapkan ruang belajarmu…</p>
      </main>
    );
  if (!isSignedIn) return <AuthPage />;
  return (
    <AppShell>
      <div className="page-intro">
        <p className="eyebrow">Ruang belajarmu</p>
        <h1>Halo{user?.firstName ? `, ${user.firstName}` : ""}.</h1>
        <p>Senang kamu ada di sini. Kita mulai dari rasa ingin tahumu.</p>
      </div>
      {error ? (
        <p role="alert" className="notice error">
          {error}
        </p>
      ) : null}
      <section className="learning-empty">
        <span className="empty-icon">
          <BookOpen size={38} strokeWidth={1.5} />
        </span>
        <h2>Ruang untuk hal-hal yang ingin kamu pahami.</h2>
        <p>
          Course yang kamu buat akan tersimpan di sini, siap dilanjutkan kapan pun kamu ingin
          belajar.
        </p>
        <span className="status-pill">{account ? "Akunmu siap" : "Menghubungkan akun…"}</span>
      </section>
    </AppShell>
  );
}
