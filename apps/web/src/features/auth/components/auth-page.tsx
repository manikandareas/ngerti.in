import { SignIn, SignUp } from "@clerk/tanstack-react-start";
import { Brand } from "@/components/brand";

export function AuthPage({ mode = "sign-in" }: { mode?: "sign-in" | "sign-up" }) {
  return (
    <main id="main" className="flex min-h-svh items-center justify-center px-4 py-20">
      <section
        className="w-full max-w-[440px]"
        aria-label={mode === "sign-in" ? "Masuk ke akun" : "Buat akun"}
      >
        <div className="mb-8 space-y-4 text-center">
          <div className="flex justify-center">
            <Brand />
          </div>
          <h1 className="text-2xl font-semibold">
            {mode === "sign-in" ? "Selamat datang kembali" : "Mulai bersama Tobi"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Ceritakan kebutuhanmu. Agentmu siap membantu dari percakapan pertama.
          </p>
        </div>
        {mode === "sign-in" ? (
          <SignIn routing="hash" fallbackRedirectUrl="/" signUpUrl="/sign-up" />
        ) : (
          <SignUp routing="hash" fallbackRedirectUrl="/" signInUrl="/sign-in" />
        )}
      </section>
    </main>
  );
}
