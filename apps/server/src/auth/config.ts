import { z } from "zod";

export type AuthenticationConfig = {
  mode: "accounts";
  origin: string;
  secret: string;
  schema: string;
  nativeRedirectUri: string;
  allowInsecureLoopback: boolean;
  email: { from: string; apiKey: string };
};
export function authenticationConfig(
  env: Record<string, string | undefined>,
): AuthenticationConfig | undefined {
  const mode = env.NGERTIIN_AUTH_MODE ?? "local-development";
  if (mode === "local-development") return;
  if (mode !== "accounts") throw new Error("Invalid authentication mode.");
  const parsed = z
    .object({
      NGERTIIN_AUTH_URL: z.url(),
      NGERTIIN_AUTH_SECRET: z.string().min(32),
      NGERTIIN_AUTH_SCHEMA: z
        .string()
        .regex(/^[a-z][a-z0-9_]{0,62}$/)
        .default("ngertiin_auth"),
      NGERTIIN_AUTH_NATIVE_REDIRECT_URI: z.url().default("http://127.0.0.1:43119/callback"),
      NGERTIIN_AUTH_EMAIL_FROM: z.string().min(3),
      NGERTIIN_AUTH_RESEND_API_KEY: z.string().min(1),
    })
    .safeParse(env);
  if (!parsed.success)
    throw new Error("Account authentication configuration is incomplete or invalid.");
  const value = parsed.data;
  const url = new URL(value.NGERTIIN_AUTH_URL);
  const allowInsecureLoopback =
    env.NGERTIIN_AUTH_ALLOW_INSECURE_LOOPBACK === "true" &&
    (env.APP_ENV ?? "development") === "development";
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        allowInsecureLoopback &&
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error("Authentication requires an HTTPS origin or explicit development loopback.");
  validateNativeRedirect(value.NGERTIIN_AUTH_NATIVE_REDIRECT_URI);
  return {
    mode,
    origin: url.origin,
    secret: value.NGERTIIN_AUTH_SECRET,
    schema: value.NGERTIIN_AUTH_SCHEMA,
    nativeRedirectUri: value.NGERTIIN_AUTH_NATIVE_REDIRECT_URI,
    allowInsecureLoopback,
    email: { from: value.NGERTIIN_AUTH_EMAIL_FROM, apiKey: value.NGERTIIN_AUTH_RESEND_API_KEY },
  };
}
export function validateNativeRedirect(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.pathname !== "/callback" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error("Native authentication requires an exact IPv4 loopback callback with a port.");
}
