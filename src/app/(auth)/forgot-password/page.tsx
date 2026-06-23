"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setSent(true);
    } catch {
      setSent(true); // Don't reveal errors
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
          <h1 className="text-xl font-bold text-white">Reset Password</h1>
          <p className="text-sm text-slate-400">Health Workforce Optimizer</p>
        </div>
      </div>
      {sent ? (
        <div className="space-y-4">
          <p className="text-slate-300">
            If an account exists for <strong>{email}</strong>, you will receive a
            password reset link shortly.
          </p>
          <p className="text-sm text-slate-500">
            For security, please check your spam folder. In development, check the
            server console for the reset link.
          </p>
          <a
            href="/login"
            className="block w-full rounded-lg bg-teal-500 py-3 text-center font-semibold text-white hover:bg-teal-600"
          >
            Back to Sign In
          </a>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <p className="text-sm text-slate-400">
            Enter your email address and we&apos;ll send you a link to reset your
            password.
          </p>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@hospital.org"
              className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-teal-500 py-3 font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-slate-500">
        <a href="/login" className="text-teal-400 hover:text-teal-300">
          Back to Sign In
        </a>
      </p>
    </div>
  );
}
