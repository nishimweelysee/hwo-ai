/** Application user role categories — configured per role in Configuration → Application user roles */
export type UserType = "it" | "scheduling" | "operational" | "readonly" | "standard";

export type ManagedUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  organization?: string;
  active: boolean;
  staffId?: string | null;
  userType: UserType;
  phone?: string;
  department?: string;
  departmentId?: string;
  staffRole?: string;
  targetWorkload?: number;
  staffName?: string;
  linkedToScheduling?: boolean;
};

export type UserRoleItem = {
  id?: string;
  name: string;
  description?: string;
  active?: boolean;
  userType?: UserType;
  requiresDepartment?: boolean;
  requiresStaffRole?: boolean;
  requiresWorkloadTarget?: boolean;
  requiresStaffLink?: boolean;
  allowSelfRegister?: boolean;
};

export const USER_TYPE_LABELS: Record<UserType, string> = {
  it: "IT & Management",
  scheduling: "Scheduling & Operations",
  operational: "Analysis & Reporting",
  readonly: "Read-only",
  standard: "Standard",
};

export const USER_TYPE_OPTIONS: { value: UserType; label: string }[] = [
  { value: "it", label: USER_TYPE_LABELS.it },
  { value: "scheduling", label: USER_TYPE_LABELS.scheduling },
  { value: "operational", label: USER_TYPE_LABELS.operational },
  { value: "readonly", label: USER_TYPE_LABELS.readonly },
  { value: "standard", label: USER_TYPE_LABELS.standard },
];

const DEFAULT_ROLE_META: Record<string, Partial<UserRoleItem>> = {
  admin: { userType: "it" },
  analyst: { userType: "operational", requiresDepartment: true, requiresWorkloadTarget: true },
  scheduler: {
    userType: "scheduling",
    requiresDepartment: true,
    requiresStaffRole: true,
    requiresStaffLink: true,
  },
  manager: {
    userType: "it",
    requiresDepartment: true,
    requiresStaffRole: true,
    requiresStaffLink: true,
  },
  viewer: { userType: "readonly" },
};

function mergeRoleItem(role: string, item?: UserRoleItem): UserRoleItem | undefined {
  const fallback = DEFAULT_ROLE_META[role.toLowerCase()];
  if (!item && !fallback) return undefined;
  const base = { name: role, ...fallback, ...item };
  if (fallback?.userType && (!item?.userType || item.userType === "standard")) {
    base.userType = fallback.userType;
  }
  if (item) {
    if (item.requiresDepartment == null && fallback?.requiresDepartment != null) {
      base.requiresDepartment = fallback.requiresDepartment;
    }
    if (item.requiresStaffRole == null && fallback?.requiresStaffRole != null) {
      base.requiresStaffRole = fallback.requiresStaffRole;
    }
    if (item.requiresWorkloadTarget == null && fallback?.requiresWorkloadTarget != null) {
      base.requiresWorkloadTarget = fallback.requiresWorkloadTarget;
    }
    if (item.requiresStaffLink == null && fallback?.requiresStaffLink != null) {
      base.requiresStaffLink = fallback.requiresStaffLink;
    }
  }
  return base;
}

function findRoleItem(role: string, items?: UserRoleItem[]): UserRoleItem | undefined {
  if (!role) return undefined;
  const configured = items?.find((item) => item.name.toLowerCase() === role.toLowerCase());
  return mergeRoleItem(role, configured);
}

export function userTypeForRole(role: string, items?: UserRoleItem[]): UserType {
  const configured = findRoleItem(role, items)?.userType;
  return configured ?? "standard";
}

export function roleRequiresDepartment(role: string, items?: UserRoleItem[]): boolean {
  return Boolean(findRoleItem(role, items)?.requiresDepartment);
}

export function roleRequiresStaffRole(role: string, items?: UserRoleItem[]): boolean {
  return Boolean(findRoleItem(role, items)?.requiresStaffRole);
}

export function roleRequiresWorkloadTarget(role: string, items?: UserRoleItem[]): boolean {
  return Boolean(findRoleItem(role, items)?.requiresWorkloadTarget);
}

export function activeUserRoles(
  items: UserRoleItem[] | undefined,
  defaultRole?: string,
  options?: { forRegistration?: boolean }
): UserRoleItem[] {
  if (!items?.length) {
    return defaultRole ? [{ name: defaultRole }] : [];
  }
  return items.filter((role) => {
    if (role.active === false) return false;
    if (options?.forRegistration && role.allowSelfRegister === false) return false;
    return Boolean(role.name?.trim());
  });
}

export function defaultRoleName(
  items: UserRoleItem[] | undefined,
  configuredDefault?: string
): string {
  const active = activeUserRoles(items, configuredDefault);
  if (configuredDefault && active.some((role) => role.name === configuredDefault)) {
    return configuredDefault;
  }
  return active[0]?.name ?? configuredDefault ?? "";
}
