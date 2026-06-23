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
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "",
    departmentId: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchRegistrationConfig().then((c) => {
      setConfig(c);
      if (c) {
        const roles = activeUserRoles(c);
        setForm((f) => ({
          ...f,
          role: defaultRoleName(roles, c.userRoles?.defaultRole) || roles[0]?.name || "",
        }));
      }
    });
  }, []);

  const roles = activeUserRoles(config);
  const orgName = config?.organization?.name || "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const ok = await register({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        departmentId: form.departmentId || undefined,
      });
      if (ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setError("Registration failed");
      }
    } catch {
      setError("Registration failed");
    }
    setLoading(false);
  };

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/80 p-8 shadow-2xl backdrop-blur">
      <div className="mb-8 flex items-center justify-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500 text-white">
          <BarChart3 className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Create Account</h1>
          <p className="text-sm text-slate-400">
            {orgName ? orgName : "Health Workforce Optimizer"}
          </p>
        </div>
      </div>
      {error && (
        <div className="mb-4 rounded-lg bg-rose-500/20 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">
            Full Name
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Dr. Jane Smith"
            className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
            required
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">
            Email
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="jane@hospital.org"
            className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
            required
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">
            Role
          </label>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-white focus:border-teal-500 focus:outline-none"
            required
          >
            {roles.length === 0 && <option value="">Loading roles…</option>}
            {roles.map((r) => (
              <option key={r.name} value={r.name} className="bg-slate-800">
                {r.name}
              </option>
            ))}
          </select>
          {roles.find((r) => r.name === form.role)?.description && (
            <p className="mt-1 text-xs text-slate-500">
              {roles.find((r) => r.name === form.role)?.description}
            </p>
          )}
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">
            Organization
          </label>
          <input
            type="text"
            value={orgName}
            readOnly
            className="w-full cursor-not-allowed rounded-lg border border-slate-600 bg-slate-800/80 px-4 py-3 text-slate-300"
          />
          <p className="mt-1 text-xs text-slate-500">
            Set in Configuration → Organization. New accounts are assigned to this organization.
          </p>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">
            Department (optional)
          </label>
          <select
            value={form.departmentId}
            onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
            className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-white focus:border-teal-500 focus:outline-none"
          >
            <option value="" className="bg-slate-800">Select department</option>
            {(config?.departments || []).map((d) => (
              <option key={d.id} value={d.id} className="bg-slate-800">
                {d.name}{d.code ? ` (${d.code})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">
            Password
          </label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="••••••••"
            minLength={8}
            className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
            required
          />
          <p className="mt-1 text-xs text-slate-500">Minimum 8 characters</p>
        </div>
        <button
          type="submit"
          disabled={loading || !form.role}
          className="w-full rounded-lg bg-teal-500 py-3 font-semibold text-white transition-colors hover:bg-teal-600 disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Register"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <a href="/login" className="text-teal-400 hover:text-teal-300">
          Sign in
        </a>
      </p>
      <p className="mt-2 text-center text-xs text-slate-500">
        <a href="/verify-email" className="text-teal-400 hover:text-teal-300">
          Verify your email
        </a>
      </p>
    </div>
  );
}
