"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3 } from "lucide-react";

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
  const [message, setMessage] = useState("");

  const handleVerify = async () => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid verification link.");
      return;
    }
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        setMessage("Email verified. You can now sign in.");
      } else {
        setStatus("error");
        setMessage(data.error || "Verification failed.");
      }
    } catch {
      setStatus("error");
      setMessage("Verification failed.");
    }
  };

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/80 p-8 shadow-2xl backdrop-blur">
      <div className="mb-8 flex items-center justify-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500 text-white">
          <BarChart3 className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Verify Email</h1>
          <p className="text-sm text-slate-400">Health Workforce Optimizer</p>
        </div>
      </div>
      {status === "pending" && (
        <>
          <p className="mb-4 text-slate-300">
            Click below to verify your email address.
          </p>
          <button
            onClick={handleVerify}
            className="w-full rounded-lg bg-teal-500 py-3 font-semibold text-white hover:bg-teal-600"
          >
            Verify Email
          </button>
        </>
      )}
      {status === "success" && (
        <div className="rounded-lg bg-emerald-500/20 p-4 text-emerald-300">
          {message}
          <a href="/login" className="mt-4 block text-center text-teal-400 hover:text-teal-300">
            Sign in
          </a>
        </div>
      )}
      {status === "error" && (
        <div className="rounded-lg bg-rose-500/20 p-4 text-rose-300">
          {message}
          <a href="/login" className="mt-4 block text-center text-teal-400 hover:text-teal-300">
            Back to login
          </a>
        </div>
      )}
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
