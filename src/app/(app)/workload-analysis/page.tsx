"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  Loader2,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { filterStaffRows, type StaffLike } from "@/lib/searchable-options";
import { ListSearchBar } from "@/components/list-search-bar";
import { usePagination } from "@/hooks/use-pagination";
import { Pagination } from "@/components/pagination";
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
  ComposedChart,
  Legend,
  ReferenceLine,
  Cell,
} from "recharts";

type DepartmentRow = { id: string; name: string; workload: number };
type RatioRow = {
  department: string;
  staffCount?: number;
  avgPatientVolume?: number;
  staffToPatientRatio: string;
  target?: string;
  status: string;
};

function ChartSkeleton({ className = "h-72" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-100 ${className}`} />;
}

function workloadLevel(workload: number, threshold: number | null): "low" | "moderate" | "high" {
  const t = threshold ?? 80;
  if (workload >= t) return "high";
  if (workload >= t - 12) return "moderate";
  return "low";
}

function workloadBarColor(workload: number, threshold: number | null): string {
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
      <p className="mb-1 font-medium text-slate-800">{label}</p>
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
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
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

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-72 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 text-center">
      <BarChart3 className="mb-2 h-8 w-8 text-slate-300" />
      <p className="max-w-xs text-sm text-slate-500">{message}</p>
    </div>
  );
}

export default function WorkloadAnalysisPage() {
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [workloadByHour, setWorkloadByHour] = useState<{ hour: string; workload: number }[]>([]);
  const [workloadTrend, setWorkloadTrend] = useState<{ month: string; actual: number | null; predicted: number }[]>([]);
  const [overtimeData, setOvertimeData] = useState<{ department: string; overtime: number; undertime: number }[]>([]);
  const [ratios, setRatios] = useState<{ byDepartment: RatioRow[]; overall?: { ratio: string; target?: string } } | null>(null);
  const [skillMix, setSkillMix] = useState<{ role: string; category?: string; count: number }[]>([]);
  const [anomalies, setAnomalies] = useState<{ date: string; department: string; workload: number; deviation: number }[]>([]);
  const [summary, setSummary] = useState<{
    overallRatio?: string;
    balanceScore?: number;
    overtimeRate?: number;
    avgWorkload?: number;
    totalStaff?: number;
  } | null>(null);
  const [alertThreshold, setAlertThreshold] = useState<number>(80);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [
        depts,
        hours,
        trend,
        ot,
        rat,
        sm,
        anom,
        sum,
        workloadSettings,
      ] = await Promise.all([
        apiFetch("/api/departments").then((r) => (r.ok ? r.json() : [])),
        apiFetch("/api/workload?type=byHour").then((r) => (r.ok ? r.json() : [])),
        apiFetch("/api/workload?type=trend").then((r) => (r.ok ? r.json() : [])),
        apiFetch("/api/workload/overtime").then((r) => (r.ok ? r.json() : [])),
        apiFetch("/api/workload/ratios").then((r) => (r.ok ? r.json() : null)),
        apiFetch("/api/workload/skill-mix").then((r) => (r.ok ? r.json() : [])),
        apiFetch("/api/workload/anomalies").then((r) => (r.ok ? r.json() : { anomalies: [] })),
        apiFetch("/api/workload/summary").then((r) => (r.ok ? r.json() : null)),
        apiFetch("/api/settings/workload").then((r) => (r.ok ? r.json() : null)),
      ]);

      const threshold =
        workloadSettings?.alertThreshold != null ? Number(workloadSettings.alertThreshold) : 80;
      setAlertThreshold(threshold);

      if (Array.isArray(depts)) setDepartments(depts);
      if (Array.isArray(hours)) setWorkloadByHour(hours);
      if (Array.isArray(trend)) setWorkloadTrend(trend);
      if (Array.isArray(ot)) setOvertimeData(ot);
      if (rat) setRatios(rat);
      if (Array.isArray(sm)) {
        setSkillMix(
          sm.map((row: { role?: string; category?: string; count?: number }) => ({
            role: row.role ?? "Unknown",
            category: row.category,
            count: row.count ?? 0,
          }))
        );
      }
      if (anom?.anomalies) setAnomalies(anom.anomalies);
      if (sum) setSummary(sum);
    } catch {
      setLoadError("Could not load workload data — check that the backend is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const deptChartData = useMemo(
    () =>
      [...departments]
        .sort((a, b) => b.workload - a.workload)
        .map((d) => ({
          ...d,
          shortName: d.name.length > 18 ? `${d.name.slice(0, 16)}…` : d.name,
          level: workloadLevel(d.workload, alertThreshold),
        })),
    [departments, alertThreshold]
  );

  const utilizationData = useMemo(
    () =>
      departments.map((d) => ({
        name: d.name.length > 14 ? `${d.name.slice(0, 12)}…` : d.name,
        fullName: d.name,
        utilized: d.workload,
        target: alertThreshold,
        gap: d.workload - alertThreshold,
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

  const skillChartData = useMemo(() => {
    const sorted = [...skillMix].sort((a, b) => b.count - a.count).slice(0, 12);
    const total = sorted.reduce((s, row) => s + row.count, 0);
    return sorted.map((row) => ({
      ...row,
      shortRole: row.role.length > 22 ? `${row.role.slice(0, 20)}…` : row.role,
      percent: total > 0 ? Math.round((row.count / total) * 1000) / 10 : 0,
    }));
  }, [skillMix]);

  const skillMixTotal = useMemo(
    () => skillChartData.reduce((s, row) => s + row.count, 0),
    [skillChartData]
  );

  const skillMixSpread = useMemo(() => {
    if (skillChartData.length < 2) return null;
    const counts = skillChartData.map((r) => r.count);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    if (max === 0) return null;
    return Math.round(((max - min) / max) * 100);
  }, [skillChartData]);

  const avgWorkload =
    summary?.avgWorkload ??
    (departments.length
      ? departments.reduce((s, d) => s + d.workload, 0) / departments.length
      : null);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <Activity className="h-7 w-7 text-teal-600" />
            Workload Analysis
          </h2>
          <p className="mt-1 text-slate-600">
            How busy each department is (0–100%), when peaks happen, and staffing pressure signals
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Workload % comes from patient volume and staffing records in{" "}
            <Link href="/data-collection" className="text-teal-600 hover:underline">
              Data Collection
            </Link>
            . Alert threshold: <strong>{alertThreshold}%</strong> (Configuration → Workload).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loadError && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{loadError}</p>
      )}

      <div className="flex flex-wrap gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-teal-800 ring-1 ring-teal-200">
          <span className="h-2 w-2 rounded-full bg-teal-600" /> Normal (&lt; {alertThreshold - 12}%)
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-800 ring-1 ring-amber-200">
          <span className="h-2 w-2 rounded-full bg-amber-500" /> Elevated
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-rose-800 ring-1 ring-rose-200">
          <span className="h-2 w-2 rounded-full bg-rose-600" /> At or above {alertThreshold}% alert
        </span>
      </div>

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
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Average workload</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">
                {avgWorkload != null ? `${Math.round(avgWorkload)}%` : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500">Hospital-wide pressure index</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Staff : patient</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">
                {ratios?.overall?.ratio ?? summary?.overallRatio ?? "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Target {ratios?.overall?.target ?? "from settings"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Balance score</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">
                {summary?.balanceScore != null ? `${summary.balanceScore}/100` : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500">Even spread across departments</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Overtime rate</p>
              <p className="mt-1 text-2xl font-bold text-rose-700">
                {summary?.overtimeRate != null ? `${summary.overtimeRate}%` : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500">Staff over 8hr extra / week</p>
            </div>
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartPanel
          title="Workload by department"
          subtitle="Higher bars = more pressure. Colors show alert level vs your threshold."
        >
          {loading ? (
            <ChartSkeleton />
          ) : deptChartData.length === 0 ? (
            <EmptyChart message="No department workload yet. Import patient/workload data or seed the database." />
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptChartData} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="shortName" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.[0]) return null;
                      const row = payload[0].payload as DepartmentRow & { level: string };
                      return (
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
                          <p className="font-medium text-slate-800">{row.name}</p>
                          <p className="text-slate-600">
                            Workload: <strong>{Math.round(row.workload)}%</strong>
                          </p>
                          <p className="text-xs capitalize text-slate-500">{row.level} vs {alertThreshold}% target</p>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine x={alertThreshold} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "Alert", fontSize: 10, fill: "#b45309" }} />
                  <Bar dataKey="workload" name="Workload %" radius={[0, 4, 4, 0]} barSize={18}>
                    {deptChartData.map((entry, i) => (
                      <Cell key={i} fill={workloadBarColor(entry.workload, alertThreshold)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartPanel>

        <ChartPanel
          title="Utilization vs target"
          subtitle="Teal bars = current dept workload. Orange line = configured alert threshold."
        >
          {loading ? (
            <ChartSkeleton />
          ) : utilizationData.length === 0 ? (
            <EmptyChart message="No utilization data available." />
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={utilizationData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={56} />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} width={42} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload as { fullName: string; utilized: number; target: number; gap: number };
                      return (
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
                          <p className="font-medium text-slate-800">{row.fullName}</p>
                          <p className="text-slate-600">Current: <strong>{Math.round(row.utilized)}%</strong></p>
                          <p className="text-slate-600">Target: <strong>{row.target}%</strong></p>
                          <p className={`text-xs ${row.gap > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                            {row.gap > 0 ? `${Math.round(row.gap)}% above target` : `${Math.round(Math.abs(row.gap))}% below target`}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Legend />
                  <Bar dataKey="utilized" fill="#0d9488" name="Current workload %" radius={[4, 4, 0, 0]} />
                  <Line
                    type="monotone"
                    dataKey="target"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ fill: "#f59e0b", r: 3 }}
                    name="Alert threshold"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartPanel>
      </div>

      <ChartPanel
        title="Workload by hour of day"
        subtitle={
          peakHour
            ? `Busiest hour: ${peakHour.hour} (${Math.round(peakHour.workload)}% avg) — use for shift planning`
            : "Average workload across all departments for each hour"
        }
        action={
          peakHour ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
              <Clock className="h-3.5 w-3.5" /> Peak {peakHour.hour}
            </span>
          ) : null
        }
      >
        {loading ? (
          <ChartSkeleton className="h-64" />
        ) : workloadByHour.length === 0 ? (
          <EmptyChart message="No hourly workload records. Import patient data with hour column." />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} label={{ value: "Hour of day", position: "insideBottom", offset: -12, fontSize: 11 }} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} width={42} />
                <Tooltip content={<WorkloadTooltip />} />
                <ReferenceLine y={alertThreshold} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "Alert", fontSize: 10, fill: "#b45309", position: "insideTopRight" }} />
                <Bar dataKey="workload" name="Avg workload %" radius={[4, 4, 0, 0]}>
                  {hourlyChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.isPeak ? "#e11d48" : workloadBarColor(entry.workload, alertThreshold)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartPanel>

      <ChartPanel
        title="Monthly workload trend"
        subtitle="Solid = actual history. Dashed = ML forecast (requires trained model in AI Prediction)."
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
          <div className="h-72">
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

      {ratios?.byDepartment && ratios.byDepartment.length > 0 && (
        <ChartPanel title="Staff-to-patient ratio by department" subtitle="Compare each unit to the configured target ratio.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4">Department</th>
                  <th className="pb-2 pr-4">Staff</th>
                  <th className="pb-2 pr-4">Avg patients</th>
                  <th className="pb-2 pr-4">Ratio</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {ratios.byDepartment.map((row) => (
                  <tr key={row.department} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 pr-4 font-medium text-slate-800">{row.department}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{row.staffCount ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{row.avgPatientVolume ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-slate-800">{row.staffToPatientRatio}</td>
                    <td className="py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.status === "within"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {row.status === "within" ? "Within target" : "Above target"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartPanel>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartPanel title="Overtime & undertime" subtitle="Overtime = extra hours logged. Undertime = understaffed shift count.">
          {loading ? (
            <ChartSkeleton className="h-64" />
          ) : overtimeData.length === 0 ? (
            <EmptyChart message="No overtime data — driven by schedules and wellness records." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overtimeData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="department" width={88} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="overtime" fill="#f59e0b" name="Overtime (hrs)" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="undertime" fill="#94a3b8" name="Undertime (count)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartPanel>

        <ChartPanel
          title="Skill mix by role"
          subtitle={
            skillMixTotal > 0
              ? `${skillMixTotal.toLocaleString()} staff counted by role from your roster — not workload-weighted.`
              : "Headcount per role from staff records in Data Collection."
          }
        >
          {loading ? (
            <ChartSkeleton className="h-64" />
          ) : skillChartData.length === 0 ? (
            <EmptyChart message="No staff assigned to roles yet. Import or add staff in Data Collection." />
          ) : (
            <>
              {skillMixSpread != null && skillMixSpread <= 2 && (
                <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Roles are nearly equal in headcount (within {skillMixSpread}% of the largest role). That often
                  happens with bulk sample imports, which assign roles in rotation — not a chart error.
                </p>
              )}
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={skillChartData} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="shortRole" width={108} tick={{ fontSize: 10 }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0]?.payload as { role?: string; count?: number; percent?: number; category?: string };
                        return (
                          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
                            <p className="font-medium text-slate-800">{row.role}</p>
                            {row.category && <p className="text-xs capitalize text-slate-500">{row.category}</p>}
                            <p className="mt-1 text-slate-700">
                              <span className="font-semibold">{row.count?.toLocaleString()}</span> staff
                              {row.percent != null && ` (${row.percent}% of mix)`}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" fill="#0d9488" name="Staff count" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </ChartPanel>
      </div>

      <ChartPanel
        title="Anomaly alerts"
        subtitle="Unusual workload spikes vs normal pattern (standard deviations). Review scheduling for these dates."
      >
        {loading ? (
          <div className="space-y-2">
            <ChartSkeleton className="h-12" />
            <ChartSkeleton className="h-12" />
          </div>
        ) : anomalies.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-700">
            <TrendingUp className="h-4 w-4" /> No unusual workload spikes detected in recent data.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {anomalies.slice(0, 12).map((a, i) => (
              <div
                key={`${a.department}-${a.date}-${i}`}
                className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-medium text-slate-800">{a.department}</p>
                  <p className="text-xs text-slate-600">{a.date}</p>
                  <p className="mt-1 text-amber-800">
                    Workload {Math.round(a.workload)}% · {a.deviation.toFixed(1)}σ above normal
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </ChartPanel>

      <ChartPanel title="Staff drill-down" subtitle="Filter by department and wellness risk — link to Scheduling or Wellness for action.">
        <StaffDrillDown />
      </ChartPanel>
    </div>
  );
}

function StaffDrillDown() {
  type DrillStaff = {
    id?: string;
    name: string;
    role: string;
    email?: string;
    department: { name: string };
    departmentId?: string;
    wellness?: { riskLevel?: string; overtime?: number }[];
  };

  const [staff, setStaff] = useState<DrillStaff[]>([]);
  const [deptFilter, setDeptFilter] = useState("");
  const [staffSearch, setStaffSearch] = useState("");
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);

  useEffect(() => {
    apiFetch("/api/departments")
      .then((r) => (r.ok ? r.json() : []))
      .then(setDepartments);
  }, []);

  useEffect(() => {
    setLoadingStaff(true);
    const params = new URLSearchParams({ wellness: "true", limit: "500" });
    if (deptFilter) params.set("departmentId", deptFilter);
    apiFetch(`/api/staff?${params}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setStaff)
      .finally(() => setLoadingStaff(false));
  }, [deptFilter]);

  const filteredStaff = useMemo(() => {
    const rows: StaffLike[] = staff.map((s) => ({
      id: s.id ?? s.name,
      name: s.name,
      email: s.email,
      role: s.role,
      department: s.department?.name,
      departmentId: s.departmentId,
    }));
    const bySearch = filterStaffRows(rows, staffSearch);
    const idSet = new Set(bySearch.map((s) => s.id));
    return staff.filter((s) => idSet.has(s.id ?? s.name));
  }, [staff, staffSearch]);

  const staffPagination = usePagination(filteredStaff, 10, `${deptFilter}-${staffSearch}`);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block min-w-[10rem]">
          <span className="mb-1 block text-xs font-medium text-slate-600">Department</span>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <ListSearchBar
          value={staffSearch}
          onChange={setStaffSearch}
          placeholder="Search name, role, department…"
          className="sm:max-w-xs"
        />
      </div>
      {loadingStaff ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading staff…
        </div>
      ) : filteredStaff.length === 0 ? (
        <p className="text-sm text-slate-500">No staff match your filters.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4">Staff</th>
                  <th className="pb-2 pr-4">Role</th>
                  <th className="pb-2 pr-4">Department</th>
                  <th className="pb-2 pr-4">Wellness risk</th>
                  <th className="pb-2">Overtime</th>
                </tr>
              </thead>
              <tbody>
                {staffPagination.paginatedItems.map((s, i) => (
                  <tr key={s.id ?? `${s.name}-${i}`} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 pr-4 font-medium text-slate-800">{s.name}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{s.role}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{s.department.name}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.wellness?.[0]?.riskLevel === "high"
                            ? "bg-rose-100 text-rose-700"
                            : s.wellness?.[0]?.riskLevel === "medium"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {s.wellness?.[0]?.riskLevel || "low"}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-600">
                      {s.wellness?.[0]?.overtime != null ? `+${s.wellness[0].overtime}hr` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            className="mt-3"
            page={staffPagination.page}
            pageSize={staffPagination.pageSize}
            totalItems={staffPagination.totalItems}
            totalPages={staffPagination.totalPages}
            onPageChange={staffPagination.setPage}
            onPageSizeChange={staffPagination.setPageSize}
          />
        </>
      )}
    </div>
  );
}
