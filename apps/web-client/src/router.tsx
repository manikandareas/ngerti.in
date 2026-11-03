import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { validateSettingsSearch } from "@/features/settings/lib/settings-search";
import { type ComponentName, components } from "@/lib/component-catalog";

const rootRoute = createRootRoute({
  component: Outlet,
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
  validateSearch: validateSettingsSearch,
  component: lazyRouteComponent(() => import("@/app/workspace-layout")),
});

const conversationRoute = createRoute({
  getParentRoute: () => homeRoute,
  path: "/",
  component: () => null,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  validateSearch: (
    search: Record<string, unknown>,
  ): { section?: "general" | "providers" | "about"; provider?: "codex" | "muse" } => ({
    section:
      search.section === "providers" || search.section === "about" ? search.section : undefined,
    provider:
      search.section === "providers" && (search.provider === "codex" || search.provider === "muse")
        ? search.provider
        : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/",
      search: { settings: search.section ?? "general", provider: search.provider },
      replace: true,
    });
  },
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
    homeRoute.addChildren([conversationRoute]),
    settingsRoute,
    designSystemRoute,
    themePreviewRoute,
    avatarStudioRoute,
    colorStudioRoute,
  ]),
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
