import { randomBytes } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export type AuthenticationEmailConfig =
  | { delivery: "local"; directory: string }
  | { delivery: "resend"; from: string; apiKey: string };

export type AuthenticationConfig = {
  mode: "accounts";
  origin: string;
  secret: string;
  schema: string;
  nativeRedirectUri: string;
  allowInsecureLoopback: boolean;
  email: AuthenticationEmailConfig;
};
export function authenticationConfig(
  env: Record<string, string | undefined>,
  stateDirectory?: string,
): AuthenticationConfig {
  const development = (env.APP_ENV ?? "development") === "development";
  const origin =
    env.NGERTIIN_AUTH_URL ||
    (development ? `http://127.0.0.1:${env.NGERTIIN_WEB_PORT || "3001"}` : undefined);
  const directory = stateDirectory ? join(stateDirectory, "authentication") : undefined;
  const secret =
    env.NGERTIIN_AUTH_SECRET ||
    (development && directory ? developmentSecret(directory) : undefined);
  const parsed = z
    .object({
      NGERTIIN_AUTH_URL: z.url(),
      NGERTIIN_AUTH_SECRET: z.string().min(32),
      NGERTIIN_AUTH_SCHEMA: z
        .string()
        .regex(/^[a-z][a-z0-9_]{0,62}$/)
        .default("ngertiin_auth"),
      NGERTIIN_AUTH_NATIVE_REDIRECT_URI: z.url().default("http://127.0.0.1:43119/callback"),
    })
    .safeParse({ ...env, NGERTIIN_AUTH_URL: origin, NGERTIIN_AUTH_SECRET: secret });
  if (!parsed.success)
    throw new Error("Account authentication configuration is incomplete or invalid.");
  const value = parsed.data;
  const url = new URL(value.NGERTIIN_AUTH_URL);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  const allowInsecureLoopback = development && url.protocol === "http:" && loopback;
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
  const delivery = env.NGERTIIN_AUTH_EMAIL_DELIVERY || (development ? "local" : "resend");
  let email: AuthenticationEmailConfig;
  if (delivery === "local" && development && loopback && directory) {
    email = { delivery, directory: join(directory, "mail") };
  } else if (
    delivery === "resend" &&
    env.NGERTIIN_AUTH_EMAIL_FROM &&
    env.NGERTIIN_AUTH_RESEND_API_KEY
  ) {
    email = {
      delivery,
      from: env.NGERTIIN_AUTH_EMAIL_FROM,
      apiKey: env.NGERTIIN_AUTH_RESEND_API_KEY,
    };
  } else {
    throw new Error(
      "Configure authentication email delivery; the local inbox requires loopback development.",
    );
  }
  return {
    mode: "accounts",
    origin: url.origin,
    secret: value.NGERTIIN_AUTH_SECRET,
    schema: value.NGERTIIN_AUTH_SCHEMA,
    nativeRedirectUri: value.NGERTIIN_AUTH_NATIVE_REDIRECT_URI,
    allowInsecureLoopback,
    email,
  };
}

function developmentSecret(directory: string): string {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const directoryInfo = lstatSync(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || directoryInfo.mode & 0o077)
    throw new Error("The development authentication directory must be private (0700).");
  const path = join(directory, "secret");
  try {
    writeFileSync(path, randomBytes(48).toString("hex"), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.mode & 0o077 || info.size > 1024)
    throw new Error("The development authentication secret must be private (0600).");
  return readFileSync(path, "utf8");
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
