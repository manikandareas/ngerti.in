import { type FormEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { request } from "@/lib/api-client";
import { AccountField, CreateOrganization, useAccountAction } from "./account-forms";
import { AccountArtwork } from "./account-artwork";
import { InvitationReview } from "./invitation-review";
import { nativeContinuation, signedOAuthQuery } from "./oauth-continuation";
import { useAccount } from "./session";

export function AccountScreen() {
  const account = useAccount();
  const params = new URLSearchParams(location.search);
  const [mode, setMode] = useState<"login" | "signup" | "recover" | "reset">(() =>
    location.pathname === "/reset-password" ? "reset" : "login",
  );
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const token = useRef(params.get("token") ?? "");
  const action = useAccountAction();
  if (!account) return null;
  function changeMode(value: typeof mode) {
    setMode(value);
    setNotice("");
    action.setError("");
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
          callbackURL: `${location.origin}${location.pathname}`,
        });
        setNotice("Check your email to verify your account, then sign in.");
        setMode("login");
      } else if (mode === "recover") {
        await request("/api/auth/request-password-reset", {
          email,
          redirectTo: `${location.origin}/reset-password`,
        });
        setNotice("If this email has an account, a reset link is on its way.");
      } else if (mode === "reset") {
        await request("/api/auth/reset-password", { token: token.current, newPassword: password });
        token.current = "";
        setMode("login");
        setNotice("Password updated. Sign in to continue.");
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
        localStorage.setItem("ngertiin:session-change", crypto.randomUUID());
        if (location.pathname.startsWith("/invitations/")) await account?.refresh();
        else window.location.assign("/");
      }
    });
  }
  const invitation = /^\/invitations\/([0-9a-f-]{36})$/i.exec(location.pathname)?.[1];
  const authenticating = !account.session || location.pathname === "/sign-in";
  return (
    <main className={`account-screen${authenticating ? " account-screen--entry" : ""}`}>
      <section className="account-panel" aria-label="Account">
        <a href="/" className="account-wordmark" aria-label="Ngertiin">
          ngertiin.
        </a>
        <div className="account-content">
          {account.session && invitation ? (
            <InvitationReview id={invitation} />
          ) : account.session && location.pathname !== "/sign-in" ? (
            <>
              <h1>
                {creating
                  ? "New organization"
                  : account.list.organizations.length
                    ? "Choose an organization"
                    : "Your workspace"}
              </h1>
              {account.error && (
                <p role="alert" className="account-error">
                  {account.error}
                </p>
              )}
              {creating ? (
                <CreateOrganization created={account.select} cancel={() => setCreating(false)} />
              ) : (
                <>
                  <div className="account-organizations">
                    {account.list.organizations.map((organization) => (
                      <Button
                        key={organization.id}
                        variant="ghost"
                        className="account-organization"
                        onClick={() => void action.run(() => account.select(organization.id))}
                        disabled={action.busy}
                      >
                        {organization.name}
                      </Button>
                    ))}
                  </div>
                  {account.list.created_count < account.list.creation_limit ? (
                    <Button onClick={() => setCreating(true)}>Create organization</Button>
                  ) : account.list.organizations.length === 0 ? (
                    <p className="account-muted">Open your invitation to join an organization.</p>
                  ) : null}
                  {account.list.organizations.length === 0 && account.list.creation_limit === 0 && (
                    <details className="account-setup">
                      <summary>Set up this server</summary>
                      <form
                        className="account-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const form = event.currentTarget;
                          const grant = String(new FormData(form).get("grant"));
                          void action.run(async () => {
                            await request("/v1/auth/bootstrap", { token: grant });
                            form.reset();
                            await account.refresh();
                          });
                        }}
                      >
                        <AccountField label="Owner setup token">
                          <Input
                            name="grant"
                            type="password"
                            minLength={32}
                            maxLength={128}
                            required
                            autoComplete="off"
                          />
                        </AccountField>
                        <Button disabled={action.busy}>Complete setup</Button>
                      </form>
                    </details>
                  )}
                </>
              )}
              {action.error && (
                <p role="alert" className="account-error">
                  {action.error}
                </p>
              )}
              <Button
                variant="ghost"
                className="account-signout"
                onClick={() => void action.run(account.logout)}
                disabled={action.busy}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <header className="account-heading">
                {mode === "login" && (
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
                    ? "Create your account"
                    : mode === "recover"
                      ? "Reset your password"
                      : mode === "reset"
                        ? "Choose a new password"
                        : "Sign in"}
                </h1>
                {mode === "login" && <p>A place for you and your agents.</p>}
              </header>
              {notice && (
                <p role="status" className="account-muted">
                  {notice}
                </p>
              )}
              {(action.error || account.error) && (
                <p role="alert" className="account-error">
                  {action.error || account.error}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void account.refresh()}
                  >
                    Retry
                  </Button>
                </p>
              )}
              <div className="account-auth-controls">
                {window.ngertiinDesktop?.remote ? (
                  <div className="account-form account-native-form">
                    <Button
                      className="account-submit"
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(async () => {
                          await window.ngertiinDesktop?.signIn?.();
                          if (location.pathname === "/sign-in") location.assign("/");
                          else await account.refresh();
                        })
                      }
                    >
                      {action.busy ? "Waiting for browser…" : "Sign in with browser"}
                    </Button>
                    {action.busy && (
                      <>
                        <p className="account-muted" role="status">
                          Finish signing in in your browser.
                        </p>
                        <Button
                          variant="ghost"
                          onClick={() => void window.ngertiinDesktop?.cancelSignIn?.()}
                        >
                          Cancel
                        </Button>
                      </>
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
                    {mode === "login" ? (
                      <>
                        <Button
                          variant="secondary"
                          size="lg"
                          className="account-alternative"
                          disabled={action.busy}
                          onClick={() => changeMode("signup")}
                        >
                          Create account
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant={mode === "signup" ? "secondary" : "link"}
                        size={mode === "signup" ? "lg" : "default"}
                        className={mode === "signup" ? "account-alternative" : undefined}
                        disabled={action.busy}
                        onClick={() => changeMode("login")}
                      >
                        {mode === "signup" ? "Sign in" : "Back to sign in"}
                      </Button>
                    )}
                    {mode === "login" && (notice || action.error) && (
                      <Button
                        variant="link"
                        disabled={action.busy || !email}
                        onClick={() =>
                          void action.run(async () => {
                            await request("/api/auth/send-verification-email", {
                              email,
                              callbackURL: `${location.origin}${location.pathname}`,
                            });
                            setNotice("Verification email sent. Check your inbox.");
                          })
                        }
                      >
                        Resend verification email
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>
      {authenticating && <AccountArtwork />}
    </main>
  );
}
