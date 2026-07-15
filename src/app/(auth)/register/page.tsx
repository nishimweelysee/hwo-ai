"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { activeUserRoles, fetchRegistrationConfig, type RegistrationConfig } from "@/lib/registration-config";
import { defaultRoleName } from "@/lib/user-roles";
import { BarChart3 } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [config, setConfig] = useState<RegistrationConfig | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "", departmentId: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchRegistrationConfig().then((c) => {
      setConfig(c);
      if (c) {
        const roles = activeUserRoles(c);
        setForm((f) => ({ ...f, role: defaultRoleName(roles, c.userRoles?.defaultRole) || roles[0]?.name || "" }));
      }
    });
  }, []);

  const roles = activeUserRoles(config);
  const orgName = config?.organization?.name || "Health Workforce Optimizer";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Client-side password strength check
    if (form.password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (!/[A-Z]/.test(form.password)) { setError("Password must contain at least one uppercase letter"); return; }
    if (!/[0-9]/.test(form.password)) { setError("Password must contain at least one number"); return; }

    setLoading(true);
    try {
      const ok = await register({ name: form.name, email: form.email, password: form.password, role: form.role, departmentId: form.departmentId || undefined });
      if (ok) {
        // Redirect to verify-email so new users verify their account
        router.push(`/verify-email?email=${encodeURIComponent(form.email)}&new=1`);
      } else setError("Registration failed. Please try again.");
    } catch { setError("Registration failed."); }
    setLoading(false);
  };

  const inputCls = "w-full rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500";

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/80 p-6 shadow-2xl backdrop-blur">
      {/* Header */}
      <div className="mb-4 flex items-center justify-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500">
          <BarChart3 className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white">Create Account</h1>
          <p className="text-xs text-slate-400">{orgName}</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="mb-3 rounded-lg bg-rose-500/20 px-3 py-2 text-xs text-rose-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        {/* Two-column: Name + Email */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="name" className="mb-1 block text-xs font-medium text-slate-300">Full Name</label>
            <input
              id="name" type="text" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Dr. Jane Smith" className={inputCls}
              required aria-required="true" autoComplete="name"
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-300">Email</label>
            <input
              id="email" type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="jane@hospital.org" className={inputCls}
              required aria-required="true" autoComplete="email"
            />
          </div>
        </div>

        {/* Two-column: Role + Department */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="role" className="mb-1 block text-xs font-medium text-slate-300">Role</label>
            <select
              id="role" value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className={inputCls} required aria-required="true"
            >
              {roles.length === 0 && <option value="">Loading…</option>}
              {roles.map((r) => (
                <option key={r.name} value={r.name} className="bg-slate-800">{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="department" className="mb-1 block text-xs font-medium text-slate-300">
              Department <span className="text-slate-500">(optional)</span>
            </label>
            <select
              id="department" value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
              className={inputCls}
            >
              <option value="" className="bg-slate-800">Select…</option>
              {(config?.departments || []).map((d) => (
                <option key={d.id} value={d.id} className="bg-slate-800">
                  {d.name}{d.code ? ` (${d.code})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Organisation (read-only) */}
        <div>
          <label htmlFor="org" className="mb-1 block text-xs font-medium text-slate-300">Organisation</label>
          <input
            id="org" type="text" value={orgName} readOnly
            className="w-full cursor-not-allowed rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 text-sm text-slate-400"
            aria-readonly="true"
          />
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-medium text-slate-300">Password</label>
          <input
            id="password" type="password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Min. 8 chars, 1 uppercase, 1 number" minLength={8}
            className={inputCls} required aria-required="true" autoComplete="new-password"
          />
          {/* Strength indicators */}
          {form.password.length > 0 && (
            <div className="mt-1.5 flex gap-1.5 text-xs">
              <span className={form.password.length >= 8 ? "text-emerald-400" : "text-slate-500"}>✓ 8+ chars</span>
              <span className={/[A-Z]/.test(form.password) ? "text-emerald-400" : "text-slate-500"}>✓ Uppercase</span>
              <span className={/[0-9]/.test(form.password) ? "text-emerald-400" : "text-slate-500"}>✓ Number</span>
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !form.role}
          className="w-full rounded-lg bg-teal-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50"
        >
          {loading ? "Creating account…" : "Register"}
        </button>
      </form>

      <p className="mt-3 text-center text-xs text-slate-500">
        Already have an account?{" "}
        <a href="/login" className="text-teal-400 hover:text-teal-300 focus:outline-none focus:underline">Sign in</a>
        {" · "}
        <a href="/verify-email" className="text-teal-400 hover:text-teal-300 focus:outline-none focus:underline">Verify email</a>
      </p>
    </div>
  );
}
