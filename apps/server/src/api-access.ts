import { isAuthenticationRoute } from "./auth/http";
import { isOrganizationPath } from "./organizations/paths";

/** Public contract metadata uses the same scope classification as the HTTP boundary. */
export function routeAccess(path: string) {
  if (path === "/health/live" || path === "/v1/auth/native")
    return {
      authentication_class: "public",
      scope: "none",
      visibility: "public_metadata",
    } as const;
  if (path === "/api/auth/*")
    return {
      authentication_class: "authentication_protocol",
      scope: "protocol",
      visibility: "protocol_allowlist",
    } as const;
  if (path.startsWith("/v1/machine/viewer/"))
    return {
      authentication_class: "ticket",
      scope: "issuing_device_and_execution_domain",
      visibility: "private",
    } as const;
  if (path === "/v1/harness/tools")
    return {
      authentication_class: "run_lease",
      scope: "server_derived_run_and_binding",
      visibility: "private",
    } as const;
  if (path === "/v1/data/legacy-binding" || path === "/health/ready")
    return {
      authentication_class: "bootstrap_owner_session",
      scope: "guarded_installation",
      visibility: "bootstrap_owner",
    } as const;
  if (path === "/v1/contracts" || isAuthenticationRoute(new Request(`http://localhost${path}`)))
    return {
      authentication_class: "user",
      scope: "authenticated_account",
      visibility: "self_or_contract_metadata",
    } as const;
  if (isOrganizationPath(path))
    return {
      authentication_class: "user",
      scope: "path_organization_or_email_bound_invitation",
      visibility: "current_membership_and_role",
    } as const;
  if (path.startsWith("/v1/browser/"))
    return {
      authentication_class: "user",
      scope: "disabled_in_accounts_mode",
      visibility: "none",
    } as const;
  return {
    authentication_class: "user",
    scope: "explicit_organization_header_and_actor",
    visibility: "private_or_explicit_published_grant",
  } as const;
}
