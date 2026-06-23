"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Brain,
  Calendar,
  FileText,
  Heart,
  Package,
  Award,
  Smartphone,
  Shield,
  Database,
  ClipboardList,
  User,
  SlidersHorizontal,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { MENU_ITEMS, MenuId } from "@/lib/permissions";

const ICONS: Record<MenuId, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  "data-collection": Users,
  "workload-analysis": BarChart3,
  "ai-prediction": Brain,
  scheduling: Calendar,
  reporting: FileText,
  wellness: Heart,
  resources: Package,
  skills: Award,
  mobile: Smartphone,
  compliance: Shield,
  "user-management": UserCog,
  configuration: SlidersHorizontal,
  "data-management": Database,
  audit: ClipboardList,
  profile: User,
};

export function Sidebar() {
  const pathname = usePathname();
  const { canAccessMenu, loading } = usePermissions();

  const visibleItems = loading
    ? MENU_ITEMS
    : MENU_ITEMS.filter((item) => canAccessMenu(item.id));

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-slate-200/60 bg-slate-50/95 backdrop-blur">
      <div className="flex h-16 items-center gap-2 border-b border-slate-200/60 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white">
          <BarChart3 className="h-5 w-5" />
        </div>
        <span className="font-semibold text-slate-800">HWO</span>
      </div>
      <nav className="flex flex-col gap-0.5 p-3">
        {visibleItems.map((item) => {
          const Icon = ICONS[item.id];
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-teal-600 text-white"
                  : "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
