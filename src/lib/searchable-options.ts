export type SearchableOption = {
  value: string;
  label: string;
  subtitle?: string;
  /** Lowercase tokens used for search (auto-built from fields if omitted) */
  searchText?: string;
};

export function buildSearchText(parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .map((p) => String(p).toLowerCase())
    .join(" ");
}

export function filterSearchableOptions(options: SearchableOption[], query: string): SearchableOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((o) => {
    const haystack = o.searchText ?? `${o.label} ${o.subtitle ?? ""} ${o.value}`.toLowerCase();
    return q.split(/\s+/).every((token) => haystack.includes(token));
  });
}

export function paginateItems<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export type StaffLike = {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  department?: string | null;
  departmentId?: string | null;
};

export function staffToSearchableOptions(staff: StaffLike[]): SearchableOption[] {
  return staff.map((s) => ({
    value: s.id,
    label: s.name,
    subtitle: [s.role, s.department].filter(Boolean).join(" · ") || undefined,
    searchText: buildSearchText([s.id, s.name, s.email, s.role, s.department, s.departmentId]),
  }));
}

export type UserLike = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  userType?: string | null;
  department?: string | null;
  departmentId?: string | null;
  staffName?: string | null;
  staffId?: string | null;
  phone?: string | null;
  active?: boolean;
};

export function usersToSearchableOptions(users: UserLike[]): SearchableOption[] {
  return users.map((u) => ({
    value: u.id,
    label: u.name?.trim() || u.email || u.id,
    subtitle: [u.email, u.role, u.department, u.staffName].filter(Boolean).join(" · ") || undefined,
    searchText: buildSearchText([
      u.id,
      u.name,
      u.email,
      u.role,
      u.userType,
      u.department,
      u.departmentId,
      u.staffName,
      u.staffId,
      u.phone,
      u.active === false ? "inactive" : "active",
    ]),
  }));
}

export function filterUsers<T extends UserLike>(users: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return users;
  return users.filter((u) => {
    const haystack = buildSearchText([
      u.id,
      u.name,
      u.email,
      u.role,
      u.userType,
      u.department,
      u.departmentId,
      u.staffName,
      u.staffId,
      u.phone,
      u.active === false ? "inactive" : "active",
    ]);
    return q.split(/\s+/).every((token) => haystack.includes(token));
  });
}

export function filterStaffRows<T extends StaffLike>(rows: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((s) => {
    const haystack = buildSearchText([s.id, s.name, s.email, s.role, s.department, s.departmentId]);
    return q.split(/\s+/).every((token) => haystack.includes(token));
  });
}

export type WellnessAlertLike = {
  staff?: string | null;
  staffId?: string | null;
  email?: string | null;
  userId?: string | null;
  department?: string | null;
  risk?: string | null;
  aiRisk?: string | null;
  overtime?: number | null;
};

export function filterWellnessAlerts<T extends WellnessAlertLike>(rows: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((a) => {
    const haystack = buildSearchText([
      a.staff,
      a.staffId,
      a.email,
      a.userId,
      a.department,
      a.risk,
      a.aiRisk,
      a.overtime != null ? String(a.overtime) : "",
    ]);
    return q.split(/\s+/).every((token) => haystack.includes(token));
  });
}

export type WellnessRecordLike = {
  id: string;
  staffId: string;
  staffName?: string | null;
  department?: string | null;
  date?: string | null;
  riskLevel?: string | null;
  overtime?: number | null;
  score?: number | null;
};

export function filterWellnessRecords<T extends WellnessRecordLike>(rows: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => {
    const haystack = buildSearchText([
      r.id,
      r.staffId,
      r.staffName,
      r.department,
      r.date,
      r.riskLevel,
      r.overtime != null ? String(r.overtime) : "",
      r.score != null ? String(r.score) : "",
    ]);
    return q.split(/\s+/).every((token) => haystack.includes(token));
  });
}

export type StaffPreferenceLike = {
  staffId: string;
  staffName?: string | null;
  preferredShifts?: string[] | null;
  avoidDates?: string[] | null;
};

export function filterStaffPreferences<T extends StaffPreferenceLike>(rows: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((p) => {
    const haystack = buildSearchText([
      p.staffId,
      p.staffName,
      ...(p.preferredShifts ?? []),
      ...(p.avoidDates ?? []),
    ]);
    return q.split(/\s+/).every((token) => haystack.includes(token));
  });
}
