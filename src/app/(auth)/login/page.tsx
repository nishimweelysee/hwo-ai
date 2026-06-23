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

  useEffect(() => {
    fetchRegistrationConfig().then(setConfig);
  }, []);

  const orgName = config?.organization?.name || "Health Workforce Optimizer";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const ok = await login(email, password);
      if (ok) {
        router.push(callbackUrl);
        router.refresh();
      } else {
        setError("Invalid email or password");
      }
    } catch {
      setError("Login failed");
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
          <h1 className="text-xl font-bold text-white">{orgName}</h1>
          <p className="text-sm text-slate-400">Health Workforce Optimization</p>
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
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="analyst@hospital.org"
            className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            required
          />
        </div>
        {(config?.departments?.length ?? 0) > 0 && (
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              Department (optional)
            </label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-white focus:border-teal-500 focus:outline-none"
            >
              <option value="" className="bg-slate-800">All departments</option>
              {config?.departments.map((d) => (
                <option key={d.id} value={d.id} className="bg-slate-800">
                  {d.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">For your reference — sign-in uses your account credentials.</p>
          </div>
        )}
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            required
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-slate-400">
            <input type="checkbox" className="rounded border-slate-600" />
            Remember me
          </label>
          <a href="/forgot-password" className="text-teal-400 hover:text-teal-300">
            Forgot password?
          </a>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-teal-500 py-3 font-semibold text-white transition-colors hover:bg-teal-600 disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Don&apos;t have an account?{" "}
        <a href="/register" className="text-teal-400 hover:text-teal-300">
          Register
        </a>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="rounded-2xl border border-slate-700/50 bg-slate-800/80 p-8 animate-pulse">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
