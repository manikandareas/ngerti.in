import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  lazyRouteComponent,
  Outlet,
} from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
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
  component: lazyRouteComponent(() => import("@/app/workspace-layout")),
});

const conversationRoute = createRoute({
  getParentRoute: () => homeRoute,
  path: "/",
  component: () => null,
});

const settingsRoute = createRoute({
  getParentRoute: () => homeRoute,
  path: "settings",
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
  component: lazyRouteComponent(() => import("@/features/settings/components/settings-page")),
});

const themePreviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/theme-preview",
  component: lazyRouteComponent(() => import("@/pages/home")),
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
    homeRoute.addChildren([conversationRoute, settingsRoute]),
    designSystemRoute,
    themePreviewRoute,
  ]),
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
