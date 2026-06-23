"use client";

import { useAuth } from "@/lib/auth-context";
import { Bell, User, LogOut } from "lucide-react";

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/60 bg-white/95 px-8 backdrop-blur">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">
          Health Workforce Workload Optimization
        </h1>
        <p className="text-xs text-slate-500">AI-powered staff planning system</p>
      </div>
      <div className="flex items-center gap-4">
        <button className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 text-teal-600">
              <User className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">
                {user?.name || "User"}
              </p>
              <p className="text-xs text-slate-500">
                {user?.role || "—"} • {user?.organization || "—"}
              </p>
            </div>
          </div>
          <a
            href="/profile"
            className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Profile
          </a>
          <button
            onClick={() => { logout(); window.location.href = "/"; }}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
