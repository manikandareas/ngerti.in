import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  lazyRouteComponent,
  Outlet,
  redirect,
  useLocation,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { validateMarketplaceSearch } from "@/features/marketplace/lib/marketplace-search";
import {
  isSettingsSection,
  type SettingsSectionId,
  validateSettingsSearch,
} from "@/features/settings/lib/settings-search";
import { type ComponentName, components } from "@/lib/component-catalog";

const AccountBoundary = lazy(() => import("@/features/account/session"));
function ApplicationRoot() {
  const pathname = useLocation({ select: (location) => location.pathname });
  if (["/theme-preview", "/design-system", "/assistant-studio", "/color-studio"].includes(pathname))
    return <Outlet />;
  return (
    <Suspense fallback={<div role="status" aria-label="Loading workspace" />}>
      <AccountBoundary>
        <Outlet />
      </AccountBoundary>
    </Suspense>
  );
}

const rootRoute = createRootRoute({
  component: ApplicationRoot,
  notFoundComponent: () => (
    <main className="mx-auto flex min-h-svh max-w-content flex-col items-start justify-center gap-4 px-6">
      <p className="font-mono text-caption text-link">404</p>
      <h1 className="text-heading font-medium">Halaman tidak ditemukan.</h1>
      <Button asChild>
        <Link to="/">Kembali ke beranda</Link>
      </Button>
    </main>
  ),
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "workspace",
  validateSearch: (search: Record<string, unknown>) => ({
    ...validateSettingsSearch(search),
    ...validateMarketplaceSearch(
      search.settings === "apps"
        ? { ...search, marketplace: "plugins", item: undefined, category: undefined }
        : search,
    ),
  }),
  component: lazyRouteComponent(() => import("@/app/workspace-layout")),
});

const conversationRoute = createRoute({
  getParentRoute: () => homeRoute,
  path: "/",
  component: () => null,
});

const signInRoute = createRoute({
  getParentRoute: () => homeRoute,
  path: "/sign-in",
  component: () => null,
});
const resetPasswordRoute = createRoute({
  getParentRoute: () => homeRoute,
  path: "/reset-password",
  component: () => null,
});
const invitationRoute = createRoute({
  getParentRoute: () => homeRoute,
  path: "/invitations/$invitationId",
  component: () => null,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  validateSearch: (
    search: Record<string, unknown>,
  ): { section?: SettingsSectionId | "apps"; provider?: "codex" | "muse" } => ({
    section:
      search.section === "apps"
        ? "apps"
        : isSettingsSection(search.section)
          ? search.section
          : undefined,
    provider:
      search.section === "providers" && (search.provider === "codex" || search.provider === "muse")
        ? search.provider
        : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/",
      search:
        search.section === "apps"
          ? { marketplace: "plugins" }
          : { settings: search.section ?? "general", provider: search.provider },
      replace: true,
    });
  },
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  validateSearch: (search: Record<string, unknown>): { create?: true; step?: 2 } => ({
    create: search.create === true || search.create === "true" ? true : undefined,
    step: search.step === 2 || search.step === "2" ? 2 : undefined,
  }),
  component: () => null,
});

const themePreviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/theme-preview",
  component: lazyRouteComponent(() => import("@/pages/home")),
});

const avatarStudioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/avatar-studio",
  validateSearch: (search: Record<string, unknown>): { agent?: string } => ({
    agent: typeof search.agent === "string" ? search.agent : undefined,
  }),
  component: lazyRouteComponent(() => import("@/features/avatar/components/avatar-studio")),
});

const colorStudioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/color-studio",
  component: lazyRouteComponent(() => import("@/features/color-studio/color-studio")),
});

const assistantStudioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/assistant-studio",
  validateSearch: (
    search: Record<string, unknown>,
  ): { section?: string; state?: string; mode?: "dm" | "group" } => ({
    section: typeof search.section === "string" ? search.section : undefined,
    state: typeof search.state === "string" ? search.state : undefined,
    mode: search.mode === "dm" || search.mode === "group" ? search.mode : undefined,
  }),
  component: lazyRouteComponent(() => import("@/features/assistant-studio/assistant-studio")),
});

const designSystemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/design-system",
  validateSearch: (search: Record<string, unknown>): { component?: ComponentName } => ({
    component:
      typeof search.component === "string" && components.includes(search.component as ComponentName)
        ? (search.component as ComponentName)
        : undefined,
  }),
  component: lazyRouteComponent(() => import("@/pages/design-system")),
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    homeRoute.addChildren([conversationRoute, signInRoute, resetPasswordRoute, invitationRoute]),
    onboardingRoute,
    settingsRoute,
    designSystemRoute,
    themePreviewRoute,
    avatarStudioRoute,
    colorStudioRoute,
    assistantStudioRoute,
  ]),
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
