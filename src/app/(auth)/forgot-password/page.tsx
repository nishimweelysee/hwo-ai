"use client";

import { useState, useEffect } from "react";
import { BarChart3, Mail, ArrowRight, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

type Step = "email" | "otp" | "done";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep]       = useState<Step>("email");
  const [email, setEmail]     = useState("");
  const [otp, setOtp]         = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (step !== "otp") return;
    setResendIn(60);
    const id = setInterval(() => setResendIn((s) => { if (s <= 1) { clearInterval(id); return 0; } return s - 1; }), 1000);
    return () => clearInterval(id);
  }, [step]);

  const sendCode = async (emailAddr: string) => {
    setError("");
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailAddr }),
      });
      setStep("otp");
      setResendIn(60);
    } catch { setStep("otp"); }
  };

  /* ── Step 1: submit email ── */
  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await sendCode(email);
    setLoading(false);
  };

  /* ── Step 2: verify OTP ── */
  const handleOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otp, purpose: "PASSWORD_RESET" }),
      });
      if (res.ok) {
        // Pass email + otp to reset-password page via query params
        router.push(`/reset-password?email=${encodeURIComponent(email)}&code=${encodeURIComponent(otp)}`);
      } else {
        const data = await res.json();
        setError(data.error || "Invalid or expired code");
      }
    } catch {
      setError("Verification failed");
    }
    setLoading(false);
  };

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/80 p-8 shadow-2xl backdrop-blur">
      {/* Header */}
      <div className="mb-8 flex items-center justify-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500 text-white">
          <BarChart3 className="h-7 w-7" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Reset Password</h1>
          <p className="text-sm text-slate-400">Health Workforce Optimizer</p>
        </div>
      </div>

      {/* ── Step 1: Enter email ── */}
      {step === "email" && (
        <form onSubmit={handleEmail} className="space-y-5">
          <p className="text-sm text-slate-400">
            Enter your account email and we&apos;ll send you a 6-digit code.
          </p>
          {error && <div role="alert" className="rounded-lg bg-rose-500/20 p-3 text-sm text-rose-300">{error}</div>}
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-300">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@hospital.org"
              className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              required
              aria-required="true"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-500 py-3 font-semibold text-white transition-colors hover:bg-teal-600 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-slate-800"
          >
            {loading ? "Sending..." : <><Mail className="h-4 w-4" aria-hidden="true" /> Send Code</>}
          </button>
        </form>
      )}

      {/* ── Step 2: Enter OTP ── */}
      {step === "otp" && (
        <form onSubmit={handleOtp} className="space-y-5">
          <div className="rounded-lg bg-teal-500/10 border border-teal-500/30 p-4 text-sm text-teal-300">
            A 6-digit code has been sent to <strong>{email}</strong>.
            <br />
            <span className="text-slate-400 text-xs">No email? Check the backend console log (dev mode).</span>
          </div>
          {error && <div role="alert" className="rounded-lg bg-rose-500/20 p-3 text-sm text-rose-300">{error}</div>}
          <div>
            <label htmlFor="otp" className="mb-2 block text-sm font-medium text-slate-300">
              6-digit code
            </label>
            <input
              id="otp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-center text-2xl font-mono tracking-widest text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              required
              aria-required="true"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading || otp.length !== 6}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-500 py-3 font-semibold text-white transition-colors hover:bg-teal-600 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-slate-800"
          >
            {loading ? "Verifying..." : <>Verify Code <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
          </button>
          <button
            type="button"
            onClick={() => { setStep("email"); setOtp(""); setError(""); }}
            className="w-full text-center text-sm text-slate-500 hover:text-slate-300 focus:outline-none"
          >
            Use a different email
          </button>
          {/* Resend */}
          <div className="text-center">
            {resendIn > 0 ? (
              <p className="text-sm text-slate-500">Resend code in {resendIn}s</p>
            ) : (
              <button type="button" onClick={() => sendCode(email)} disabled={loading}
                className="flex items-center justify-center gap-1.5 mx-auto text-sm text-teal-400 hover:text-teal-300 focus:outline-none disabled:opacity-50">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Resend code
              </button>
            )}
          </div>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        <a href="/login" className="text-teal-400 hover:text-teal-300 focus:outline-none focus:text-teal-300">
          Back to Sign In
        </a>
      </p>
    </div>
  );
}
