/** Menu and permission keys — keep in sync with backend RolePermissions.java */

export type MenuId =
  | "dashboard"
  | "data-collection"
  | "workload-analysis"
  | "ai-prediction"
  | "scheduling"
  | "reporting"
  | "wellness"
  | "resources"
  | "skills"
  | "mobile"
  | "compliance"
  | "user-management"
  | "configuration"
  | "data-management"
  | "audit"
  | "profile";

export const ALL_PERMISSION = "*";

export const ACTION_USERS_MANAGE = "users:manage";
export const ACTION_SETTINGS_MANAGE = "settings:manage";
export const ACTION_AUDIT_EXPORT = "audit:export";
export const ACTION_DATA_MANAGE = "data:manage";

export const ACTION_CATALOG: { id: string; label: string; description: string }[] = [
  { id: ACTION_USERS_MANAGE, label: "Manage users", description: "Create, edit, and deactivate application users" },
  { id: ACTION_SETTINGS_MANAGE, label: "Manage settings", description: "Edit configuration and role permission matrix" },
  { id: ACTION_AUDIT_EXPORT, label: "Export audit logs", description: "Download audit and activity exports" },
  { id: ACTION_DATA_MANAGE, label: "Manage data", description: "Import, purge, and manage operational data sets" },
];

export type UserPermissions = {
  role?: string;
  menus?: string[];
  actions?: string[];
  canManageUsers?: boolean;
  canManageSettings?: boolean;
};

export const MENU_ITEMS: { id: MenuId; href: string; label: string }[] = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard" },
  { id: "data-collection", href: "/data-collection", label: "Data Collection" },
  { id: "workload-analysis", href: "/workload-analysis", label: "Workload Analysis" },
  { id: "ai-prediction", href: "/ai-prediction", label: "AI Prediction" },
  { id: "scheduling", href: "/scheduling", label: "Scheduling" },
  { id: "reporting", href: "/reporting", label: "Reporting" },
  { id: "wellness", href: "/wellness", label: "Staff Wellness" },
  { id: "resources", href: "/resources", label: "Resources" },
  { id: "skills", href: "/skills", label: "Skills & Competency" },
  { id: "mobile", href: "/mobile", label: "Mobile" },
  { id: "compliance", href: "/compliance", label: "Compliance" },
  { id: "user-management", href: "/user-management", label: "User Management" },
  { id: "configuration", href: "/configuration", label: "Configuration" },
  { id: "data-management", href: "/data-management", label: "Data Management" },
  { id: "audit", href: "/audit", label: "Audit & Logging" },
  { id: "profile", href: "/profile", label: "Profile" },
];

export function menuIdFromPath(pathname: string): MenuId | null {
  const item = MENU_ITEMS.find(
    (m) => pathname === m.href || pathname.startsWith(`${m.href}/`)
  );
  return item?.id ?? null;
}

export function canAccessMenu(permissions: UserPermissions | null | undefined, menuId: string): boolean {
  if (!permissions?.menus?.length) return menuId === "profile";
  if (permissions.menus.includes(ALL_PERMISSION)) return true;
  return permissions.menus.includes(menuId);
}

export function hasPermission(
  permissions: UserPermissions | null | undefined,
  action: string
): boolean {
  if (!permissions?.actions?.length) return false;
  if (permissions.actions.includes(ALL_PERMISSION)) return true;
  return permissions.actions.includes(action);
}

export function canManageUsers(permissions: UserPermissions | null | undefined): boolean {
  return Boolean(
    permissions?.canManageUsers ||
      hasPermission(permissions, ACTION_USERS_MANAGE) ||
      hasPermission(permissions, ALL_PERMISSION)
  );
}

export function canManageSettings(permissions: UserPermissions | null | undefined): boolean {
  return Boolean(
    permissions?.canManageSettings ||
      hasPermission(permissions, ACTION_SETTINGS_MANAGE) ||
      hasPermission(permissions, ALL_PERMISSION)
  );
}
