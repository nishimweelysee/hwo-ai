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

const SIDEBAR_GROUPS: { label: string; ids: MenuId[] }[] = [
  {
    label: "Overview",
    ids: ["dashboard"],
  },
  {
    label: "Workforce",
    ids: ["scheduling", "wellness", "skills", "compliance", "resources"],
  },
  {
    label: "Analytics",
    ids: ["workload-analysis", "ai-prediction", "reporting"],
  },
  {
    label: "Administration",
    ids: ["data-collection", "data-management", "user-management", "configuration", "audit", "mobile"],
  },
  {
    label: "Account",
    ids: ["profile"],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { canAccessMenu, loading } = usePermissions();

  const visibleIds = new Set(
    (loading ? MENU_ITEMS : MENU_ITEMS.filter((item) => canAccessMenu(item.id))).map(
      (item) => item.id
    )
  );

  const itemMap = Object.fromEntries(MENU_ITEMS.map((item) => [item.id, item])) as Record<
    MenuId,
    (typeof MENU_ITEMS)[number]
  >;

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-slate-200/60 bg-slate-50/95 backdrop-blur">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-200/60 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <span className="block font-semibold leading-tight text-slate-800">HWO</span>
          <span className="block text-[10px] font-medium uppercase tracking-widest text-teal-600">
            Workforce Optimizer
          </span>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {SIDEBAR_GROUPS.map((group, gi) => {
          const groupItems = group.ids
            .filter((id) => visibleIds.has(id))
            .map((id) => itemMap[id]);

          if (groupItems.length === 0) return null;

          return (
            <div key={group.label} className={gi > 0 ? "mt-4" : ""}>
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {groupItems.map((item) => {
                  const Icon = ICONS[item.id];
                  const isActive =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
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
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
