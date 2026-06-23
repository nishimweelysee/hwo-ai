"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, parseApiError } from "@/lib/api";
import { loadDepartments } from "@/lib/workforce-catalog";
import { User, Mail, Building2, Shield } from "lucide-react";

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<{
    name?: string;
    email?: string;
    organization?: string;
    role?: string;
    phone?: string;
    department?: string;
    mfaEnabled?: boolean;
    profile?: { phone?: string; department?: string };
  } | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", department: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/profile")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          setProfile(d);
          setForm({
            name: d.name || "",
            phone: d.phone || d.profile?.phone || "",
            department: d.department || d.profile?.department || "",
            password: "",
          });
        }
      });
    loadDepartments().then(setDepartments);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, string> = {
        name: form.name,
        phone: form.phone,
        department: form.department,
      };
      if (form.password.trim()) payload.password = form.password;
      const res = await apiFetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to save profile"));
        return;
      }
      setProfile((p) => (p ? { ...p, name: form.name, phone: form.phone, department: form.department } : null));
      setEditing(false);
      setForm((f) => ({ ...f, password: "" }));
      setSuccess("Profile saved successfully");
    } catch {
      setError("Failed to save profile — check that the backend is running");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Profile</h2>
        <p className="text-slate-600">Manage your account and preferences</p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-teal-100 text-teal-600">
              <User className="h-10 w-10" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-slate-800">
                {profile?.name || user?.name || "User"}
              </h3>
              <div className="flex items-center gap-2 text-slate-600">
                <Mail className="h-4 w-4" />
                {profile?.email || user?.email}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Building2 className="h-4 w-4" />
                {profile?.organization || user?.organization || "—"}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Shield className="h-4 w-4" />
                {profile?.role || user?.role || "—"}
              </div>
            </div>
          </div>
          <button
            onClick={() => setEditing(!editing)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {editing ? "Cancel" : "Edit profile"}
          </button>
        </div>

        {editing && (
          <div className="mt-6 space-y-4 border-t border-slate-200 pt-6">
            <div>
              <label className="block text-sm font-medium text-slate-700">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="mt-1 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Department</label>
              <select
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                className="mt-1 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="">Select department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
                {form.department && !departments.some((d) => d.name === form.department) && (
                  <option value={form.department}>{form.department}</option>
                )}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">New password (optional)</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Leave blank to keep current"
                className="mt-1 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-800">Security</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
            <div>
              <p className="font-medium text-slate-800">Multi-factor authentication</p>
              <p className="text-sm text-slate-500">
                {profile?.mfaEnabled ? "Enabled" : "Add an extra layer of security"}
              </p>
            </div>
            <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {profile?.mfaEnabled ? "Manage MFA" : "Enable MFA"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-800">Recent activity</h3>
        <ActivityList />
      </div>
    </div>
  );
}

function ActivityList() {
  const [activities, setActivities] = useState<{ action: string; details?: string; createdAt?: string; timestamp?: string }[]>([]);
  useEffect(() => {
    apiFetch("/api/user-activity?limit=10")
      .then((r) => r.ok ? r.json() : [])
      .then(setActivities);
  }, []);
  if (activities.length === 0) {
    return <p className="text-sm text-slate-500">No recent activity</p>;
  }
  return (
    <div className="space-y-2">
      {activities.map((a, i) => (
        <div key={i} className="flex justify-between rounded-lg border border-slate-100 p-2 text-sm">
          <span className="text-slate-700">{a.action}</span>
          <span className="text-slate-500">{new Date(a.createdAt || a.timestamp || "").toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
