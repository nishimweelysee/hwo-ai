"use client";

import { Suspense, useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchRegistrationConfig, type RegistrationConfig } from "@/lib/registration-config";
import { BarChart3 } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [config, setConfig] = useState<RegistrationConfig | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchRegistrationConfig().then(setConfig); }, []);

  const orgName = config?.organization?.name || "Health Workforce Optimizer";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const ok = await login(email, password);
      if (ok) { router.push(callbackUrl); router.refresh(); }
      else setError("Invalid email or password");
    } catch { setError("Login failed"); }
    setLoading(false);
  };

  const inputCls = "w-full rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500";

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/80 p-6 shadow-2xl backdrop-blur">
      {/* Header */}
      <div className="mb-5 flex items-center justify-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500">
          <BarChart3 className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white">{orgName}</h1>
          <p className="text-xs text-slate-400">Health Workforce Optimization</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="mb-3 rounded-lg bg-rose-500/20 px-3 py-2 text-xs text-rose-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        {/* Email */}
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-300">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="analyst@hospital.org"
            className={inputCls}
            required
            aria-required="true"
            autoComplete="email"
          />
        </div>

        {/* Department (conditional) */}
        {(config?.departments?.length ?? 0) > 0 && (
          <div>
            <label htmlFor="department" className="mb-1 block text-xs font-medium text-slate-300">
              Department <span className="text-slate-500">(optional)</span>
            </label>
            <select
              id="department"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className={inputCls}
            >
              <option value="" className="bg-slate-800">All departments</option>
              {config?.departments.map((d) => (
                <option key={d.id} value={d.id} className="bg-slate-800">{d.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Password */}
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-medium text-slate-300">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className={inputCls}
            required
            aria-required="true"
            autoComplete="current-password"
          />
        </div>

        {/* Remember / Forgot */}
        <div className="flex items-center justify-between text-xs">
          <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer">
            <input type="checkbox" className="rounded border-slate-600" />
            Remember me
          </label>
          <a href="/forgot-password" className="text-teal-400 hover:text-teal-300 focus:outline-none focus:underline">
            Forgot password?
          </a>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-teal-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-slate-500">
        Don&apos;t have an account?{" "}
        <a href="/register" className="text-teal-400 hover:text-teal-300 focus:outline-none focus:underline">
          Register
        </a>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="rounded-2xl border border-slate-700/50 bg-slate-800/80 p-6 animate-pulse text-slate-400 text-sm text-center">
        Loading…
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
