import Link from "next/link";
import { BarChart3 } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-teal-900/30 to-slate-900">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-teal-500/10 via-transparent to-transparent" />
      <div className="relative z-10 flex flex-col items-center gap-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-teal-500 text-white shadow-lg shadow-teal-500/30">
          <BarChart3 className="h-10 w-10" />
        </div>
        <div>
          <h1 className="text-4xl font-bold text-white">Health Workforce Optimizer</h1>
          <p className="mt-2 text-lg text-slate-400">
            AI-Based Health Workforce Workload Optimization System
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href="/login"
            className="rounded-lg bg-teal-500 px-8 py-3 font-semibold text-white transition-colors hover:bg-teal-600"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="rounded-lg border border-slate-600 bg-slate-800/50 px-8 py-3 font-semibold text-white transition-colors hover:bg-slate-700/50"
          >
            Register
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-teal-500/50 px-8 py-3 font-semibold text-teal-400 transition-colors hover:bg-teal-500/10"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
