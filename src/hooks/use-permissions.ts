"use client";

import { useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  ACTION_AUDIT_EXPORT,
  ACTION_DATA_MANAGE,
  ACTION_SETTINGS_MANAGE,
  ACTION_USERS_MANAGE,
  canAccessMenu,
  canManageSettings,
  canManageUsers,
  hasPermission,
  menuIdFromPath,
  UserPermissions,
} from "@/lib/permissions";

export function usePermissions() {
  const { permissions, user, loading } = useAuth();

  const manageUsers = useMemo(() => canManageUsers(permissions), [permissions]);
  const manageSettings = useMemo(() => canManageSettings(permissions), [permissions]);

  const canAccessMenuFor = useCallback(
    (menuId: string) => canAccessMenu(permissions, menuId),
    [permissions]
  );

  const canAccessPath = useCallback(
    (pathname: string) => {
      const menuId = menuIdFromPath(pathname);
      if (!menuId) return true;
      return canAccessMenu(permissions, menuId);
    },
    [permissions]
  );

  const hasPermissionFor = useCallback(
    (action: string) => hasPermission(permissions, action),
    [permissions]
  );

  return {
    loading,
    role: user?.role ?? permissions?.role,
    permissions: permissions as UserPermissions | null,
    manageUsers,
    manageSettings,
    canAccessMenu: canAccessMenuFor,
    canAccessPath,
    hasPermission: hasPermissionFor,
    canExportAudit: useMemo(
      () => hasPermission(permissions, ACTION_AUDIT_EXPORT) || canManageSettings(permissions),
      [permissions]
    ),
    canManageData: useMemo(
      () => hasPermission(permissions, ACTION_DATA_MANAGE) || canManageSettings(permissions),
      [permissions]
    ),
  };
}
