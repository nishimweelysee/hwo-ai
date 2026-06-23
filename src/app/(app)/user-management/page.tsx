"use client";

import { useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/hooks/use-permissions";
import { apiFetch, parseApiError } from "@/lib/api";
import { useWorkforceCatalog } from "@/hooks/use-workforce-catalog";
import { TextField, SelectField } from "@/components/form-fields";
import { ListSearchBar } from "@/components/list-search-bar";
import { Pagination } from "@/components/pagination";
import {
  ManagedUser,
  USER_TYPE_LABELS,
  UserType,
  UserRoleItem,
  activeUserRoles,
  defaultRoleName,
  roleRequiresDepartment,
  roleRequiresStaffRole,
  roleRequiresWorkloadTarget,
} from "@/lib/user-roles";
import {
  Users,
  Plus,
  Pencil,
  UserX,
  Shield,
  Building2,
  Link2,
  RefreshCw,
  HelpCircle,
  ArrowRight,
  UserCheck,
  UserMinus,
  ExternalLink,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const EMPTY_FORM = {
  name: "",
  email: "",
  password: "",
  role: "",
  organization: "",
  phone: "",
  departmentId: "",
  staffRole: "",
  targetWorkload: "",
  active: true,
};

type UserSummary = {
  total: number;
  active: number;
  inactive: number;
  linkedToScheduling: number;
  byUserType: Record<string, number>;
  byRole: Record<string, number>;
};

type Overview = {
  organization: string;
  userRoles?: { items?: UserRoleItem[]; defaultRole?: string };
  summary: UserSummary;
};

type UsersPage = {
  items: ManagedUser[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

const USER_TYPE_COLORS: Record<string, string> = {
  it: "#0d9488",
  scheduling: "#2563eb",
  operational: "#7c3aed",
  readonly: "#64748b",
  standard: "#94a3b8",
};

type StatusFilter = "all" | "active" | "inactive";

function ChartSkeleton({ className = "h-64" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-100 ${className}`} />;
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon: ReactNode;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
        </div>
        <div className={`rounded-lg p-2 ${accent}`}>{icon}</div>
      </div>
    </div>
  );
}

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const { manageUsers, loading: permLoading } = usePermissions();
  const { departments, staffRoles } = useWorkforceCatalog();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [roleItems, setRoleItems] = useState<UserRoleItem[]>([]);
  const [defaultUserRole, setDefaultUserRole] = useState("");
  const [organization, setOrganization] = useState("");
  const [typeFilter, setTypeFilter] = useState<UserType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [userSearch, setUserSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const summary = overview?.summary;
  const filterKey = `${typeFilter}|${statusFilter}|${debouncedSearch}|${pageSize}`;
  const prevFilterKeyRef = useRef(filterKey);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(userSearch), 300);
    return () => window.clearTimeout(timer);
  }, [userSearch]);

  const loadOverview = useCallback(async () => {
    const res = await apiFetch("/api/users/overview");
    if (res.status === 403 || res.status === 401) {
      throw new Error(await parseApiError(res, "Permission denied: users:manage required"));
    }
    if (!res.ok) {
      throw new Error(await parseApiError(res, "Failed to load user management data"));
    }
    const data: Overview = await res.json();
    setOverview(data);
    setOrganization(data.organization || "");
    setRoleItems(activeUserRoles(data.userRoles?.items, data.userRoles?.defaultRole));
    setDefaultUserRole(data.userRoles?.defaultRole || "");
  }, []);

  const loadUsersPage = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        size: String(pageSize),
      });
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (typeFilter !== "all") params.set("userType", typeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await apiFetch(`/api/users?${params}`);
      if (!res.ok) {
        throw new Error(await parseApiError(res, "Failed to load users"));
      }
      const data: UsersPage = await res.json();
      setUsers(Array.isArray(data.items) ? data.items : []);
      setPage(data.page ?? page);
      setPageSize(data.pageSize ?? pageSize);
      setTotalItems(data.totalItems ?? 0);
      setTotalPages(Math.max(1, data.totalPages ?? 1));
    } finally {
      setUsersLoading(false);
    }
  }, [page, pageSize, debouncedSearch, typeFilter, statusFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadOverview();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load user management data");
    } finally {
      setLoading(false);
    }
  }, [loadOverview]);

  useEffect(() => {
    if (permLoading) return;
    if (manageUsers) load();
    else setLoading(false);
  }, [permLoading, manageUsers, load]);

  useEffect(() => {
    if (permLoading || !manageUsers || loading) return;

    const filtersChanged = prevFilterKeyRef.current !== filterKey;
    if (filtersChanged) {
      prevFilterKeyRef.current = filterKey;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }

    loadUsersPage().catch(() => setError("Failed to load users"));
  }, [permLoading, manageUsers, loading, loadUsersPage, filterKey, page]);

  const typeChartData = useMemo(() => {
    const byType = summary?.byUserType ?? {};
    return Object.entries(byType)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => ({
        key,
        label: USER_TYPE_LABELS[key as UserType] ?? key,
        count,
        fill: USER_TYPE_COLORS[key] ?? "#64748b",
      }))
      .sort((a, b) => b.count - a.count);
  }, [summary?.byUserType]);

  const initialRole = defaultRoleName(roleItems, defaultUserRole);

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, organization, role: initialRole });
    setEditingId(null);
    setShowForm(false);
  };

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, organization, role: initialRole });
    setEditingId(null);
    setShowForm(true);
    setError(null);
    setSuccess(null);
  };

  const openEdit = (u: ManagedUser) => {
    setEditingId(u.id);
    setForm({
      name: u.name || "",
      email: u.email || "",
      password: "",
      role: u.role || "",
      organization: u.organization || organization,
      phone: u.phone || "",
      departmentId: u.departmentId || "",
      staffRole: u.staffRole || "",
      targetWorkload: u.targetWorkload != null ? String(u.targetWorkload) : "",
      active: u.active !== false,
    });
    setShowForm(true);
    setError(null);
    setSuccess(null);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required");
      return;
    }
    if (!editingId && !form.password.trim()) {
      setError("Password is required for new users");
      return;
    }
    if (roleRequiresDepartment(form.role, roleItems) && !form.departmentId) {
      setError(`Department is required for ${form.role} users (used in scheduling & workload)`);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      organization: form.organization || organization,
      phone: form.phone,
      departmentId: form.departmentId || null,
      staffRole: form.staffRole || null,
      active: form.active,
    };
    if (form.targetWorkload) payload.targetWorkload = Number(form.targetWorkload);
    if (form.password.trim()) payload.password = form.password;

    try {
      const res = await apiFetch(editingId ? `/api/users/${editingId}` : "/api/users", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to save user"));
        return;
      }
      setSuccess(editingId ? "User updated successfully" : "User created successfully");
      resetForm();
      await Promise.all([loadOverview(), loadUsersPage()]);
    } catch {
      setError("Failed to save user — check that the backend is running");
    } finally {
      setSaving(false);
    }
  };

  const deactivateUser = async (id: string) => {
    if (!confirm("Deactivate this user? They will no longer be able to sign in.")) return;
    setError(null);
    const res = await apiFetch(`/api/users/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(await parseApiError(res, "Failed to deactivate user"));
      return;
    }
    setSuccess("User deactivated");
    await Promise.all([loadOverview(), loadUsersPage()]);
  };

  const selectedRoleHint = roleItems.find((r) => r.name === form.role);

  if (!permLoading && !manageUsers) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-800">User Management</h2>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You need the <strong>users:manage</strong> permission. Your role: {currentUser?.role || "—"}.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <Users className="h-7 w-7 text-teal-600" />
            User Management
          </h2>
          <p className="mt-1 text-slate-600">
            Application accounts, roles, and workforce-linked logins for scheduling and workload modules
          </p>
          {organization && (
            <p className="mt-1 text-xs text-slate-500">Organization: {organization}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setError(null);
              Promise.all([loadOverview(), loadUsersPage()]).catch(() =>
                setError("Failed to refresh user data")
              );
            }}
            disabled={loading || usersLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading || usersLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600"
          >
            <Plus className="h-4 w-4" /> Add user
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="rounded-lg border border-teal-100 bg-teal-50/50 p-4">
        <p className="flex items-start gap-2 text-sm font-medium text-teal-900">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
          How user accounts work
        </p>
        <ul className="mt-2 grid gap-1.5 text-sm text-slate-600 sm:grid-cols-2">
          <li className="flex gap-2">
            <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400" />
            <strong>Application role</strong> controls menu access and permissions (Configuration → Roles)
          </li>
          <li className="flex gap-2">
            <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400" />
            <strong>Scheduling-linked</strong> users get a Staff record for shifts, workload, and wellness
          </li>
          <li className="flex gap-2">
            <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400" />
            Department and workforce role are required for clinical/scheduling roles
          </li>
          <li className="flex gap-2">
            <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400" />
            Deactivating a user blocks sign-in but keeps audit history
          </li>
        </ul>
      </div>

      {loading && !overview ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <ChartSkeleton key={i} className="h-28" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total users"
            value={summary.total}
            sub={`${roleItems.length} configured role(s)`}
            icon={<Users className="h-5 w-5 text-teal-600" />}
            accent="bg-teal-100"
          />
          <KpiCard
            label="Active accounts"
            value={summary.active}
            sub={`${summary.inactive} inactive`}
            icon={<UserCheck className="h-5 w-5 text-emerald-600" />}
            accent="bg-emerald-100"
          />
          <KpiCard
            label="Scheduling-linked"
            value={summary.linkedToScheduling}
            sub="Users with Staff records"
            icon={<Link2 className="h-5 w-5 text-blue-600" />}
            accent="bg-blue-100"
          />
          <KpiCard
            label="User categories"
            value={typeChartData.length}
            sub="IT, scheduling, operational, read-only"
            icon={<Shield className="h-5 w-5 text-violet-600" />}
            accent="bg-violet-100"
          />
        </div>
      ) : null}

      {summary && typeChartData.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-1 font-semibold text-slate-800">Users by category</h3>
          <p className="mb-4 text-xs text-slate-500">Grouped by user type from Configuration → Application user roles</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={typeChartData} margin={{ left: 8, right: 16, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-12} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} />
              <Tooltip
                formatter={(value: number) => [value, "Users"]}
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {typeChartData.map((entry) => (
                  <Cell key={entry.key} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {showForm && (
        <div className="rounded-xl border border-teal-200 bg-white p-6 shadow-sm">
          <h3 className="mb-1 font-semibold text-slate-800">{editingId ? "Edit user" : "New user"}</h3>
          {selectedRoleHint?.description && (
            <p className="mb-4 text-sm text-slate-500">{selectedRoleHint.description}</p>
          )}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <TextField label="Full name *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            <TextField label="Email *" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} type="email" />
            <TextField
              label={editingId ? "New password (optional)" : "Password *"}
              value={form.password}
              onChange={(v) => setForm((f) => ({ ...f, password: v }))}
              type="password"
            />
            <SelectField
              label="Application role *"
              value={form.role}
              onChange={(v) => setForm((f) => ({ ...f, role: v }))}
              options={roleItems.map((r) => ({ value: r.name, label: r.name }))}
              hint={selectedRoleHint?.description}
            />
            <TextField label="Organization" value={form.organization} onChange={(v) => setForm((f) => ({ ...f, organization: v }))} />
            <TextField label="Phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
            <SelectField
              label={`Department${roleRequiresDepartment(form.role, roleItems) ? " *" : ""}`}
              value={form.departmentId}
              onChange={(v) => setForm((f) => ({ ...f, departmentId: v }))}
              placeholder="Select department"
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
              hint="Used in scheduling, workload, and profile"
            />
            {roleRequiresStaffRole(form.role, roleItems) && (
              <SelectField
                label="Workforce role (scheduling)"
                value={form.staffRole}
                onChange={(v) => setForm((f) => ({ ...f, staffRole: v }))}
                placeholder="Auto (from Configuration)"
                options={staffRoles.map((r) => ({ value: r.name, label: `${r.name} (${r.code})` }))}
              />
            )}
            {roleRequiresWorkloadTarget(form.role, roleItems) && (
              <TextField
                label="Target workload %"
                value={form.targetWorkload}
                onChange={(v) => setForm((f) => ({ ...f, targetWorkload: v }))}
                type="number"
                hint="Used in workload analysis thresholds"
              />
            )}
            <label className="flex items-center gap-2 self-end rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="rounded"
              />
              Account active
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
            >
              {saving ? "Saving…" : editingId ? "Update user" : "Create user"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-800">
              Users ({totalItems.toLocaleString()}
              {typeFilter !== "all" ? ` · ${USER_TYPE_LABELS[typeFilter]}` : ""}
              {statusFilter !== "all" ? ` · ${statusFilter}` : ""})
            </h3>
            <p className="text-xs text-slate-500">Server-side search and pagination — only one page loaded at a time</p>
          </div>
          <ListSearchBar
            value={userSearch}
            onChange={setUserSearch}
            placeholder="Search name, email, role, department…"
            className="sm:max-w-sm"
          />
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {(["all", "it", "scheduling", "operational", "readonly"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setTypeFilter(type);
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                typeFilter === type ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {type === "all" ? "All types" : USER_TYPE_LABELS[type]}
              {summary && type !== "all" && summary.byUserType[type] != null && (
                <span className="ml-1 opacity-80">({summary.byUserType[type]})</span>
              )}
            </button>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {(
            [
              { id: "all", label: "All statuses" },
              { id: "active", label: "Active only" },
              { id: "inactive", label: "Inactive only" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setStatusFilter(opt.id);
                setPage(1);
              }}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                statusFilter === opt.id
                  ? "border-teal-300 bg-teal-50 text-teal-800"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {loading || usersLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <ChartSkeleton key={i} className="h-12" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-slate-500">No users match your filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="pb-3 pr-4">Name</th>
                  <th className="pb-3 pr-4">Email</th>
                  <th className="pb-3 pr-4">App role</th>
                  <th className="pb-3 pr-4">Category</th>
                  <th className="pb-3 pr-4">Department</th>
                  <th className="pb-3 pr-4">Workforce</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-slate-800">{u.name}</p>
                      {u.id === currentUser?.id && (
                        <span className="text-xs text-teal-600">You</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{u.email}</td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center gap-1 text-slate-700">
                        <Shield className="h-3.5 w-3.5 text-slate-400" /> {u.role}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {USER_TYPE_LABELS[u.userType] || u.userType}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center gap-1 text-slate-700">
                        <Building2 className="h-3.5 w-3.5 text-slate-400" />
                        {u.department || "—"}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {u.linkedToScheduling ? (
                        <Link
                          href={`/scheduling?staffId=${encodeURIComponent(u.staffId || "")}&staffName=${encodeURIComponent(u.name)}`}
                          className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          {u.staffRole || "Linked"}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </Link>
                      ) : (
                        <span className="text-slate-400">Not linked</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
                          u.active !== false ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {u.active !== false ? (
                          <>
                            <UserCheck className="h-3 w-3" /> Active
                          </>
                        ) : (
                          <>
                            <UserMinus className="h-3 w-3" /> Inactive
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(u)}
                          title="Edit user"
                          className="rounded p-1 text-teal-600 hover:bg-teal-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {u.id !== currentUser?.id && u.active !== false && (
                          <button
                            type="button"
                            onClick={() => deactivateUser(u.id)}
                            title="Deactivate user"
                            className="rounded p-1 text-rose-600 hover:bg-rose-50"
                          >
                            <UserX className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              className="mt-4"
              page={page}
              pageSize={pageSize}
              totalItems={totalItems}
              totalPages={totalPages}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        )}
      </div>
    </div>
  );
}
