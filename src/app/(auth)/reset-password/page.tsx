"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BarChart3, Eye, EyeOff } from "lucide-react";

function ResetPasswordForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const email        = searchParams.get("email") || "";
  const code         = searchParams.get("code")  || "";

  const [password,    setPassword]    = useState("");
  const [confirm,     setConfirm]     = useState("");
  const [showPass,    setShowPass]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error,       setError]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [success,     setSuccess]     = useState(false);

  if (!email || !code) {
    return (
      <div className="space-y-4">
        <div role="alert" className="rounded-lg bg-rose-500/20 p-3 text-sm text-rose-300">
          Invalid or expired reset link. Please request a new code.
        </div>
        <a
          href="/forgot-password"
          className="block w-full rounded-lg bg-teal-500 py-3 text-center font-semibold text-white hover:bg-teal-600"
        >
          Request new code
        </a>
      </div>
    );
  }

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <div className="rounded-lg bg-emerald-500/20 p-4 text-emerald-300">
          Password updated successfully!
        </div>
        <p className="text-sm text-slate-400">Redirecting to sign in...</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (password.length < 8)  { setError("Password must be at least 8 characters"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Reset failed"); setLoading(false); return; }
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Reset failed. Please try again.");
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div role="alert" className="rounded-lg bg-rose-500/20 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <p className="text-sm text-slate-400">
        Setting new password for <strong className="text-slate-300">{email}</strong>
      </p>

      {/* New Password */}
      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-300">
          New Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPass ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            minLength={8}
            className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 pr-12 text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            required
            aria-required="true"
          />
          <button
            type="button"
            onClick={() => setShowPass((v) => !v)}
            aria-label={showPass ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 focus:outline-none"
          >
            {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">Minimum 8 characters</p>
      </div>

      {/* Confirm Password */}
      <div>
        <label htmlFor="confirm" className="mb-2 block text-sm font-medium text-slate-300">
          Confirm Password
        </label>
        <div className="relative">
          <input
            id="confirm"
            type={showConfirm ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            minLength={8}
            className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 pr-12 text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            required
            aria-required="true"
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            aria-label={showConfirm ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 focus:outline-none"
          >
            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-teal-500 py-3 font-semibold text-white transition-colors hover:bg-teal-600 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-slate-800"
      >
        {loading ? "Updating..." : "Set New Password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/80 p-8 shadow-2xl backdrop-blur">
      <div className="mb-8 flex items-center justify-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500 text-white">
          <BarChart3 className="h-7 w-7" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Set New Password</h1>
          <p className="text-sm text-slate-400">Health Workforce Optimizer</p>
        </div>
      </div>
      <Suspense fallback={<p className="text-slate-400">Loading...</p>}>
        <ResetPasswordForm />
      </Suspense>
      <p className="mt-6 text-center text-sm text-slate-500">
        <a href="/login" className="text-teal-400 hover:text-teal-300 focus:outline-none focus:text-teal-300">
          Back to Sign In
        </a>
      </p>
    </div>
  );
}
