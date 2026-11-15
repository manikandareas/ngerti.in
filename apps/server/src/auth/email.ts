import { lstat, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AuthenticationEmailConfig } from "./config";

export type AuthenticationEmail = {
  to: string;
  purpose: "verification" | "recovery" | "invitation";
  url: string;
  idempotencyKey?: string;
};
export type EmailDelivery = (message: AuthenticationEmail) => Promise<void>;

export function authenticationEmailDelivery(config: AuthenticationEmailConfig): EmailDelivery {
  if (config.delivery === "resend") return resendDelivery(config);
  return async (message) => {
    await mkdir(config.directory, { recursive: true, mode: 0o700 });
    const info = await lstat(config.directory);
    if (!info.isDirectory() || info.isSymbolicLink() || info.mode & 0o077)
      throw new Error("The development email inbox must be private (0700).");
    await writeFile(
      join(config.directory, `${Date.now()}-${crypto.randomUUID()}.json`),
      `${JSON.stringify({ ...message, created_at: new Date().toISOString() })}\n`,
      { flag: "wx", mode: 0o600 },
    );
  };
}

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
