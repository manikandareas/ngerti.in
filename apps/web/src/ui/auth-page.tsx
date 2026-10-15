import { SignIn, SignUp } from "@clerk/tanstack-react-start";
import { BookOpen, Check, MessageCircle } from "lucide-react";
import { Brand } from "./brand";

export function AuthPage({ mode = "sign-in" }: { mode?: "sign-in" | "sign-up" }) {
  return (
    <main id="main" className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div className="auth-copy">
          <span className="eyebrow">Pelan-pelan, sampai paham.</span>
          <h1>
            Belajarnya bareng.
            <br />
            Ngertinya beneran.
          </h1>
          <p>Dari materi yang kamu punya, jadi perjalanan belajar yang terasa lebih ringan.</p>
          <ul className="benefits">
            <li>
              <BookOpen size={19} />
              <span>Materimu, cara belajarmu</span>
            </li>
            <li>
              <MessageCircle size={19} />
              <span>Ada teman untuk bertanya</span>
            </li>
            <li>
              <Check size={19} />
              <span>Satu langkah kecil setiap hari</span>
            </li>
          </ul>
        </div>
        <span className="story-footer">Buat ruang untuk rasa ingin tahu.</span>
      </section>
      <section
        className="auth-form"
        aria-label={mode === "sign-in" ? "Masuk ke akun" : "Buat akun"}
      >
        <div className="auth-widget">
          {mode === "sign-in" ? (
            <SignIn routing="hash" fallbackRedirectUrl="/" signUpUrl="/sign-up" />
          ) : (
            <SignUp routing="hash" fallbackRedirectUrl="/" signInUrl="/sign-in" />
          )}
        </div>
      </section>
    </main>
  );
}
