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
  path: "/",
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
  routeTree: rootRoute.addChildren([homeRoute, designSystemRoute]),
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
