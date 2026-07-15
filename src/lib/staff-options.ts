import { apiFetch } from "@/lib/api";
import { staffToSearchableOptions, type SearchableOption } from "@/lib/searchable-options";
import type { LoadOptionsResult } from "@/components/searchable-select";

export type StaffOptionsQuery = {
  search?: string;
  page?: number;
  pageSize?: number;
  departmentId?: string;
};

export type StaffListPage<T = Record<string, unknown>> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

/** Paginated staff dropdown options (default 10 per page). */
export async function fetchStaffOptionsPage(query: StaffOptionsQuery = {}): Promise<LoadOptionsResult> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 10;
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.departmentId) params.set("departmentId", query.departmentId);

  const res = await apiFetch(`/api/staff/options?${params}`);
  if (!res.ok) return { options: [], totalItems: 0, totalPages: 1 };
  const data = await res.json();
  const rows = Array.isArray(data.options) ? data.options : [];
  return {
    options: staffToSearchableOptions(rows),
    totalItems: Number(data.totalItems ?? rows.length),
    totalPages: Number(data.totalPages ?? 1),
  };
}

/** Paginated staff table list (GET /api/staff). */
export async function fetchStaffPage<T = Record<string, unknown>>(
  query: StaffOptionsQuery & { wellness?: boolean } = {}
): Promise<StaffListPage<T>> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 10;
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.departmentId) params.set("departmentId", query.departmentId);
  if (query.wellness) params.set("wellness", "true");

  const res = await apiFetch(`/api/staff?${params}`);
  if (!res.ok) return { items: [], page, pageSize, totalItems: 0, totalPages: 1 };
  const data = await res.json();
  if (Array.isArray(data)) {
    // Legacy array response fallback
    return {
      items: data as T[],
      page: 1,
      pageSize: data.length,
      totalItems: data.length,
      totalPages: 1,
    };
  }
  const items = (Array.isArray(data.items) ? data.items : []) as T[];
  return {
    items,
    page: Number(data.page ?? page),
    pageSize: Number(data.pageSize ?? pageSize),
    totalItems: Number(data.totalItems ?? items.length),
    totalPages: Number(data.totalPages ?? 1),
  };
}

export type { SearchableOption };
