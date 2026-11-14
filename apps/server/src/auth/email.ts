export type AuthenticationEmail = {
  to: string;
  purpose: "verification" | "recovery" | "invitation";
  url: string;
  idempotencyKey?: string;
};
export type EmailDelivery = (message: AuthenticationEmail) => Promise<void>;

const emailCopy: Record<AuthenticationEmail["purpose"], { subject: string; action: string }> = {
  verification: { subject: "Verify your Ngertiin account", action: "verify your email address" },
  recovery: { subject: "Reset your Ngertiin password", action: "reset your password" },
  invitation: {
    subject: "Join a Ngertiin organization",
    action: "review your organization invitation",
  },
};

/** Verification and recovery secrets are delivered only to the intended email address. */
export function resendDelivery(config: { from: string; apiKey: string }): EmailDelivery {
  return async (message) => {
    const copy = emailCopy[message.purpose];
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: config.from,
        to: [message.to],
        subject: copy.subject,
        text: `Open this link to ${copy.action}:\n\n${message.url}\n\nIf you did not request this, ignore this email.`,
      }),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error("Authentication email delivery failed.");
  };
}
