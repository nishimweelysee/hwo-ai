import {
  activeUserRoles as filterActiveRoles,
  type UserRoleItem,
} from "@/lib/user-roles";

export type RegistrationConfig = {
  organization: { name?: string; timezone?: string; locale?: string };
  userRoles: {
    defaultRole?: string;
    items?: UserRoleItem[];
  };
  departments: { id: string; name: string; code: string }[];
  shiftTypes?: string[];
};

export async function fetchRegistrationConfig(): Promise<RegistrationConfig | null> {
  try {
    const res = await fetch("/api/auth/registration-config");
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export function activeUserRoles(config: RegistrationConfig | null): UserRoleItem[] {
  return filterActiveRoles(config?.userRoles?.items, config?.userRoles?.defaultRole, {
    forRegistration: true,
  });
}
