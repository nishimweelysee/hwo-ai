"use client";

import { Suspense, useState, useEffect } from "react";
import { BarChart3, Mail, ArrowRight, RefreshCw } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";

type Step = "email" | "otp" | "done";

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const prefillEmail = searchParams.get("email") || "";
  const isNew        = searchParams.get("new") === "1";

  const [step,     setStep]    = useState<Step>(prefillEmail ? "otp" : "email");
  const [email,    setEmail]   = useState(prefillEmail);
  const [otp,      setOtp]     = useState("");
  const [error,    setError]   = useState("");
  const [loading,  setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (step !== "otp") return;
    setResendIn(60);
    const id = setInterval(() => setResendIn((s) => { if (s <= 1) { clearInterval(id); return 0; } return s - 1; }), 1000);
    return () => clearInterval(id);
  }, [step]);

  const sendCode = async (emailAddr: string) => {
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailAddr }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Could not send code");
      } else {
        setStep("otp");
        setResendIn(60);
      }
    } catch { setError("Could not send code"); }
    setLoading(false);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendCode(email);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otp }),
      });
      if (res.ok) {
        setStep("done");
      } else {
        const data = await res.json();
        setError(data.error || "Invalid or expired code");
      }
    } catch { setError("Verification failed"); }
    setLoading(false);
  };

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/80 p-8 shadow-2xl backdrop-blur">
      <div className="mb-8 flex items-center justify-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500 text-white">
          <BarChart3 className="h-7 w-7" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Verify Email</h1>
          <p className="text-sm text-slate-400">Health Workforce Optimizer</p>
        </div>
      </div>

      {isNew && step !== "done" && (
        <div className="mb-5 rounded-lg border border-teal-500/30 bg-teal-500/10 p-3 text-sm text-teal-300">
          Account created! Please verify your email to activate your account.
        </div>
      )}

      {step === "email" && (
        <form onSubmit={handleSend} className="space-y-5">
          <p className="text-sm text-slate-400">Enter your email to receive a 6-digit verification code.</p>
          {error && <div role="alert" className="rounded-lg bg-rose-500/20 p-3 text-sm text-rose-300">{error}</div>}
          <div>
            <label htmlFor="ve-email" className="mb-2 block text-sm font-medium text-slate-300">Email</label>
            <input id="ve-email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@hospital.org"
              className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              required aria-required="true" />
          </div>
          <button type="submit" disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-500 py-3 font-semibold text-white transition-colors hover:bg-teal-600 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-slate-800">
            {loading ? "Sending..." : <><Mail className="h-4 w-4" aria-hidden="true" /> Send Code</>}
          </button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleVerify} className="space-y-5">
          <div className="rounded-lg border border-teal-500/30 bg-teal-500/10 p-4 text-sm text-teal-300">
            A 6-digit code was sent to <strong>{email}</strong>.
            <br /><span className="text-xs text-slate-400">No email? Check the backend console log (dev mode).</span>
          </div>
          {error && <div role="alert" className="rounded-lg bg-rose-500/20 p-3 text-sm text-rose-300">{error}</div>}
          <div>
            <label htmlFor="ve-otp" className="mb-2 block text-sm font-medium text-slate-300">6-digit code</label>
            <input id="ve-otp" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
              value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-center text-2xl font-mono tracking-widest text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              required aria-required="true" autoFocus />
          </div>
          <button type="submit" disabled={loading || otp.length !== 6}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-500 py-3 font-semibold text-white transition-colors hover:bg-teal-600 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-slate-800">
            {loading ? "Verifying..." : <>Verify Email <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
          </button>
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
          <button type="button" onClick={() => { setStep("email"); setOtp(""); setError(""); }}
            className="w-full text-center text-sm text-slate-500 hover:text-slate-300 focus:outline-none">
            Use a different email
          </button>
        </form>
      )}

      {step === "done" && (
        <div className="space-y-4 text-center">
          <div className="rounded-lg bg-emerald-500/20 p-4 text-emerald-300 text-lg">✓ Email verified!</div>
          <p className="text-sm text-slate-400">Your account is now active.</p>
          <button onClick={() => router.push("/login")}
            className="block w-full rounded-lg bg-teal-500 py-3 text-center font-semibold text-white transition-colors hover:bg-teal-600">
            Sign In
          </button>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        <a href="/login" className="text-teal-400 hover:text-teal-300 focus:outline-none">Back to Sign In</a>
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="rounded-2xl border border-slate-700/50 bg-slate-800/80 p-8 animate-pulse">Loading...</div>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
