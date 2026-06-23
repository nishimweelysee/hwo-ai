"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  BACKUP_FREQUENCY_OPTIONS,
  LOCALE_OPTIONS,
  parseApiError,
  RETRAIN_DAY_OPTIONS,
  SYNC_FREQUENCY_OPTIONS,
  TIMEZONE_OPTIONS,
  writableSettingsPayload,
} from "@/lib/settings-config";
import {
  Settings,
  Building2,
  Calendar,
  BarChart3,
  Brain,
  Plug,
  Bell,
  Plus,
  Pencil,
  Trash2,
  Shield,
  Database,
  KeyRound,
  Package,
  Award,
  Heart,
} from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { MENU_ITEMS, ACTION_CATALOG } from "@/lib/permissions";
import {
  activeUserRoles,
  defaultRoleName,
  USER_TYPE_OPTIONS,
  type UserRoleItem,
  type UserType,
} from "@/lib/user-roles";
import { CommaSeparatedField, commitFocusedCommaField } from "@/components/comma-separated-field";
import {
  collectCertNamesFromRequirementMaps,
  findUnknownCatalogNames,
} from "@/lib/comma-separated-list";

type TabId = "departments" | "roles" | "permissions" | "organization" | "scheduling" | "workload" | "inventory" | "skills" | "wellness" | "ai" | "integrations" | "notifications" | "data";

const TABS: { id: TabId; label: string; icon: typeof Settings }[] = [
  { id: "departments", label: "Departments", icon: Building2 },
  { id: "roles", label: "Roles", icon: Shield },
  { id: "permissions", label: "Menu & Permissions", icon: KeyRound },
  { id: "organization", label: "Organization", icon: Settings },
  { id: "scheduling", label: "Scheduling", icon: Calendar },
  { id: "workload", label: "Workload", icon: BarChart3 },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "skills", label: "Skills", icon: Award },
  { id: "wellness", label: "Wellness", icon: Heart },
  { id: "ai", label: "AI & Predictions", icon: Brain },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "data", label: "Data & Security", icon: Database },
];

type Department = {
  id: string;
  name: string;
  code: string;
  description: string;
  active: boolean;
  staffCount: number;
  targetWorkload: number;
};

type StaffRole = {
  id: string;
  name: string;
  code: string;
  category: string;
  description: string;
  active: boolean;
  staffCount: number;
};

type SettingsMap = Record<string, Record<string, unknown>>;

type SurveyQuestion = { id: string; text: string; type: "scale" | "number" };

const DEFAULT_SURVEY_QUESTIONS: SurveyQuestion[] = [
  { id: "q1", text: "How would you rate your current workload?", type: "scale" },
  { id: "q2", text: "Do you feel supported by your team?", type: "scale" },
  { id: "q3", text: "How many hours of overtime did you work this week?", type: "number" },
  { id: "q4", text: "How would you rate your work-life balance?", type: "scale" },
  { id: "q5", text: "Would you recommend intervention support?", type: "scale" },
];

function surveyQuestionsFromSection(section: Record<string, unknown>): SurveyQuestion[] {
  const raw = section.surveyQuestions;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((item) => {
      const q = item as SurveyQuestion;
      return {
        id: String(q.id ?? ""),
        text: String(q.text ?? ""),
        type: q.type === "number" ? "number" : "scale",
      };
    });
  }
  return DEFAULT_SURVEY_QUESTIONS;
}

export default function ConfigurationPage() {
  const [tab, setTab] = useState<TabId>("departments");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [settings, setSettings] = useState<SettingsMap>({});
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deptForm, setDeptForm] = useState({ name: "", code: "", description: "", targetWorkload: "", active: true });
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [staffRoles, setStaffRoles] = useState<StaffRole[]>([]);
  const [roleForm, setRoleForm] = useState({ name: "", code: "", category: "clinical", description: "", active: true });
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [integrationTest, setIntegrationTest] = useState<Record<string, { status?: string; statusLabel?: string; message?: string; connected?: boolean }> | null>(null);
  const [testingIntegrations, setTestingIntegrations] = useState(false);
  const { manageSettings } = usePermissions();
  const [permissionConfig, setPermissionConfig] = useState<{
    roleMenus?: Record<string, string[]>;
    roleActions?: Record<string, string[]>;
    menus?: { id: string; label: string; route: string }[];
    actions?: { id: string; label: string; description: string }[];
  } | null>(null);
  const [permissionLoading, setPermissionLoading] = useState(false);

  const loadPermissionConfig = () => {
    setPermissionLoading(true);
    return apiFetch("/api/permissions/config")
      .then(async (r) => {
        if (!r.ok) {
          setError(await parseApiError(r, "Failed to load permissions"));
          return null;
        }
        return r.json();
      })
      .then((data) => { if (data) setPermissionConfig(data); })
      .finally(() => setPermissionLoading(false));
  };

  const loadDepartments = () =>
    apiFetch("/api/departments")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Department[]) => setDepartments(data));

  const loadSettings = () => {
    setSettingsLoading(true);
    return apiFetch("/api/settings")
      .then(async (r) => {
        if (!r.ok) {
          setError(await parseApiError(r, "Failed to load settings"));
          return {} as SettingsMap;
        }
        return r.json() as Promise<SettingsMap>;
      })
      .then((data) => setSettings(data))
      .finally(() => setSettingsLoading(false));
  };

  const loadStaffRoles = () =>
    apiFetch("/api/roles")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: StaffRole[]) => setStaffRoles(data));

  useEffect(() => {
    loadDepartments();
    loadSettings();
    loadStaffRoles();
  }, []);

  useEffect(() => {
    if (!deptForm.targetWorkload && settings.workload?.alertThreshold != null) {
      setDeptForm((f) => ({ ...f, targetWorkload: String(settings.workload?.alertThreshold) }));
    }
  }, [settings.workload?.alertThreshold]);

  useEffect(() => {
    setError(null);
    setSuccess(null);
    if (tab === "permissions") loadPermissionConfig();
  }, [tab]);

  const saveSection = async (section: TabId) => {
    if (section === "departments" || section === "roles" || section === "permissions") return;
    commitFocusedCommaField();
    const payload = writableSettingsPayload(section, settings[section] as Record<string, unknown> | undefined);
    if (Object.keys(payload).length === 0) {
      setError("Nothing to save — wait for settings to load or change a value first");
      return;
    }
    if (section === "scheduling") {
      const catalog = Array.isArray(settings.skills?.certCatalog)
        ? (settings.skills?.certCatalog as string[]).map((c) => String(c).trim()).filter(Boolean)
        : [];
      if (catalog.length > 0) {
        const unknown = findUnknownCatalogNames(catalog, collectCertNamesFromRequirementMaps(
          payload.departmentSkillRequirements as Record<string, string[]> | undefined,
          payload.shiftSkillRequirements as Record<string, string[]> | undefined,
        ));
        if (unknown.length > 0) {
          setError(
            `Unknown certification(s): ${unknown.join(", ")}. Add them under Skills → Certification catalog first, then save Skills before Scheduling.`
          );
          return;
        }
      }
    }
    if (section === "integrations") {
      if (payload.hisEnabled && !String(payload.hisUrl ?? "").trim()) {
        setError("HIS endpoint URL is required when HIS integration is enabled");
        return;
      }
      if (payload.hrEnabled && !String(payload.hrUrl ?? "").trim()) {
        setError("HR system URL is required when HR integration is enabled");
        return;
      }
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch(`/api/settings/${section}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to save settings"));
        return;
      }
      const data = await res.json();
      if (data.settings) {
        setSettings((prev) => ({ ...prev, [section]: data.settings }));
      } else {
        await loadSettings();
      }
      setSuccess("Settings saved successfully");
      if (section === "integrations") {
        await testIntegrations();
      }
    } catch {
      setError("Failed to save settings — check that the backend is running on port 8080");
    } finally {
      setSaving(false);
    }
  };

  const defaultDeptWorkload = () => {
    const value = settings.workload?.alertThreshold;
    return value != null ? String(value) : "";
  };

  const resetDeptForm = () => {
    setDeptForm({ name: "", code: "", description: "", targetWorkload: defaultDeptWorkload(), active: true });
    setEditingDeptId(null);
    setError(null);
  };

  const testIntegrations = async () => {
    setTestingIntegrations(true);
    setIntegrationTest(null);
    try {
      const res = await apiFetch("/api/integrations/health");
      const data = await res.json();
      if (res.ok) setIntegrationTest(data);
      else setError("Integration health check failed");
    } catch {
      setError("Integration health check failed");
    } finally {
      setTestingIntegrations(false);
    }
  };

  const saveDepartment = async () => {
    if (!deptForm.name.trim()) {
      setError("Department name is required");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      name: deptForm.name.trim(),
      code: deptForm.code.trim() || undefined,
      description: deptForm.description.trim(),
      targetWorkload: Number(deptForm.targetWorkload) || Number(settings.workload?.alertThreshold) || 0,
      active: deptForm.active,
    };
    try {
      const res = await apiFetch(editingDeptId ? `/api/departments/${editingDeptId}` : "/api/departments", {
        method: editingDeptId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || `Failed to save department (${res.status})`);
        return;
      }
      resetDeptForm();
      await loadDepartments();
      setSuccess("Department saved successfully");
    } catch {
      setError("Failed to save department");
    } finally {
      setSaving(false);
    }
  };

  const editDepartment = (dept: Department) => {
    setEditingDeptId(dept.id);
    setDeptForm({
      name: dept.name,
      code: dept.code,
      description: dept.description,
      targetWorkload: String(dept.targetWorkload),
      active: dept.active,
    });
  };

  const deleteDepartment = async (id: string) => {
    setError(null);
    const res = await apiFetch(`/api/departments/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to delete department");
      return;
    }
    if (editingDeptId === id) resetDeptForm();
    await loadDepartments();
  };

  const updateSetting = (section: TabId | "userRoles", key: string, value: unknown) => {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }));
  };

  const userRoleItems = (settings.userRoles?.items as UserRoleItem[] | undefined) ?? [];
  const activeRoles = activeUserRoles(userRoleItems, settings.userRoles?.defaultRole as string | undefined);

  const updateUserRoleItem = (index: number, patch: Partial<UserRoleItem>) => {
    const items = [...userRoleItems];
    items[index] = { ...items[index], ...patch };
    updateSetting("userRoles", "items", items);
  };

  const addUserRole = () => {
    const items = [
      ...userRoleItems,
      {
        id: crypto.randomUUID(),
        name: `Role ${userRoleItems.length + 1}`,
        description: "",
        active: true,
        userType: "standard" as UserType,
        allowSelfRegister: true,
      },
    ];
    updateSetting("userRoles", "items", items);
  };

  const removeUserRole = (index: number) => {
    if (userRoleItems.length <= 1) {
      setError("At least one application user role is required");
      return;
    }
    const removed = userRoleItems[index];
    const items = userRoleItems.filter((_, i) => i !== index);
    updateSetting("userRoles", "items", items);
    const nextDefault = defaultRoleName(items, settings.userRoles?.defaultRole as string | undefined);
    if (removed?.name === settings.userRoles?.defaultRole) {
      updateSetting("userRoles", "defaultRole", nextDefault);
    }
  };

  const resetRoleForm = () => {
    setRoleForm({ name: "", code: "", category: "clinical", description: "", active: true });
    setEditingRoleId(null);
  };

  const saveStaffRole = async () => {
    if (!roleForm.name.trim()) {
      setError("Role name is required");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch(editingRoleId ? `/api/roles/${editingRoleId}` : "/api/roles", {
        method: editingRoleId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(roleForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || `Failed to save role (${res.status})`);
        return;
      }
      resetRoleForm();
      await loadStaffRoles();
      setSuccess("Role saved successfully");
    } catch {
      setError("Failed to save role");
    } finally {
      setSaving(false);
    }
  };

  const editStaffRole = (role: StaffRole) => {
    setEditingRoleId(role.id);
    setRoleForm({
      name: role.name,
      code: role.code,
      category: role.category,
      description: role.description,
      active: role.active,
    });
  };

  const deleteStaffRole = async (id: string) => {
    setError(null);
    const res = await apiFetch(`/api/roles/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to delete role");
      return;
    }
    if (editingRoleId === id) resetRoleForm();
    await loadStaffRoles();
    setSuccess("Role deleted");
  };

  const saveUserRoles = async () => {
    const payload = writableSettingsPayload("userRoles", settings.userRoles as Record<string, unknown> | undefined);
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch("/api/settings/userRoles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to save user roles"));
        return;
      }
      const data = await res.json();
      if (data.settings) {
        setSettings((prev) => ({ ...prev, userRoles: data.settings }));
      }
      await loadPermissionConfig();
      setSuccess("User roles saved. Assign menus and permissions in the Menu & Permissions tab.");
    } catch {
      setError("Failed to save user roles");
    } finally {
      setSaving(false);
    }
  };

  const section = settings[tab] ?? {};

  const roleNames = activeRoles.map((role) => role.name).filter(Boolean);
  const menuCatalog = permissionConfig?.menus ?? MENU_ITEMS.map((m) => ({ id: m.id, label: m.label, route: m.href }));
  const actionCatalog = permissionConfig?.actions ?? ACTION_CATALOG;

  const toggleRoleMenu = (role: string, menuId: string) => {
    setPermissionConfig((prev) => {
      if (!prev) return prev;
      const roleMenus = { ...(prev.roleMenus ?? {}) };
      const current = [...(roleMenus[role] ?? [])];
      if (current.includes("*")) {
        roleMenus[role] = menuCatalog.map((m) => m.id).filter((id) => id !== menuId);
      } else if (current.includes(menuId)) {
        roleMenus[role] = current.filter((id) => id !== menuId);
      } else {
        roleMenus[role] = [...current, menuId];
      }
      return { ...prev, roleMenus };
    });
  };

  const toggleRoleAction = (role: string, action: string) => {
    setPermissionConfig((prev) => {
      if (!prev) return prev;
      const roleActions = { ...(prev.roleActions ?? {}) };
      const current = [...(roleActions[role] ?? [])];
      const allActions = actionCatalog.map((a) => a.id);
      if (current.includes("*")) {
        roleActions[role] = allActions.filter((id) => id !== action);
      } else if (current.includes(action)) {
        roleActions[role] = current.filter((a) => a !== action);
      } else {
        const next = [...current, action];
        roleActions[role] = next.length === allActions.length ? ["*"] : next;
      }
      return { ...prev, roleActions };
    });
  };

  const savePermissions = async () => {
    if (!permissionConfig) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/permissions/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleMenus: permissionConfig.roleMenus,
          roleActions: permissionConfig.roleActions,
        }),
      });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to save permissions"));
        return;
      }
      const data = await res.json();
      if (data.config) setPermissionConfig(data.config);
      setSuccess("Role permissions saved. Users must sign in again to refresh menu access.");
    } catch {
      setError("Failed to save permissions");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Configuration</h2>
        <p className="text-slate-600">
          Manage departments, organization settings, scheduling rules, and system integrations
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
              tab === id ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
      )}
      {!manageSettings && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You need the <strong>settings:manage</strong> permission to save configuration changes. You can view settings in read-only mode.
        </div>
      )}

      {tab === "departments" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 font-semibold text-slate-800">
              {editingDeptId ? "Edit department" : "Add department"}
            </h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <input
                value={deptForm.name}
                onChange={(e) => setDeptForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Department name *"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 placeholder:text-slate-500"
              />
              <input
                value={deptForm.code}
                onChange={(e) => setDeptForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="Code (e.g. ICU)"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 placeholder:text-slate-500"
              />
              <input
                value={deptForm.targetWorkload}
                onChange={(e) => setDeptForm((f) => ({ ...f, targetWorkload: e.target.value }))}
                type="number"
                min={0}
                max={100}
                placeholder="Target workload %"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 placeholder:text-slate-500"
              />
              <input
                value={deptForm.description}
                onChange={(e) => setDeptForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Description"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 placeholder:text-slate-500 md:col-span-2"
              />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={deptForm.active}
                  onChange={(e) => setDeptForm((f) => ({ ...f, active: e.target.checked }))}
                  className="rounded"
                />
                Active department
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={saveDepartment}
                disabled={saving || !manageSettings}
                className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {editingDeptId ? "Update department" : "Add department"}
              </button>
              {editingDeptId && (
                <button type="button" onClick={resetDeptForm} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 font-semibold text-slate-800">Departments ({departments.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="pb-3 pr-4">Name</th>
                    <th className="pb-3 pr-4">Code</th>
                    <th className="pb-3 pr-4">Staff</th>
                    <th className="pb-3 pr-4">Target workload</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((dept) => (
                    <tr key={dept.id} className="border-b border-slate-100">
                      <td className="py-3 pr-4 font-medium text-slate-800">{dept.name}</td>
                      <td className="py-3 pr-4 text-slate-600">{dept.code || "—"}</td>
                      <td className="py-3 pr-4 text-slate-700">{dept.staffCount}</td>
                      <td className="py-3 pr-4 text-slate-700">{dept.targetWorkload}%</td>
                      <td className="py-3 pr-4">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${dept.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                          {dept.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => editDepartment(dept)} className="text-teal-600 hover:text-teal-700">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => deleteDepartment(dept.id)} className="text-rose-600 hover:text-rose-700">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "roles" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 font-semibold text-slate-800">{editingRoleId ? "Edit workforce role" : "Add workforce role"}</h3>
            <p className="mb-4 text-sm text-slate-600">Used in staff entry, scheduling, imports, and skill mix analysis.</p>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <input value={roleForm.name} onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))} placeholder="Role name *" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 placeholder:text-slate-500" />
              <input value={roleForm.code} onChange={(e) => setRoleForm((f) => ({ ...f, code: e.target.value }))} placeholder="Code (e.g. RN)" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 placeholder:text-slate-500" />
              <select value={roleForm.category} onChange={(e) => setRoleForm((f) => ({ ...f, category: e.target.value }))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800">
                <option value="clinical">Clinical</option>
                <option value="administrative">Administrative</option>
                <option value="support">Support</option>
              </select>
              <input value={roleForm.description} onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))} placeholder="Description" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 placeholder:text-slate-500 md:col-span-2" />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={roleForm.active} onChange={(e) => setRoleForm((f) => ({ ...f, active: e.target.checked }))} className="rounded" />
                Active role
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={saveStaffRole} disabled={saving || !manageSettings} className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50">
                {editingRoleId ? "Update role" : "Add role"}
              </button>
              {editingRoleId && (
                <button type="button" onClick={resetRoleForm} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 font-semibold text-slate-800">Workforce roles ({staffRoles.length})</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="pb-3 pr-4">Name</th>
                  <th className="pb-3 pr-4">Code</th>
                  <th className="pb-3 pr-4">Category</th>
                  <th className="pb-3 pr-4">Staff</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staffRoles.map((role) => (
                  <tr key={role.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4 font-medium text-slate-800">{role.name}</td>
                    <td className="py-3 pr-4 text-slate-700">{role.code}</td>
                    <td className="py-3 pr-4 capitalize text-slate-700">{role.category}</td>
                    <td className="py-3 pr-4 text-slate-700">{role.staffCount}</td>
                    <td className="py-3 pr-4">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${role.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                        {role.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => editStaffRole(role)} className="text-teal-600 hover:text-teal-700"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => deleteStaffRole(role.id)} className="text-rose-600 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-800">Application user roles</h3>
                <p className="text-sm text-slate-600">Create roles here, then assign sidebar menus and action permissions in Menu & Permissions.</p>
              </div>
              <button
                type="button"
                onClick={addUserRole}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" /> Add role
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700">Default role for new users</label>
              <select
                value={String(settings.userRoles?.defaultRole ?? "")}
                onChange={(e) => updateSetting("userRoles", "defaultRole", e.target.value)}
                className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800"
              >
                {activeRoles.map((item) => (
                  <option key={item.id ?? item.name} value={item.name}>{item.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-3">
              {userRoleItems.map((item, index) => (
                <div key={item.id ?? `${item.name}-${index}`} className="rounded-lg border border-slate-100 p-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <input value={item.name} onChange={(e) => updateUserRoleItem(index, { name: e.target.value })} placeholder="Role name" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800" />
                    <input value={item.description ?? ""} onChange={(e) => updateUserRoleItem(index, { description: e.target.value })} placeholder="Description" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 md:col-span-2" />
                    <select value={item.userType ?? "standard"} onChange={(e) => updateUserRoleItem(index, { userType: e.target.value as UserType })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800">
                      {USER_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-700">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={item.active !== false} onChange={(e) => updateUserRoleItem(index, { active: e.target.checked })} className="rounded" />
                      Active
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={item.allowSelfRegister !== false} onChange={(e) => updateUserRoleItem(index, { allowSelfRegister: e.target.checked })} className="rounded" />
                      Allow self-registration
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={Boolean(item.requiresDepartment)} onChange={(e) => updateUserRoleItem(index, { requiresDepartment: e.target.checked })} className="rounded" />
                      Requires department
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={Boolean(item.requiresStaffRole)} onChange={(e) => updateUserRoleItem(index, { requiresStaffRole: e.target.checked })} className="rounded" />
                      Requires staff role
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={Boolean(item.requiresWorkloadTarget)} onChange={(e) => updateUserRoleItem(index, { requiresWorkloadTarget: e.target.checked })} className="rounded" />
                      Requires workload target
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={Boolean(item.requiresStaffLink)} onChange={(e) => updateUserRoleItem(index, { requiresStaffLink: e.target.checked })} className="rounded" />
                      Link to scheduling staff
                    </label>
                    {userRoleItems.length > 1 && (
                      <button type="button" onClick={() => removeUserRole(index)} className="ml-auto text-sm text-rose-600 hover:text-rose-700">
                        Remove role
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={saveUserRoles} disabled={saving || settingsLoading || !manageSettings} className="mt-4 rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50">
              Save user roles
            </button>
          </div>
        </div>
      )}

      {tab === "permissions" && (
        <div className="space-y-6">
          {!manageSettings ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              You need settings management permission to edit role menus.
            </div>
          ) : permissionLoading ? (
            <p className="text-sm text-slate-500">Loading permission matrix…</p>
          ) : (
            <>
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-2 font-semibold text-slate-800">Sidebar menu access by role</h3>
                <p className="mb-4 text-sm text-slate-600">
                  Controls which modules appear in the sidebar and which routes users can open.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-600">
                        <th className="pb-2 pr-4">Menu</th>
                        {roleNames.map((role) => (
                          <th key={role} className="pb-2 px-2 text-center">{role}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {menuCatalog.map((menu) => (
                        <tr key={menu.id} className="border-b border-slate-100">
                          <td className="py-2 pr-4 font-medium text-slate-800">{menu.label}</td>
                          {roleNames.map((role) => {
                            const allowed = permissionConfig?.roleMenus?.[role] ?? [];
                            const checked = allowed.includes("*") || allowed.includes(menu.id);
                            return (
                              <td key={role} className="py-2 px-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleRoleMenu(role, menu.id)}
                                  disabled={!manageSettings}
                                  className="rounded"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 font-semibold text-slate-800">Action permissions</h3>
                <p className="mb-4 text-sm text-slate-600">
                  Assign operational capabilities to any role. Users must sign in again after changes.
                </p>
                <div className="space-y-4">
                  {actionCatalog.map((action) => (
                    <div key={action.id} className="rounded-lg border border-slate-100 p-3">
                      <div className="mb-2">
                        <span className="font-medium text-slate-800">{action.label}</span>
                        <span className="ml-2 text-xs text-slate-500">{action.id}</span>
                        <p className="text-sm text-slate-600">{action.description}</p>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        {roleNames.map((role) => {
                          const allowed = permissionConfig?.roleActions?.[role] ?? [];
                          const checked = allowed.includes("*") || allowed.includes(action.id);
                          return (
                            <label key={role} className="flex items-center gap-1 text-sm text-slate-600">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleRoleAction(role, action.id)}
                                disabled={!manageSettings}
                                className="rounded"
                              />
                              {role}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={savePermissions}
                  disabled={saving || !manageSettings}
                  className="mt-4 rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
                >
                  Save permissions
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {settingsLoading && tab !== "departments" && tab !== "roles" && tab !== "permissions" && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Loading settings from server…
        </div>
      )}

      {tab === "organization" && (
        <SettingsPanel title="Organization" description="Used on login, registration, and reports. Changing the name updates new user signups immediately.">
          <Field label="Hospital / organization name" hint="Shown on login and assigned to new registrations" value={String(section.name ?? "")} onChange={(v) => updateSetting("organization", "name", v)} />
          <SelectField label="Timezone" value={String(section.timezone ?? TIMEZONE_OPTIONS[0])} options={TIMEZONE_OPTIONS.map((z) => ({ value: z, label: z }))} onChange={(v) => updateSetting("organization", "timezone", v)} />
          <Field label="Fiscal year start (MM-DD)" hint="Format: 01-01 for January 1" value={String(section.fiscalYearStart ?? "")} onChange={(v) => updateSetting("organization", "fiscalYearStart", v)} />
          <SelectField label="Locale" value={String(section.locale ?? "en-US")} options={LOCALE_OPTIONS} onChange={(v) => updateSetting("organization", "locale", v)} />
        </SettingsPanel>
      )}

      {tab === "scheduling" && (
        <SettingsPanel title="Scheduling rules" description="Applied by the Scheduling module, compliance checks, and shift import templates.">
          <NumberField label="Max hours per week" hint="Compliance and conflict detection" min={1} max={168} value={Number(section.maxHoursPerWeek ?? 48)} onChange={(v) => updateSetting("scheduling", "maxHoursPerWeek", v)} />
          <NumberField label="Rest between shifts (hours)" hint="Minimum rest period between consecutive shifts" min={0} max={48} value={Number(section.restBetweenShifts ?? 12)} onChange={(v) => updateSetting("scheduling", "restBetweenShifts", v)} />
          <NumberField label="Target shifts per day" min={1} max={24} value={Number(section.targetShiftsPerDay ?? 8)} onChange={(v) => updateSetting("scheduling", "targetShiftsPerDay", v)} />
          <NumberField label="Min staff per shift" min={1} max={50} value={Number(section.minStaffPerShift ?? 2)} onChange={(v) => updateSetting("scheduling", "minStaffPerShift", v)} />
          <CommaSeparatedField
            label="Shift types (comma-separated)"
            hint="Used in scheduling preferences and CSV shift imports"
            value={Array.isArray(section.shiftTypes) ? section.shiftTypes.map(String) : ["Day", "Evening", "Night"]}
            onChange={(items) => updateSetting("scheduling", "shiftTypes", items)}
          />
          <Toggle label="Respect staff preferences" checked={Boolean(section.respectPreferences ?? true)} onChange={(v) => updateSetting("scheduling", "respectPreferences", v)} />
          <Toggle label="Require skill mix on shifts" checked={Boolean(section.skillMixRequired ?? true)} onChange={(v) => updateSetting("scheduling", "skillMixRequired", v)} />
          <div className="md:col-span-2 space-y-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-700">Department certification requirements</p>
            <p className="text-xs text-slate-500">
              Comma-separated certification names from Configuration → Skills → Certification catalog. Used for gap analysis, skill matrix, and scheduling skill-mix checks.
            </p>
            {departments.filter((d) => d.active).map((dept) => {
              const reqs = (section.departmentSkillRequirements as Record<string, string[]> | undefined) ?? {};
              return (
                <CommaSeparatedField
                  key={dept.id}
                  label={dept.name}
                  value={Array.isArray(reqs[dept.name]) ? reqs[dept.name].map(String) : []}
                  placeholder="Leave empty if no requirements"
                  hint="Must match names in Skills → Certification catalog"
                  onChange={(items) => {
                    const next = { ...(section.departmentSkillRequirements as Record<string, string[]> | undefined) };
                    if (items.length > 0) next[dept.name] = items;
                    else delete next[dept.name];
                    updateSetting("scheduling", "departmentSkillRequirements", next);
                  }}
                />
              );
            })}
          </div>
          <div className="md:col-span-2 space-y-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-700">Shift certification requirements</p>
            <p className="text-xs text-slate-500">
              Optional extra certifications required for specific shift types (names must match the Skills certification catalog).
            </p>
            {(Array.isArray(section.shiftTypes) ? section.shiftTypes : ["Day", "Evening", "Night"]).map((shift) => {
              const shiftName = String(shift);
              const reqs = (section.shiftSkillRequirements as Record<string, string[]> | undefined) ?? {};
              return (
                <CommaSeparatedField
                  key={shiftName}
                  label={shiftName}
                  value={Array.isArray(reqs[shiftName]) ? reqs[shiftName].map(String) : []}
                  placeholder="Leave empty if no extra requirements"
                  hint="Must match names in Skills → Certification catalog"
                  onChange={(items) => {
                    const next = { ...(section.shiftSkillRequirements as Record<string, string[]> | undefined) };
                    if (items.length > 0) next[shiftName] = items;
                    else delete next[shiftName];
                    updateSetting("scheduling", "shiftSkillRequirements", next);
                  }}
                />
              );
            })}
          </div>
        </SettingsPanel>
      )}

      {tab === "workload" && (
        <SettingsPanel title="Workload thresholds" description="Drives workload charts, wellness alerts, and department default targets.">
          <NumberField label="Nurse-to-patient ratio target" step={0.1} min={0.1} value={Number(section.nursePatientRatioTarget ?? 1.5)} onChange={(v) => updateSetting("workload", "nursePatientRatioTarget", v)} />
          <NumberField label="Workload alert threshold (%)" min={1} max={100} value={Number(section.alertThreshold ?? 85)} onChange={(v) => updateSetting("workload", "alertThreshold", v)} />
          <NumberField label="Overtime warning (hours/week)" min={1} max={80} value={Number(section.overtimeWarningHours ?? 10)} onChange={(v) => updateSetting("workload", "overtimeWarningHours", v)} />
          <NumberField label="Peak hours start (0-23)" min={0} max={23} value={Number(section.peakHourStart ?? 8)} onChange={(v) => updateSetting("workload", "peakHourStart", v)} />
          <NumberField label="Peak hours end (0-23)" min={0} max={23} value={Number(section.peakHourEnd ?? 18)} onChange={(v) => updateSetting("workload", "peakHourEnd", v)} />
        </SettingsPanel>
      )}

      {tab === "inventory" && (
        <SettingsPanel title="Inventory thresholds" description="Controls critical utilization alerts, reorder defaults, and procurement automation on the Resources page.">
          <NumberField label="Critical utilization (%)" min={50} max={100} value={Number(section.criticalUtilizationPercent ?? 90)} onChange={(v) => updateSetting("inventory", "criticalUtilizationPercent", v)} />
          <NumberField label="Default reorder level" min={0} max={1000} value={Number(section.defaultReorderLevel ?? 5)} onChange={(v) => updateSetting("inventory", "defaultReorderLevel", v)} />
          <NumberField label="Procurement lead time (days)" min={1} max={90} value={Number(section.procurementLeadTimeDays ?? 7)} onChange={(v) => updateSetting("inventory", "procurementLeadTimeDays", v)} />
          <Toggle label="Enable auto-procurement suggestions" checked={Boolean(section.autoProcurementEnabled ?? true)} onChange={(v) => updateSetting("inventory", "autoProcurementEnabled", v)} />
          <Toggle label="Low-stock notifications" checked={Boolean(section.lowStockNotifications ?? true)} onChange={(v) => updateSetting("inventory", "lowStockNotifications", v)} />
          <CommaSeparatedField
            label="Bed KPI resource types (comma-separated)"
            hint="Resource types counted in Total Beds / Occupancy on the Resources overview"
            value={Array.isArray(section.bedKpiTypes) ? section.bedKpiTypes.map(String) : ["Facility"]}
            onChange={(items) => updateSetting("inventory", "bedKpiTypes", items)}
          />
          <CommaSeparatedField
            label="Bed KPI SKU prefixes (comma-separated)"
            hint="e.g. BED- matches ICU Beds (BED-ICU). Checked before name keywords."
            value={Array.isArray(section.bedKpiSkuPrefixes) ? section.bedKpiSkuPrefixes.map(String) : ["BED-"]}
            onChange={(items) => updateSetting("inventory", "bedKpiSkuPrefixes", items)}
          />
          <CommaSeparatedField
            label="Bed KPI name keywords (comma-separated)"
            hint="Fallback match when SKU prefix does not apply"
            value={Array.isArray(section.bedKpiNameKeywords) ? section.bedKpiNameKeywords.map(String) : ["Bed"]}
            onChange={(items) => updateSetting("inventory", "bedKpiNameKeywords", items)}
          />
        </SettingsPanel>
      )}

      {tab === "skills" && (
        <SettingsPanel title="Skills & competency" description="Define certification types here first, then assign department/shift requirements under Scheduling.">
          <NumberField label="Expiry warning (days)" min={7} max={180} value={Number(section.expiryWarningDays ?? 30)} onChange={(v) => updateSetting("skills", "expiryWarningDays", v)} />
          <Toggle label="AI training prioritization" checked={Boolean(section.autoTrainingAlerts ?? true)} onChange={(v) => updateSetting("skills", "autoTrainingAlerts", v)} />
          <CommaSeparatedField
            label="Certification catalog (comma-separated)"
            hint='Required master list of certification types. Use quotes for names with commas, e.g. "Advanced Care, Level 2". Save here before setting Scheduling requirements.'
            value={Array.isArray(section.certCatalog) ? section.certCatalog.map(String) : []}
            placeholder="e.g. BLS, ACLS, PALS, RN License"
            onChange={(items) => updateSetting("skills", "certCatalog", items)}
          />
        </SettingsPanel>
      )}

      {tab === "wellness" && (
        <SettingsPanel title="Wellness & surveys" description="Intervention types, survey questions, and shift hour assumptions for overtime calculations.">
          <CommaSeparatedField
            label="Intervention types (comma-separated)"
            value={Array.isArray(section.interventionTypes) ? section.interventionTypes.map(String) : []}
            onChange={(items) => updateSetting("wellness", "interventionTypes", items)}
          />
          <NumberField label="Day shift hours" min={4} max={16} value={Number((section.shiftHours as Record<string, number> | undefined)?.day ?? 8)} onChange={(v) => updateSetting("wellness", "shiftHours", { ...(section.shiftHours as Record<string, number> | undefined), day: v })} />
          <NumberField label="Evening shift hours" min={4} max={16} value={Number((section.shiftHours as Record<string, number> | undefined)?.evening ?? 8)} onChange={(v) => updateSetting("wellness", "shiftHours", { ...(section.shiftHours as Record<string, number> | undefined), evening: v })} />
          <NumberField label="Night shift hours" min={4} max={16} value={Number((section.shiftHours as Record<string, number> | undefined)?.night ?? 10)} onChange={(v) => updateSetting("wellness", "shiftHours", { ...(section.shiftHours as Record<string, number> | undefined), night: v })} />
          <div className="md:col-span-2 space-y-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-700">Staff satisfaction survey questions</p>
                <p className="text-xs text-slate-500">Scale = 1–5 rating. Number = numeric input (used for overtime when present).</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const current = surveyQuestionsFromSection(section);
                  const nextId = `q${current.length + 1}`;
                  updateSetting("wellness", "surveyQuestions", [
                    ...current,
                    { id: nextId, text: "New question", type: "scale" as const },
                  ]);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" /> Add question
              </button>
            </div>
            {surveyQuestionsFromSection(section).map((q, index) => (
              <div key={`${q.id}-${index}`} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-12">
                <div className="md:col-span-2">
                  <Field
                    label="ID"
                    value={q.id}
                    onChange={(v) => {
                      const current = surveyQuestionsFromSection(section);
                      const next = [...current];
                      next[index] = { ...next[index], id: v };
                      updateSetting("wellness", "surveyQuestions", next);
                    }}
                  />
                </div>
                <div className="md:col-span-6">
                  <Field
                    label="Question text"
                    value={q.text}
                    onChange={(v) => {
                      const current = surveyQuestionsFromSection(section);
                      const next = [...current];
                      next[index] = { ...next[index], text: v };
                      updateSetting("wellness", "surveyQuestions", next);
                    }}
                  />
                </div>
                <div className="md:col-span-3">
                  <SelectField
                    label="Type"
                    value={q.type}
                    options={[
                      { value: "scale", label: "Scale (1–5)" },
                      { value: "number", label: "Number" },
                    ]}
                    onChange={(v) => {
                      const current = surveyQuestionsFromSection(section);
                      const next = [...current];
                      next[index] = { ...next[index], type: v === "number" ? "number" : "scale" };
                      updateSetting("wellness", "surveyQuestions", next);
                    }}
                  />
                </div>
                <div className="flex items-end md:col-span-1">
                  <button
                    type="button"
                    disabled={surveyQuestionsFromSection(section).length <= 1}
                    onClick={() => {
                      const current = surveyQuestionsFromSection(section);
                      updateSetting("wellness", "surveyQuestions", current.filter((_, i) => i !== index));
                    }}
                    className="rounded p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                    title="Remove question"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SettingsPanel>
      )}

      {tab === "ai" && (
        <SettingsPanel title="AI & predictions" description="Controls forecast horizon and automatic model retraining on the AI Prediction page.">
          <NumberField label="Forecast horizon (days)" min={7} max={365} value={Number(section.forecastHorizonDays ?? 30)} onChange={(v) => updateSetting("ai", "forecastHorizonDays", v)} />
          <NumberField label="Minimum training records" min={8} value={Number(section.minTrainingRecords ?? 24)} onChange={(v) => updateSetting("ai", "minTrainingRecords", v)} />
          <SelectField
            label="Model complexity"
            value={String(section.modelComplexity ?? "auto")}
            options={[
              { value: "auto", label: "Auto (ensemble when enough data)" },
              { value: "ensemble", label: "Ensemble (Ridge + GBM)" },
              { value: "ridge", label: "Ridge only" },
            ]}
            onChange={(v) => updateSetting("ai", "modelComplexity", v)}
          />
          <SelectField label="Auto-retrain day of week" value={String(section.autoRetrainDayOfWeek ?? "Sunday")} options={RETRAIN_DAY_OPTIONS.map((d) => ({ value: d, label: d }))} onChange={(v) => updateSetting("ai", "autoRetrainDayOfWeek", v)} />
          <Toggle label="Enable automatic retraining" checked={Boolean(section.autoRetrainEnabled ?? false)} onChange={(v) => updateSetting("ai", "autoRetrainEnabled", v)} />
        </SettingsPanel>
      )}

      {tab === "integrations" && (
        <SettingsPanel title="System integrations" description="HIS and HR connections are verified with a live health check. Save settings, then use Test connections.">
          <Field label="HIS endpoint URL" hint="e.g. https://his.hospital.org/api/health" value={String(section.hisUrl ?? "")} onChange={(v) => updateSetting("integrations", "hisUrl", v)} />
          <Field label="HR system URL" hint="e.g. https://hr.hospital.org/api/health" value={String(section.hrUrl ?? "")} onChange={(v) => updateSetting("integrations", "hrUrl", v)} />
          <SelectField label="Sync frequency" value={String(section.syncFrequency ?? "daily")} options={SYNC_FREQUENCY_OPTIONS.map((f) => ({ value: f, label: f.charAt(0).toUpperCase() + f.slice(1) }))} onChange={(v) => updateSetting("integrations", "syncFrequency", v)} />
          <Field label="Sync time (UTC)" hint="24-hour format, e.g. 02:00" value={String(section.syncTimeUtc ?? "02:00")} onChange={(v) => updateSetting("integrations", "syncTimeUtc", v)} />
          <Toggle label="HIS integration enabled" checked={Boolean(section.hisEnabled ?? false)} onChange={(v) => updateSetting("integrations", "hisEnabled", v)} />
          <Toggle label="HR integration enabled" checked={Boolean(section.hrEnabled ?? false)} onChange={(v) => updateSetting("integrations", "hrEnabled", v)} />
          <div className="md:col-span-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={testIntegrations}
              disabled={testingIntegrations || saving}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {testingIntegrations ? "Testing connections…" : "Test connections"}
            </button>
          </div>
          {integrationTest && (
            <div className="md:col-span-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              {(["his", "hr"] as const).map((key) => {
                const result = integrationTest[key];
                if (!result) return null;
                return (
                  <div key={key}>
                    <span className="font-medium text-slate-800">{key === "his" ? "HIS" : "HR"}: </span>
                    <span className="text-slate-600">{result.statusLabel || result.status}</span>
                    {result.message && <p className="text-xs text-slate-500">{result.message}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </SettingsPanel>
      )}

      {tab === "notifications" && (
        <SettingsPanel title="Notification preferences" description="Email and in-app alert toggles for workforce events.">
          <Toggle label="Email alerts enabled" checked={Boolean(section.emailAlerts ?? true)} onChange={(v) => updateSetting("notifications", "emailAlerts", v)} />
          <Toggle label="Schedule change notifications" checked={Boolean(section.scheduleChanges ?? true)} onChange={(v) => updateSetting("notifications", "scheduleChanges", v)} />
          <Toggle label="Wellness risk alerts" checked={Boolean(section.wellnessAlerts ?? true)} onChange={(v) => updateSetting("notifications", "wellnessAlerts", v)} />
          <Toggle label="Compliance reminders" checked={Boolean(section.complianceReminders ?? true)} onChange={(v) => updateSetting("notifications", "complianceReminders", v)} />
        </SettingsPanel>
      )}

      {tab === "data" && (
        <SettingsPanel title="Data retention & security" description="Writable policy settings. Integration status below is read-only and computed from live checks.">
          <NumberField label="Retention period (years)" min={1} max={30} value={Number(section.retentionYears ?? 7)} onChange={(v) => updateSetting("data", "retentionYears", v)} />
          <SelectField label="Backup frequency" value={String(section.backupFrequency ?? "daily")} options={BACKUP_FREQUENCY_OPTIONS.map((f) => ({ value: f, label: f.charAt(0).toUpperCase() + f.slice(1) }))} onChange={(v) => updateSetting("data", "backupFrequency", v)} />
          <Field label="Encryption standard" value={String(section.encryption ?? "AES-256")} onChange={(v) => updateSetting("data", "encryption", v)} />
          <Toggle label="Data anonymization enabled" checked={Boolean(section.anonymization ?? true)} onChange={(v) => updateSetting("data", "anonymization", v)} />
          {typeof section.quality === "object" && section.quality !== null ? (
            <div className="md:col-span-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-700">Read-only data quality (computed)</p>
              <p className="mt-1">
                {String((section.quality as Record<string, unknown>).completeness ?? 0)}% complete,{" "}
                {String((section.quality as Record<string, unknown>).accuracy ?? 0)}% accurate
              </p>
              {section.hisStatusLabel != null && (
                <p className="mt-1">HIS: {String(section.hisStatusLabel)} — {String(section.hisMessage ?? "")}</p>
              )}
            </div>
          ) : null}
        </SettingsPanel>
      )}

      {tab !== "departments" && tab !== "roles" && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => saveSection(tab)}
            disabled={saving || settingsLoading || !manageSettings}
            className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      )}
    </div>
  );
}

function SettingsPanel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="font-semibold text-slate-800">{title}</h3>
      {description && <p className="mt-1 mb-4 text-sm text-slate-600">{description}</p>}
      {!description && <div className="mb-4" />}
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, hint, placeholder }: { label: string; value: string; onChange: (v: string) => void; hint?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 placeholder:text-slate-500" />
    </label>
  );
}

function SelectField({ label, value, options, onChange, hint }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800">
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function NumberField({ label, value, onChange, step = 1, min, max, hint }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; hint?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800"
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded" />
      {label}
    </label>
  );
}
