import { createRouter, createWebHistory } from "vue-router";

import { ROUTE_PATHS } from "@/constants/routes";
import { useAuthStore } from "@/store/auth";

import { routes } from "./routes";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
});

router.beforeEach((to) => {
  document.title = `Klontong Digital • ${String(to.meta.title ?? "App")}`;

  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { path: ROUTE_PATHS.login };
  }

  if (to.meta.requiresOwner && auth.user?.role !== "owner") {
    return { path: ROUTE_PATHS.dashboard };
  }

  if (to.meta.requiresSuperAdmin && !auth.user?.isSuperAdmin) {
    return { path: ROUTE_PATHS.dashboard };
  }

  const requiredRoles = to.meta.requiresRoles as Array<string> | undefined;
  if (requiredRoles && !auth.user?.isSuperAdmin) {
    if (!auth.user?.role || !requiredRoles.includes(auth.user.role)) {
      return { path: ROUTE_PATHS.dashboard };
    }
  }

  if (to.path === ROUTE_PATHS.login && auth.isAuthenticated) {
    return { path: ROUTE_PATHS.dashboard };
  }

  return true;
});

export default router;
