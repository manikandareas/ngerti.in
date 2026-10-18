import { SignIn, SignUp } from "@clerk/tanstack-react-start";

export function AuthPage({ mode = "sign-in" }: { mode?: "sign-in" | "sign-up" }) {
  return (
    <main id="main" className="flex min-h-svh items-center justify-center px-4 py-20">
      <section
        className="w-full max-w-[440px]"
        aria-label={mode === "sign-in" ? "Masuk ke akun" : "Buat akun"}
      >
        {mode === "sign-in" ? (
          <SignIn routing="hash" fallbackRedirectUrl="/" signUpUrl="/sign-up" />
        ) : (
          <SignUp routing="hash" fallbackRedirectUrl="/" signInUrl="/sign-in" />
        )}
      </section>
    </main>
  );
}
