export function isOrganizationPath(path: string): boolean {
  return (
    path === "/v1/organizations" ||
    path.startsWith("/v1/organizations/") ||
    /^\/v1\/invitations\/[^/]+(?:\/accept)?$/.test(path)
  );
}
