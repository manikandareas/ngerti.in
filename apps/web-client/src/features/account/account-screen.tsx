import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useId, useRef, useState } from "react";
import { type Action, toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, request } from "@/lib/api-client";
import { AccountField, useAccountAction } from "./account-forms";
import { InvitationReview } from "./invitation-review";
import { nativeContinuation, signedOAuthQuery } from "./oauth-continuation";
import { useAccount } from "./session";

export function AccountScreen() {
  const account = useAccount();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const [mode, setMode] = useState<"login" | "signup" | "recover" | "reset">(() =>
    location.pathname === "/reset-password" ? "reset" : "login",
  );
  const [email, setEmail] = useState("");
  const token = useRef(params.get("token") ?? "");
  const notificationId = useId();
  const callbackURL = signedOAuthQuery(location.search)
    ? `${location.origin}${location.pathname}`
    : `${location.origin}/onboarding`;
  const action = useAccountAction({
    id: notificationId,
    errorAction: (failure) =>
      mode === "login" && failure instanceof ApiError && failure.code === "AUTHENTICATION_FAILED"
        ? verificationAction(email)
        : undefined,
  });
  if (!account) return null;
  function changeMode(value: typeof mode) {
    setMode(value);
    toast.dismiss(notificationId);
  }
  function verificationAction(address: string): Action {
    return {
      label: "Resend verification email",
      onClick: (event) => {
        event.preventDefault();
        void action.run(async () => {
          toast.loading("Sending verification email…", {
            id: notificationId,
            duration: Infinity,
            action: undefined,
          });
          await request("/api/auth/send-verification-email", {
            email: address,
            callbackURL,
          });
          toast.success("Verification email sent. Check your inbox.", {
            id: notificationId,
            duration: 5000,
            action: undefined,
          });
        });
      },
    };
  }
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await action.run(async () => {
      const password = String(data.get("password") ?? "");
      if (mode === "signup") {
        await request("/api/auth/sign-up/email", {
          name: String(data.get("name")),
          email,
          password,
          callbackURL,
        });
        toast.info("Check your email to verify your account, then sign in.", {
          id: notificationId,
          duration: Infinity,
          action: verificationAction(email),
        });
        setMode("login");
        if (!signedOAuthQuery(location.search))
          await navigate({ to: "/onboarding", replace: true });
      } else if (mode === "recover") {
        await request("/api/auth/request-password-reset", {
          email,
          redirectTo: `${location.origin}/reset-password`,
        });
        toast.info("If this email has an account, a reset link is on its way.", {
          id: notificationId,
          duration: 5000,
          action: undefined,
        });
      } else if (mode === "reset") {
        await request("/api/auth/reset-password", { token: token.current, newPassword: password });
        token.current = "";
        setMode("login");
        toast.success("Password updated. Sign in to continue.", {
          id: notificationId,
          duration: 5000,
          action: undefined,
        });
      } else {
        const result = await request<{ redirect?: boolean; url?: string }>(
          "/api/auth/sign-in/email",
          {
            email,
            password,
            ...(signedOAuthQuery(location.search)
              ? { oauth_query: signedOAuthQuery(location.search) }
              : {}),
          },
        );
        if (result.redirect && result.url) {
          const metadata = await request<{ redirect_uri: string }>("/v1/auth/native");
          const continuation = nativeContinuation(result.url, metadata.redirect_uri);
          if (!continuation)
            throw new Error("Sign in continuation is invalid. Start again from the desktop app.");
          window.location.assign(continuation);
          return;
        }
        toast.dismiss(notificationId);
        localStorage.setItem("ngertiin:session-change", crypto.randomUUID());
        if (location.pathname.startsWith("/invitations/")) await account?.refresh();
        else {
          await navigate({ to: "/onboarding", replace: true });
          await account.refresh();
        }
      }
    });
  }
  const invitation = /^\/invitations\/([0-9a-f-]{36})$/i.exec(location.pathname)?.[1];
  const authenticating = !account.session || location.pathname === "/sign-in";
  const showWelcome = mode === "login" || mode === "signup";
  return (
    <main className={`account-screen${authenticating ? " account-screen--entry" : ""}`}>
      <section className="account-panel" aria-label="Account">
        <a href="/" className="account-wordmark" aria-label="Ngertiin">
          ngertiin.
        </a>
        <div className="account-content">
          {account.session && invitation ? (
            <InvitationReview id={invitation} />
          ) : (
            <>
              <header className="account-heading">
                {showWelcome && (
                  <div className="account-welcome" aria-hidden="true">
                    <img
                      src="/images/sign-in/welcome-triangle.webp"
                      alt=""
                      width="72"
                      height="72"
                    />
                    <img src="/images/sign-in/welcome-circle.webp" alt="" width="88" height="88" />
                    <img
                      src="/images/sign-in/welcome-squircle.webp"
                      alt=""
                      width="72"
                      height="72"
                    />
                  </div>
                )}
                <h1>
                  {mode === "signup"
                    ? "Sign up"
                    : mode === "recover"
                      ? "Reset your password"
                      : mode === "reset"
                        ? "Choose a new password"
                        : "Sign in"}
                </h1>
                {showWelcome && <p>A place for you and your agents.</p>}
              </header>
              <div className="account-auth-controls">
                {window.ngertiinDesktop?.remote ? (
                  <div className="account-form account-native-form">
                    <Button
                      className="account-submit"
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(async () => {
                          await window.ngertiinDesktop?.signIn?.();
                          await navigate({ to: "/onboarding", replace: true });
                          await account.refresh();
                        })
                      }
                    >
                      {action.busy ? "Waiting for browser…" : "Sign in with browser"}
                    </Button>
                    {action.busy && (
                      <Button
                        variant="ghost"
                        onClick={() => void window.ngertiinDesktop?.cancelSignIn?.()}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                ) : (
                  <form className="account-form" onSubmit={(event) => void authenticate(event)}>
                    {mode === "signup" && (
                      <AccountField label="Name">
                        <Input
                          name="name"
                          required
                          maxLength={120}
                          autoComplete="name"
                          disabled={action.busy}
                        />
                      </AccountField>
                    )}
                    {mode !== "reset" && (
                      <AccountField label="Email">
                        <Input
                          name="email"
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          required
                          autoComplete="email"
                          placeholder="you@example.com"
                          disabled={action.busy}
                        />
                      </AccountField>
                    )}
                    {mode !== "recover" && (
                      <AccountField label={mode === "reset" ? "New password" : "Password"}>
                        <Input
                          name="password"
                          type="password"
                          required
                          minLength={mode === "login" ? 1 : 12}
                          maxLength={128}
                          autoComplete={mode === "login" ? "current-password" : "new-password"}
                          disabled={action.busy}
                        />
                        {mode === "login" && (
                          <Button
                            type="button"
                            variant="link"
                            className="account-forgot"
                            disabled={action.busy}
                            onClick={() => changeMode("recover")}
                          >
                            Forgot password?
                          </Button>
                        )}
                        {mode !== "login" && (
                          <span className="account-muted">At least 12 characters.</span>
                        )}
                      </AccountField>
                    )}
                    <Button
                      className="account-submit"
                      disabled={action.busy || (mode === "reset" && !token.current)}
                    >
                      {action.busy
                        ? "Please wait…"
                        : mode === "signup"
                          ? "Create account"
                          : mode === "recover"
                            ? "Send reset link"
                            : mode === "reset"
                              ? "Save password"
                              : "Sign in"}
                    </Button>
                  </form>
                )}
                {!window.ngertiinDesktop?.remote && (
                  <div className="account-links">
                    {showWelcome ? (
                      <p className="account-switch">
                        <span>
                          {mode === "login" ? "Don't have an account?" : "Already have an account?"}
                        </span>
                        <Button
                          type="button"
                          variant="link"
                          disabled={action.busy}
                          onClick={() => changeMode(mode === "login" ? "signup" : "login")}
                        >
                          {mode === "login" ? "Sign up" : "Sign in"}
                        </Button>
                      </p>
                    ) : (
                      <Button
                        type="button"
                        variant="link"
                        disabled={action.busy}
                        onClick={() => changeMode("login")}
                      >
                        Back to sign in
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
