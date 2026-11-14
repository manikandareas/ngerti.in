/** Adapted from @better-auth/oauth-provider 1.7.23 signed-query.ts; the server verifies the signature. */
export function signedOAuthQuery(search: string) {
  const params = new URLSearchParams(search);
  const names = new Set(params.getAll("ba_param"));
  if (!params.has("sig") || !names.size) return undefined;
  const signed = new URLSearchParams();
  for (const [key, value] of params) {
    if (key === "sig" || key === "ba_param" || names.has(key)) signed.append(key, value);
  }
  return signed.toString();
}
export function nativeContinuation(value: unknown, redirectUri: string) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const expected = new URL(redirectUri);
    return url.origin === expected.origin &&
      url.pathname === expected.pathname &&
      !url.username &&
      !url.password &&
      !url.hash
      ? url.href
      : null;
  } catch {
    return null;
  }
}
