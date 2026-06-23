"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/hooks/use-permissions";
import { canAccessMenu, menuIdFromPath } from "@/lib/permissions";

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading: authLoading, token } = useAuth();
  const { loading: permLoading, permissions } = usePermissions();

  const loading = authLoading || permLoading;
  const menuId = menuIdFromPath(pathname);
  const pathAllowed = useMemo(
    () => !menuId || canAccessMenu(permissions, menuId),
    [permissions, menuId]
  );

  useEffect(() => {
    if (loading) return;
    if (!token || !permissions) {
      router.replace("/login");
      return;
    }
    if (!pathAllowed) {
      router.replace("/dashboard");
    }
  }, [loading, token, permissions, pathAllowed, router]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
        Loading…
      </div>
    );
  }

  if (!permissions) {
    return null;
  }

  if (!pathAllowed) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
        <p className="font-medium text-amber-900">Access denied</p>
        <p className="mt-2 text-sm text-amber-800">
          Your role ({permissions.role}) does not include access to {menuId ?? "this module"}.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
