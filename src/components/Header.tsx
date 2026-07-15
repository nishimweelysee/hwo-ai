"use client";

import { useAuth } from "@/lib/auth-context";
import { usePathname } from "next/navigation";
import { Bell, User, LogOut } from "lucide-react";
import { MENU_ITEMS } from "@/lib/permissions";

const PAGE_DESCRIPTIONS: Record<string, string> = {
  "/dashboard": "Real-time workload, wellness, and staffing overview",
  "/workload-analysis": "Department pressure, trends, and staffing ratios",
  "/ai-prediction": "ML workload forecasting and model management",
  "/scheduling": "AI-powered shift allocation and schedule management",
  "/reporting": "Generate, schedule, and export workforce reports",
  "/wellness": "Staff burnout risk, interventions, and wellbeing tracking",
  "/resources": "Inventory, stock movements, and procurement",
  "/skills": "Certifications, competency gaps, and training plans",
  "/compliance": "Regulatory requirements and compliance tracking",
  "/data-collection": "Import CSV data and manage staff records",
  "/data-management": "Data sources, mappings, and integrations",
  "/user-management": "User accounts, roles, and permissions",
  "/configuration": "System settings and application configuration",
  "/audit": "Activity logs, change history, and anomaly detection",
  "/mobile": "Mobile app management and push notifications",
  "/profile": "Your account settings and preferences",
};

export function Header() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const currentPage = MENU_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  const pageTitle = currentPage?.label ?? "Health Workforce Optimizer";
  const pageDesc = PAGE_DESCRIPTIONS[currentPage?.href ?? ""] ?? "AI-powered staff planning system";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/60 bg-white/95 px-8 backdrop-blur">
      <div>
        <h1 className="text-base font-semibold text-slate-800">{pageTitle}</h1>
        <p className="text-xs text-slate-500">{pageDesc}</p>
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
