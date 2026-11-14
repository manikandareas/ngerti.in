import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { validateNativeRedirect } from "./config";

/** Headless contract helper; Tauri's native gateway implements the same bounded flow in NMA-081. */
export function nativeAuthorization(origin: string, redirectUri: string) {
  const server = new URL(origin);
  if (
    server.origin !== origin ||
    (server.protocol !== "https:" &&
      !(server.protocol === "http:" && server.hostname === "127.0.0.1"))
  )
    throw new Error("Invalid authentication server origin.");
  validateNativeRedirect(redirectUri);
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const deadline = Date.now() + 5 * 60_000;
  let consumed = false;
  const authorize = new URL(`${origin}/api/auth/oauth2/authorize`);
  authorize.search = new URLSearchParams({
    client_id: "ngertiin-tauri",
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "ngertiin offline_access",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    resource: origin,
  }).toString();
  return {
    authorizeUrl: authorize.toString(),
    exchange(callback: string) {
      const url = new URL(callback);
      const expected = new URL(redirectUri);
      const suppliedState = Buffer.from(url.searchParams.get("state") ?? "");
      const expectedState = Buffer.from(state);
      const code = url.searchParams.get("code");
      if (
        consumed ||
        Date.now() >= deadline ||
        url.origin !== expected.origin ||
        url.pathname !== expected.pathname ||
        url.hash ||
        url.username ||
        url.password ||
        url.searchParams.getAll("state").length !== 1 ||
        suppliedState.length !== expectedState.length ||
        !timingSafeEqual(suppliedState, expectedState) ||
        url.searchParams.get("iss") !== `${origin}/api/auth` ||
        url.searchParams.getAll("iss").length !== 1 ||
        !code ||
        url.searchParams.getAll("code").length !== 1 ||
        url.searchParams.has("error")
      )
        throw new Error("Invalid or expired native authorization callback.");
      consumed = true;
      return new URLSearchParams({
        client_id: "ngertiin-tauri",
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        resource: origin,
      });
    },
  };
}
