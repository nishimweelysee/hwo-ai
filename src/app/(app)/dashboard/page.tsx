"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { scheduleStaffPath } from "@/lib/scheduling-links";
import { StaffWeekShiftsPanel } from "@/components/staff-week-shifts-panel";
import { parseApiError } from "@/lib/settings-config";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  LayoutDashboard,
  Loader2,
  MapPin,
  RefreshCw,
  Settings,
  Share2,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  ReferenceLine,
  Cell,
} from "recharts";

type DepartmentRow = { id: string; name: string; staffCount?: number; workload?: number };
type WellnessAlert = {
  staff: string;
  staffId?: string;
  email?: string;
  userId?: string;
  risk: string;
  overtime: number;
  department: string;
};

function ChartSkeleton({ className = "h-72" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-100 ${className}`} />;
}

function workloadLevel(workload: number, threshold: number): "low" | "moderate" | "high" {
  if (workload >= threshold) return "high";
  if (workload >= threshold - 12) return "moderate";
  return "low";
}

function workloadBarColor(workload: number, threshold: number): string {
  const level = workloadLevel(workload, threshold);
  if (level === "high") return "#e11d48";
  if (level === "moderate") return "#f59e0b";
  return "#0d9488";
}

function WorkloadTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
      {label && <p className="mb-1 font-medium text-slate-800">{label}</p>}
      {payload.map((entry) =>
        entry.value != null ? (
          <p key={entry.name} style={{ color: entry.color }} className="text-slate-600">
            {entry.name}: <span className="font-semibold text-slate-800">{Math.round(Number(entry.value))}%</span>
          </p>
        ) : null
      )}
    </div>
  );
}

function ChartPanel({
  title,
  subtitle,
  children,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-6 shadow-sm ${className ?? ""}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-800">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyChart({ message, className = "h-64" }: { message: string; className?: string }) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 text-center ${className}`}
    >
      <BarChart3 className="mb-2 h-8 w-8 text-slate-300" />
      <p className="max-w-xs px-4 text-sm text-slate-500">{message}</p>
    </div>
  );
}

function heatmapCellClass(value: number, max: number): string {
  if (max <= 0 || value <= 0) return "bg-slate-100 text-slate-500";
  const ratio = value / max;
  if (ratio >= 0.75) return "bg-teal-600 text-white font-medium";
  if (ratio >= 0.5) return "bg-teal-400 text-white";
  if (ratio >= 0.25) return "bg-teal-200 text-teal-900";
  return "bg-slate-100 text-slate-600";
}

export default function DashboardPage() {
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [workloadByHour, setWorkloadByHour] = useState<{ hour: string; workload: number }[]>([]);
  const [workloadTrend, setWorkloadTrend] = useState<{ month: string; actual: number | null; predicted: number }[]>([]);
  const [wellnessAlerts, setWellnessAlerts] = useState<WellnessAlert[]>([]);
  const [weekShiftsStaffId, setWeekShiftsStaffId] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    totalStaff?: number;
    avgWorkload?: number;
    balanceScore?: number;
    overtimeRate?: number;
  } | null>(null);
  const [wellnessCount, setWellnessCount] = useState(0);
  const [predictionAccuracy, setPredictionAccuracy] = useState<number | null>(null);
  const [alertThreshold, setAlertThreshold] = useState(80);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [heatmap, setHeatmap] = useState<{ department: string; Day: number; Evening: number; Night: number; total?: number }[]>([]);
  const [overtimeTrend, setOvertimeTrend] = useState<{ month: string; avgOvertime: number }[]>([]);
  const [burnoutDist, setBurnoutDist] = useState<{ low: number; medium: number; high: number } | null>(null);
  const [staffingForecast, setStaffingForecast] = useState<{ month: string; predicted: number }[]>([]);
  const [staffingShortages, setStaffingShortages] = useState<{ department?: string; message?: string }[]>([]);
  const [coveragePercent, setCoveragePercent] = useState<number | null>(null);

  const [preferences, setPreferences] = useState<{ visibleWidgets?: string[]; defaultView?: string } | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [shareRecipients, setShareRecipients] = useState("");
  const [widgetPrefs, setWidgetPrefs] = useState({ workload: true, wellness: true, heatmap: true });

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const overview = await apiFetch("/api/dashboard/overview").then((r) =>
        r.ok ? r.json() : null
      );

      if (!overview) {
        setLoadError("Could not load dashboard — check that the backend is running.");
        return;
      }

      const threshold =
        overview.alertThreshold != null ? Number(overview.alertThreshold) : 80;
      setAlertThreshold(threshold);

      if (Array.isArray(overview.departments)) setDepartments(overview.departments);
      if (Array.isArray(overview.workloadByHour)) setWorkloadByHour(overview.workloadByHour);
      if (Array.isArray(overview.workloadTrend)) setWorkloadTrend(overview.workloadTrend);
      if (overview.summary) setSummary(overview.summary);

      const w = overview.wellness as { alerts?: WellnessAlert[]; atRiskCount?: number };
      if (w) {
        if (Array.isArray(w.alerts)) setWellnessAlerts(w.alerts);
        setWellnessCount(w.atRiskCount ?? w.alerts?.length ?? 0);
      }

      if (overview.predictionAccuracy != null) {
        setPredictionAccuracy(Number(overview.predictionAccuracy));
      }

      if (Array.isArray(overview.heatmap)) setHeatmap(overview.heatmap);

      const analytics = overview.analytics as {
        overtimeTrend?: { month: string; avgOvertime: number }[];
        burnoutRiskDistribution?: { low: number; medium: number; high: number };
        staffingForecast?: { month: string; predicted: number }[];
        staffingShortages?: { department?: string; message?: string }[];
        coveragePercent?: number;
      } | null;

      if (analytics) {
        if (Array.isArray(analytics.overtimeTrend)) setOvertimeTrend(analytics.overtimeTrend);
        if (analytics.burnoutRiskDistribution) setBurnoutDist(analytics.burnoutRiskDistribution);
        if (Array.isArray(analytics.staffingForecast)) setStaffingForecast(analytics.staffingForecast);
        if (Array.isArray(analytics.staffingShortages)) setStaffingShortages(analytics.staffingShortages);
        if (analytics.coveragePercent != null) setCoveragePercent(Number(analytics.coveragePercent));
      }
    } catch {
      setLoadError("Could not load dashboard — check that the backend is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    apiFetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((u: { preferences?: { visibleWidgets?: string[]; defaultView?: string } | string }) => {
        if (!u?.preferences) return;
        if (typeof u.preferences === "string") {
          try {
            setPreferences(JSON.parse(u.preferences));
          } catch {
            setPreferences(null);
          }
          return;
        }
        setPreferences(u.preferences);
      });
  }, []);

  const widgets = preferences?.visibleWidgets;
  const showAllWidgets = !widgets || widgets.length === 0;
  const showWorkload = showAllWidgets || widgets.includes("workload");
  const showWellness = showAllWidgets || widgets.includes("wellness");
  const showHeatmap = showAllWidgets || widgets.includes("heatmap");

  const deptChartData = useMemo(
    () =>
      [...departments]
        .filter((d) => d.workload != null)
        .sort((a, b) => (b.workload ?? 0) - (a.workload ?? 0))
        .map((d) => ({
          ...d,
          workload: d.workload ?? 0,
          shortName: d.name.length > 18 ? `${d.name.slice(0, 16)}…` : d.name,
          level: workloadLevel(d.workload ?? 0, alertThreshold),
        })),
    [departments, alertThreshold]
  );

  const peakHour = useMemo(() => {
    if (!workloadByHour.length) return null;
    return workloadByHour.reduce((best, row) => (row.workload > best.workload ? row : best));
  }, [workloadByHour]);

  const hourlyChartData = useMemo(
    () =>
      workloadByHour.map((row) => ({
        ...row,
        isPeak: peakHour?.hour === row.hour,
      })),
    [workloadByHour, peakHour]
  );

  const totalStaff =
    summary?.totalStaff ??
    departments.reduce((s, d) => s + (d.staffCount ?? 0), 0);

  const avgWorkload =
    summary?.avgWorkload ??
    (departments.length
      ? departments.reduce((s, d) => s + (d.workload ?? 0), 0) / departments.length
      : null);

  const burnoutChartData = useMemo(() => {
    if (!burnoutDist) return [];
    const total = burnoutDist.low + burnoutDist.medium + burnoutDist.high;
    return [
      { risk: "Low", count: burnoutDist.low, fill: "#0d9488", percent: total ? Math.round((burnoutDist.low / total) * 100) : 0 },
      { risk: "Medium", count: burnoutDist.medium, fill: "#f59e0b", percent: total ? Math.round((burnoutDist.medium / total) * 100) : 0 },
      { risk: "High", count: burnoutDist.high, fill: "#e11d48", percent: total ? Math.round((burnoutDist.high / total) * 100) : 0 },
    ];
  }, [burnoutDist]);

  const heatmapMax = useMemo(() => {
    let max = 0;
    for (const row of heatmap) {
      max = Math.max(max, row.Day ?? 0, row.Evening ?? 0, row.Night ?? 0);
    }
    return max;
  }, [heatmap]);

  const openPrefs = () => {
    const visible = preferences?.visibleWidgets;
    const showAll = !visible || visible.length === 0;
    setWidgetPrefs({
      workload: showAll || visible.includes("workload"),
      wellness: showAll || visible.includes("wellness"),
      heatmap: showAll || visible.includes("heatmap"),
    });
    setShowPrefs(true);
  };

  const handleExportDashboard = async () => {
    const res = await apiFetch("/api/predictions/export");
    if (!res.ok) return;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "predictions-export.csv";
    link.click();
    URL.revokeObjectURL(objectUrl);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <LayoutDashboard className="h-7 w-7 text-teal-600" />
            Dashboard
          </h2>
          <p className="mt-1 text-slate-600">Real-time workload, wellness, and staffing overview</p>
          <p className="mt-2 text-xs text-slate-500">
            Workload % from{" "}
            <Link href="/data-collection" className="text-teal-600 hover:underline">
              Data Collection
            </Link>
            . Alert threshold: <strong>{alertThreshold}%</strong>.{" "}
            <Link href="/workload-analysis" className="text-teal-600 hover:underline">
              Full workload analysis →
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowShare(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Share2 className="h-4 w-4" /> Share
          </button>
          <button
            type="button"
            onClick={openPrefs}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Settings className="h-4 w-4" /> Preferences
          </button>
          <button
            type="button"
            onClick={handleExportDashboard}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Export data
          </button>
        </div>
      </div>

      {loadError && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{loadError}</p>
      )}

      {showWorkload && (
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-teal-800 ring-1 ring-teal-200">
            <span className="h-2 w-2 rounded-full bg-teal-600" /> Normal (&lt; {alertThreshold - 12}%)
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-800 ring-1 ring-amber-200">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> Elevated
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-rose-800 ring-1 ring-rose-200">
            <span className="h-2 w-2 rounded-full bg-rose-600" /> At or above {alertThreshold}%
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <>
            <ChartSkeleton className="h-24" />
            <ChartSkeleton className="h-24" />
            <ChartSkeleton className="h-24" />
            <ChartSkeleton className="h-24" />
          </>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-teal-100 p-2">
                  <Users className="h-5 w-5 text-teal-600" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total staff</p>
                  <p className="mt-1 text-2xl font-bold text-slate-800">{totalStaff.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-slate-500">Active roster headcount</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-amber-100 p-2">
                  <Activity className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Avg workload</p>
                  <p
                    className={`mt-1 text-2xl font-bold ${
                      avgWorkload != null && avgWorkload >= alertThreshold ? "text-rose-700" : "text-slate-800"
                    }`}
                  >
                    {avgWorkload != null ? `${Math.round(avgWorkload)}%` : "—"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Hospital-wide pressure index</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-emerald-100 p-2">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Model accuracy</p>
                  <p className="mt-1 text-2xl font-bold text-slate-800">
                    {predictionAccuracy != null ? `${Math.round(predictionAccuracy)}%` : "—"}
                  </p>
                  <Link href="/ai-prediction" className="mt-1 inline-block text-xs text-teal-600 hover:underline">
                    AI Prediction →
                  </Link>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-rose-100 p-2">
                  <AlertTriangle className="h-5 w-5 text-rose-600" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Wellness alerts</p>
                  <p className="mt-1 text-2xl font-bold text-rose-700">{wellnessCount}</p>
                  <Link href="/wellness" className="mt-1 inline-block text-xs text-teal-600 hover:underline">
                    Review wellness →
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {(showWorkload || showWellness) && (
        <div className={`grid gap-6 ${showWorkload && showWellness ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
          {showWorkload && (
            <ChartPanel
              title="Workload by department"
              subtitle="Higher bars = more pressure. Colors reflect alert threshold."
            >
              {loading ? (
                <ChartSkeleton className="h-64" />
              ) : deptChartData.length === 0 ? (
                <EmptyChart message="No department workload yet. Import data in Data Collection." />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deptChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="shortName" width={100} tick={{ fontSize: 11 }} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.[0]) return null;
                          const row = payload[0].payload as DepartmentRow & { level: string; workload: number };
                          return (
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
                              <p className="font-medium text-slate-800">{row.name}</p>
                              <p className="text-slate-600">
                                Workload: <strong>{Math.round(row.workload)}%</strong>
                              </p>
                              <p className="text-xs capitalize text-slate-500">
                                {row.level} vs {alertThreshold}% threshold
                              </p>
                            </div>
                          );
                        }}
                      />
                      <ReferenceLine
                        x={alertThreshold}
                        stroke="#f59e0b"
                        strokeDasharray="4 4"
                        label={{ value: "Alert", fontSize: 10, fill: "#b45309" }}
                      />
                      <Bar dataKey="workload" name="Workload %" radius={[0, 4, 4, 0]} barSize={16}>
                        {deptChartData.map((entry, i) => (
                          <Cell key={i} fill={workloadBarColor(entry.workload, alertThreshold)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartPanel>
          )}

          {showWorkload && (
            <ChartPanel
              title="Peak workload by hour"
              subtitle={
                peakHour
                  ? `Busiest: ${peakHour.hour} (${Math.round(peakHour.workload)}% avg)`
                  : "Average workload by hour of day"
              }
              action={
                peakHour ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-800">
                    <Clock className="h-3.5 w-3.5" /> Peak {peakHour.hour}
                  </span>
                ) : null
              }
            >
              {loading ? (
                <ChartSkeleton className="h-64" />
              ) : workloadByHour.length === 0 ? (
                <EmptyChart message="No hourly workload records yet." />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} width={42} />
                      <Tooltip content={<WorkloadTooltip />} />
                      <ReferenceLine
                        y={alertThreshold}
                        stroke="#f59e0b"
                        strokeDasharray="4 4"
                        label={{ value: "Alert", fontSize: 10, fill: "#b45309", position: "insideTopRight" }}
                      />
                      <Bar dataKey="workload" name="Avg workload %" radius={[4, 4, 0, 0]}>
                        {hourlyChartData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={entry.isPeak ? "#e11d48" : workloadBarColor(entry.workload, alertThreshold)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartPanel>
          )}
        </div>
      )}

      {(showWorkload || showWellness) && (
        <div
          className={`grid gap-6 ${
            showWorkload && showWellness ? "lg:grid-cols-3" : "lg:grid-cols-1"
          }`}
        >
          {showWorkload && (
            <ChartPanel
              className={showWellness ? "lg:col-span-2" : undefined}
              title="Workload trend"
              subtitle="Solid = actual history. Dashed = ML forecast."
              action={
                <Link href="/ai-prediction" className="text-xs font-medium text-teal-600 hover:text-teal-700">
                  AI Prediction →
                </Link>
              }
            >
              {loading ? (
                <ChartSkeleton className="h-64" />
              ) : workloadTrend.length === 0 ? (
                <EmptyChart message="Not enough monthly history for a trend line." />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={workloadTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} width={42} />
                      <Tooltip content={<WorkloadTooltip />} />
                      <Legend />
                      <ReferenceLine y={alertThreshold} stroke="#fca5a5" strokeDasharray="3 3" />
                      <Line
                        type="monotone"
                        dataKey="actual"
                        stroke="#0f766e"
                        strokeWidth={2.5}
                        dot={{ fill: "#0f766e", r: 4 }}
                        connectNulls
                        name="Actual workload"
                      />
                      <Line
                        type="monotone"
                        dataKey="predicted"
                        stroke="#64748b"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        dot={{ fill: "#64748b", r: 3 }}
                        name="Predicted (ML)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartPanel>
          )}

          {showWellness && (
            <ChartPanel
              title="Wellness alerts"
              subtitle="Staff at elevated burnout risk — open scheduling to rebalance shifts."
              action={
                <Link href="/wellness" className="text-xs font-medium text-teal-600 hover:text-teal-700">
                  All alerts →
                </Link>
              }
            >
              {loading ? (
                <div className="space-y-2">
                  <ChartSkeleton className="h-16" />
                  <ChartSkeleton className="h-16" />
                </div>
              ) : wellnessAlerts.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-emerald-700">
                  <TrendingUp className="h-4 w-4" /> No wellness alerts right now.
                </p>
              ) : (
                <div
                  className={`space-y-3 overflow-y-auto ${weekShiftsStaffId ? "max-h-[28rem]" : "max-h-64"}`}
                >
                  {wellnessAlerts.map((alert, i) => (
                    <div key={alert.userId || alert.staffId || i} className="rounded-lg border border-slate-200 p-3">
                      <p className="font-medium text-slate-800">{alert.staff}</p>
                      {alert.email && <p className="text-xs text-teal-600">{alert.email}</p>}
                      <p className="text-sm text-slate-500">{alert.department}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            alert.risk === "high"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {alert.risk} risk
                        </span>
                        <span className="text-xs text-slate-500">+{alert.overtime}hr overtime (7d)</span>
                      </div>
                      {alert.staffId && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setWeekShiftsStaffId(
                                weekShiftsStaffId === alert.staffId ? null : alert.staffId ?? null
                              )
                            }
                            className="text-xs font-medium text-slate-700 hover:text-slate-900"
                          >
                            {weekShiftsStaffId === alert.staffId ? "Hide shifts" : "This week's shifts"}
                          </button>
                          <Link
                            href={scheduleStaffPath(alert.staffId, alert.staff)}
                            className="text-xs font-medium text-teal-600 hover:text-teal-700"
                          >
                            Open scheduling
                          </Link>
                        </div>
                      )}
                      {alert.staffId && (
                        <StaffWeekShiftsPanel
                          staffId={alert.staffId}
                          staffName={alert.staff}
                          expanded={weekShiftsStaffId === alert.staffId}
                          compact
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ChartPanel>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartPanel title="Overtime trend" subtitle="Average overtime hours per month across staff.">
          {loading ? (
            <ChartSkeleton className="h-48" />
          ) : overtimeTrend.length === 0 ? (
            <EmptyChart message="No overtime history yet." className="h-48" />
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overtimeTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit=" hr" width={48} />
                  <Tooltip
                    formatter={(v: number) => [`${Math.round(v * 10) / 10} hrs`, "Avg overtime"]}
                    labelFormatter={(l) => `Month: ${l}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgOvertime"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={{ fill: "#f59e0b", r: 4 }}
                    name="Avg overtime"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartPanel>

        <ChartPanel title="Burnout risk distribution" subtitle="Share of staff by wellness risk level.">
          {loading ? (
            <ChartSkeleton className="h-48" />
          ) : burnoutChartData.length === 0 || burnoutChartData.every((r) => r.count === 0) ? (
            <EmptyChart message="No wellness scores recorded yet." className="h-48" />
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={burnoutChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="risk" width={56} tick={{ fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null;
                      const row = payload[0].payload as { risk: string; count: number; percent: number };
                      return (
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
                          <p className="font-medium text-slate-800">{row.risk} risk</p>
                          <p className="text-slate-600">
                            <strong>{row.count.toLocaleString()}</strong> staff ({row.percent}%)
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" name="Staff count" radius={[0, 4, 4, 0]}>
                    {burnoutChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartPanel>

        <ChartPanel title="Schedule coverage" subtitle="Shift fill rate and detected staffing gaps.">
          {loading ? (
            <ChartSkeleton className="h-48" />
          ) : (
            <>
              {coveragePercent != null ? (
                <p className="text-3xl font-bold text-teal-700">{Math.round(coveragePercent)}%</p>
              ) : (
                <p className="text-2xl font-bold text-slate-400">—</p>
              )}
              <p className="mt-1 text-xs text-slate-500">Scheduled shifts vs required slots</p>
              {summary?.balanceScore != null && (
                <p className="mt-2 text-sm text-slate-600">
                  Balance score: <strong>{summary.balanceScore}/100</strong>
                </p>
              )}
              <ul className="mt-3 max-h-24 space-y-1 overflow-y-auto text-xs text-slate-600">
                {staffingShortages.length === 0 && (
                  <li className="text-emerald-700">No staffing shortages detected</li>
                )}
                {staffingShortages.slice(0, 5).map((s, i) => (
                  <li key={i} className="flex gap-1">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                    <span>
                      {s.department ?? "Dept"}: {s.message ?? "Shortage"}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </ChartPanel>
      </div>

      {staffingForecast.length > 0 && (
        <ChartPanel
          title="Future staffing forecast (AI)"
          subtitle="Predicted workload index by month — train model in AI Prediction for best results."
          action={
            <Link href="/ai-prediction" className="text-xs font-medium text-teal-600 hover:text-teal-700">
              AI Prediction →
            </Link>
          }
        >
          {loading ? (
            <ChartSkeleton className="h-48" />
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={staffingForecast} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} width={42} />
                  <Tooltip formatter={(v: number) => [`${Math.round(v)}%`, "Predicted workload"]} />
                  <ReferenceLine y={alertThreshold} stroke="#fca5a5" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    dot={{ fill: "#6366f1", r: 4 }}
                    name="Predicted workload"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartPanel>
      )}

      {showHeatmap && (
        <ChartPanel
          title="Department overview"
          subtitle="Staff headcount and current workload by unit."
        >
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <ChartSkeleton className="h-24" />
              <ChartSkeleton className="h-24" />
              <ChartSkeleton className="h-24" />
            </div>
          ) : departments.length === 0 ? (
            <EmptyChart message="No departments configured." className="h-32" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {departments.slice(0, 6).map((d) => {
                const wl = d.workload ?? 0;
                const level = workloadLevel(wl, alertThreshold);
                return (
                  <div key={d.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center gap-2">
                      <div className="rounded-full bg-teal-100 p-1.5">
                        <MapPin className="h-4 w-4 text-teal-600" />
                      </div>
                      <span className="font-medium text-slate-800">{d.name}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">
                      {(d.staffCount ?? 0).toLocaleString()} staff
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, wl)}%`,
                            backgroundColor: workloadBarColor(wl, alertThreshold),
                          }}
                        />
                      </div>
                      <span
                        className={`text-sm font-semibold ${
                          level === "high" ? "text-rose-700" : level === "moderate" ? "text-amber-700" : "text-teal-700"
                        }`}
                      >
                        {Math.round(wl)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ChartPanel>
      )}

      {showHeatmap && heatmap.length > 0 && (
        <ChartPanel
          title="Staff allocation heatmap"
          subtitle="Scheduled staff count by department and shift type. Darker = more coverage."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4">Department</th>
                  <th className="pb-2 text-center">Day</th>
                  <th className="pb-2 text-center">Evening</th>
                  <th className="pb-2 text-center">Night</th>
                  <th className="pb-2 text-center">Total</th>
                </tr>
              </thead>
              <tbody>
                {heatmap.map((row, i) => {
                  const total =
                    row.total ?? (row.Day ?? 0) + (row.Evening ?? 0) + (row.Night ?? 0);
                  return (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2.5 font-medium text-slate-800">{row.department}</td>
                      {(["Day", "Evening", "Night"] as const).map((shift) => {
                        const val = row[shift] ?? 0;
                        return (
                          <td key={shift} className="py-2.5 text-center">
                            <span
                              className={`inline-block min-w-[2rem] rounded px-2 py-0.5 text-xs ${heatmapCellClass(val, heatmapMax)}`}
                            >
                              {val}
                            </span>
                          </td>
                        );
                      })}
                      <td className="py-2.5 text-center font-semibold text-slate-700">{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ChartPanel>
      )}

      {showShare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h3 className="font-semibold text-slate-800">Share Dashboard</h3>
            <p className="mt-1 text-sm text-slate-500">Enter email addresses (comma-separated)</p>
            <textarea
              value={shareRecipients}
              onChange={(e) => setShareRecipients(e.target.value)}
              placeholder="email1@example.com, email2@example.com"
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={3}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowShare(false)}
                className="rounded-lg border px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const recipients = shareRecipients.split(",").map((e) => e.trim()).filter(Boolean);
                  const res = await apiFetch("/api/dashboard/share", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ recipients }),
                  });
                  if (res.ok) {
                    setShowShare(false);
                    setShareRecipients("");
                  }
                }}
                className="rounded-lg bg-teal-500 px-3 py-1.5 text-sm text-white hover:bg-teal-600"
              >
                Share
              </button>
            </div>
          </div>
        </div>
      )}

      {showPrefs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h3 className="font-semibold text-slate-800">Dashboard Preferences</h3>
            <div className="mt-4 space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={widgetPrefs.workload}
                  onChange={(e) => setWidgetPrefs((p) => ({ ...p, workload: e.target.checked }))}
                  className="rounded"
                />
                Show workload charts
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={widgetPrefs.wellness}
                  onChange={(e) => setWidgetPrefs((p) => ({ ...p, wellness: e.target.checked }))}
                  className="rounded"
                />
                Show wellness alerts
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={widgetPrefs.heatmap}
                  onChange={(e) => setWidgetPrefs((p) => ({ ...p, heatmap: e.target.checked }))}
                  className="rounded"
                />
                Show department overview & heatmap
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowPrefs(false)} className="rounded-lg border px-3 py-1.5 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const visibleWidgets = (["workload", "wellness", "heatmap"] as const).filter((w) => widgetPrefs[w]);
                  if (visibleWidgets.length === 0) {
                    alert("Select at least one dashboard widget to show.");
                    return;
                  }
                  const res = await apiFetch("/api/profile", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      preferences: {
                        visibleWidgets,
                        defaultView: preferences?.defaultView ?? "overview",
                      },
                    }),
                  });
                  if (!res.ok) {
                    alert(await parseApiError(res, "Failed to save dashboard preferences"));
                    return;
                  }
                  setPreferences({ visibleWidgets, defaultView: preferences?.defaultView ?? "overview" });
                  setShowPrefs(false);
                }}
                className="rounded-lg bg-teal-500 px-3 py-1.5 text-sm text-white hover:bg-teal-600"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Updating dashboard…
        </p>
      )}
    </div>
  );
}
