import { apiFetch } from "@/lib/api";

export type DepartmentOption = { id: string; name: string; code?: string };
export type StaffRoleOption = { id: string; name: string; code: string };

/** Shared loader for departments used across user management, data collection, profile, etc. */
export async function loadDepartments(): Promise<DepartmentOption[]> {
  const res = await apiFetch("/api/departments");
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((d: { id: string; name: string; code?: string }) => ({
    id: d.id,
    name: d.name,
    code: d.code,
  }));
}

/** Shared loader for active workforce roles (scheduling, imports, user management). */
export async function loadStaffRoles(): Promise<StaffRoleOption[]> {
  const res = await apiFetch("/api/roles?activeOnly=true");
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
