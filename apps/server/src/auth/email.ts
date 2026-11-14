export type AuthenticationEmail = { to: string; purpose: "verification" | "recovery"; url: string };
export type EmailDelivery = (message: AuthenticationEmail) => Promise<void>;

/** Verification and recovery secrets are delivered only to the intended email address. */
export function resendDelivery(config: { from: string; apiKey: string }): EmailDelivery {
  return async (message) => {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.from,
        to: [message.to],
        subject:
          message.purpose === "verification"
            ? "Verify your Ngertiin account"
            : "Reset your Ngertiin password",
        text: `Open this link to ${message.purpose === "verification" ? "verify your email address" : "reset your password"}:\n\n${message.url}\n\nIf you did not request this, ignore this email.`,
      }),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error("Authentication email delivery failed.");
  };
}
