"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Shield,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Download,
  FileText,
  History,
  ClipboardList,
  ScanLine,
  HelpCircle,
  ArrowRight,
  Users,
  Clock,
  Loader2,
  XCircle,
  ExternalLink,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { apiDownload, apiFetch, parseApiError } from "@/lib/api";
import { usePagination } from "@/hooks/use-pagination";
import { Pagination } from "@/components/pagination";
import { ListSearchBar } from "@/components/list-search-bar";

type Tab = "overview" | "requirements" | "submissions" | "history";

type Requirement = {
  id: string;
  category: string;
  requirement: string;
  status: string;
  value?: string;
  issues?: { category: string; staff: string; detail: string }[];
  issuesTruncated?: boolean;
  totalIssues?: number;
};

type Submission = {
  id: string;
  templateId?: string;
  name: string;
  description: string;
  regulator: string;
  frequency?: string;
  status?: string;
  lastSubmittedAt?: string;
};

type Template = {
  id: string;
  submissionId: string;
  name: string;
  regulator: string;
  description?: string;
  frequency?: string;
  lastUpdated?: string;
};

type HistoryRecord = {
  id: string;
  recordType?: string;
  requirement: string;
  status: string;
  value?: string;
  category?: string;
  submissionId?: string;
  regulator?: string;
  recordedAt?: string;
};

type Dashboard = {
  status: Requirement[];
  issues: { category: string; staff: string; detail: string }[];
  violations: number;
  warnings: number;
  staffIssues?: number;
  failedRequirements?: number;
  warningRequirements?: number;
  complianceScore?: number;
  issueBreakdown?: Record<string, number>;
  pendingActions: number;
  overallStatus: string;
  submissions: Submission[];
  conflictsToday: number;
  issuesTruncated?: boolean;
  totalIssues?: number;
};

type Overview = {
  canSubmit: boolean;
  templates: Template[];
  submissionForms: Submission[];
  schedulingRules: {
    maxHoursPerWeek: number;
    restBetweenShifts: number;
    skillMixRequired: boolean;
    respectPreferences: boolean;
  };
  counts: {
    staff: number;
    departments: number;
    violations?: number;
    warnings?: number;
    staffIssues?: number;
    pendingActions?: number;
    queuedSubmissions: number;
  };
  dashboard: Dashboard;
  history: HistoryRecord[];
  lastScan?: HistoryRecord | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  work_hours: "Work hours",
  rest: "Rest periods",
  scheduling: "Schedule conflicts",
  certifications: "Certifications",
  training: "Training",
};

const CATEGORY_COLORS: Record<string, string> = {
  work_hours: "#e11d48",
  rest: "#f97316",
  scheduling: "#8b5cf6",
};

function statusBadgeClass(status: string) {
  if (status === "compliant" || status === "completed") return "bg-emerald-100 text-emerald-700";
  if (status === "warning" || status === "queued" || status === "attention") return "bg-amber-100 text-amber-700";
  if (status === "violation" || status === "review_needed") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-600";
}

function overallLabel(status: string) {
  if (status === "compliant") return "Compliant";
  if (status === "attention") return "Attention needed";
  return "Review needed";
}

function remediationLink(category: string) {
  if (category === "work_hours" || category === "rest" || category === "scheduling") {
    return { href: "/scheduling", label: "Open scheduling" };
  }
  if (category === "certifications" || category === "training") {
    return { href: "/skills", label: "Open skills & training" };
  }
  return null;
}

function ChartSkeleton({ className = "h-64" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-100 ${className}`} />;
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon: ReactNode;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
        </div>
        <div className={`rounded-lg p-2 ${accent}`}>{icon}</div>
      </div>
    </div>
  );
}

export default function CompliancePage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [historyType, setHistoryType] = useState("");
  const [issueSearch, setIssueSearch] = useState("");
  const [issueCategory, setIssueCategory] = useState("");
  const [reqCategory, setReqCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadOverview = useCallback(async (recordType?: string) => {
    const params = recordType ? `?recordType=${encodeURIComponent(recordType)}` : "";
    const res = await apiFetch(`/api/compliance/overview${params}`);
    if (!res.ok) {
      throw new Error(await parseApiError(res, "Failed to load compliance data"));
    }
    return res.json() as Promise<Overview>;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await loadOverview(historyType || undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load compliance data");
    } finally {
      setLoading(false);
    }
  }, [loadOverview, historyType]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runScan = async () => {
    setScanning(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch("/api/compliance/scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? (await parseApiError(res, "Scan failed")));
        return;
      }
      setSuccess(data.message || "Compliance scan completed");
      await refresh();
      setTab("history");
    } catch {
      setError("Compliance scan failed");
    } finally {
      setScanning(false);
    }
  };

  const handleSubmit = async (submissionId: string, templateId?: string) => {
    setSubmitting(submissionId);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch("/api/compliance/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, templateId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? (await parseApiError(res, "Submit failed")));
        return;
      }
      setSuccess(data.message || "Report queued");
      await refresh();
    } catch {
      setError("Report submission failed");
    } finally {
      setSubmitting(null);
    }
  };

  const dashboard = overview?.dashboard;
  const requirements = dashboard?.status ?? [];
  const history = overview?.history ?? [];

  const filteredRequirements = useMemo(() => {
    if (!reqCategory) return requirements;
    return requirements.filter((r) => r.category === reqCategory || r.id === reqCategory);
  }, [requirements, reqCategory]);

  const flatIssues = useMemo(() => {
    const fromReqs = requirements.flatMap((r) =>
      (r.issues ?? []).map((issue) => ({ ...issue, requirement: r.requirement, reqCategory: r.category }))
    );
    if (fromReqs.length > 0) return fromReqs;
    return (dashboard?.issues ?? []).map((issue) => ({ ...issue, requirement: "", reqCategory: issue.category }));
  }, [requirements, dashboard?.issues]);

  const filteredIssues = useMemo(() => {
    const q = issueSearch.trim().toLowerCase();
    return flatIssues.filter((issue) => {
      if (issueCategory && issue.category !== issueCategory) return false;
      if (!q) return true;
      return (
        issue.staff.toLowerCase().includes(q) ||
        issue.detail.toLowerCase().includes(q) ||
        issue.category.toLowerCase().includes(q)
      );
    });
  }, [flatIssues, issueSearch, issueCategory]);

  const issuePagination = usePagination(filteredIssues, 15, `${issueSearch}-${issueCategory}`);
  const historyPagination = usePagination(history, 10, historyType);

  const breakdownChart = useMemo(() => {
    const breakdown = dashboard?.issueBreakdown ?? {};
    return Object.entries(breakdown)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => ({
        category: CATEGORY_LABELS[key] ?? key,
        key,
        count,
        fill: CATEGORY_COLORS[key] ?? "#64748b",
      }))
      .sort((a, b) => b.count - a.count);
  }, [dashboard?.issueBreakdown]);

  const staffIssues = dashboard?.staffIssues ?? dashboard?.totalIssues ?? 0;
  const failedReqs = dashboard?.failedRequirements ?? dashboard?.violations ?? 0;
  const warningReqs = dashboard?.warningRequirements ?? dashboard?.warnings ?? 0;
  const complianceScore = dashboard?.complianceScore ?? 0;

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "requirements", label: "Requirements" },
    { id: "submissions", label: "Submissions" },
    { id: "history", label: "History" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <Shield className="h-7 w-7 text-teal-600" />
            Compliance & Regulatory Reporting
          </h2>
          <p className="mt-1 text-slate-600">
            Live staffing rule checks, mandate templates, and regulatory submissions
          </p>
          {overview?.schedulingRules && (
            <p className="mt-1 text-xs text-slate-500">
              Rules from Configuration: max {overview.schedulingRules.maxHoursPerWeek}h/week ·{" "}
              {overview.schedulingRules.restBetweenShifts}h rest between shifts
              {overview.counts.staff > 0 && (
                <> · monitoring {overview.counts.staff.toLocaleString()} staff across {overview.counts.departments} departments</>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={runScan}
            disabled={scanning || !overview?.canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
            {scanning ? "Scanning…" : "Run compliance scan"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="rounded-lg border border-teal-100 bg-teal-50/50 p-4">
        <p className="flex items-start gap-2 text-sm font-medium text-teal-900">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
          What this page checks
        </p>
        <ul className="mt-2 grid gap-1.5 text-sm text-slate-600 sm:grid-cols-2">
          <li className="flex gap-2">
            <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400" />
            Work hours and rest gaps from live schedules (last 7 days)
          </li>
          <li className="flex gap-2">
            <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400" />
            Certification expiry and mandatory training completion
          </li>
          <li className="flex gap-2">
            <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400" />
            Today&apos;s schedule conflicts (double booking, leave, skill mix)
          </li>
          <li className="flex gap-2">
            <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400" />
            Generate WHO, JCI, EU, and state board reports for audit trails
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === t.id ? "bg-teal-500 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !dashboard && (
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <ChartSkeleton key={i} className="h-28" />
          ))}
        </div>
      )}

      {!loading && dashboard && tab === "overview" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard
              label="Compliance score"
              value={`${complianceScore}%`}
              sub={`${requirements.filter((r) => r.status === "compliant").length} of ${requirements.length} requirements passing`}
              icon={<Shield className="h-5 w-5 text-teal-600" />}
              accent="bg-teal-100"
            />
            <KpiCard
              label="Overall status"
              value={overallLabel(dashboard.overallStatus)}
              sub={dashboard.overallStatus === "compliant" ? "All checks passing" : "Action may be required"}
              icon={
                dashboard.overallStatus === "compliant" ? (
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                )
              }
              accent={
                dashboard.overallStatus === "compliant" ? "bg-emerald-100" : "bg-amber-100"
              }
            />
            <KpiCard
              label="Failed requirements"
              value={failedReqs}
              sub="Rule categories in violation"
              icon={<XCircle className="h-5 w-5 text-rose-600" />}
              accent="bg-rose-100"
            />
            <KpiCard
              label="Staff-level issues"
              value={staffIssues.toLocaleString()}
              sub={
                dashboard.issuesTruncated
                  ? `Showing first ${dashboard.issues?.length ?? 0} in detail`
                  : `${dashboard.conflictsToday} schedule conflicts today`
              }
              icon={<Users className="h-5 w-5 text-rose-600" />}
              accent="bg-rose-50"
            />
            <KpiCard
              label="Warnings"
              value={warningReqs}
              sub={`${overview?.counts.queuedSubmissions ?? 0} queued submission(s)`}
              icon={<Clock className="h-5 w-5 text-amber-600" />}
              accent="bg-amber-100"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-1 font-semibold text-slate-800">Staff issues by category</h3>
              <p className="mb-4 text-xs text-slate-500">Rolling 7-day hours, rest gaps, and today&apos;s conflicts</p>
              {breakdownChart.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 text-sm text-slate-500">
                  <CheckCircle className="mb-2 h-8 w-8 text-emerald-400" />
                  No staff-level issues detected
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={breakdownChart} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="category" width={120} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number) => [value.toLocaleString(), "Issues"]}
                      contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {breakdownChart.map((entry) => (
                        <Cell key={entry.key} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 font-semibold text-slate-800">Requirements at a glance</h3>
              <div className="space-y-3">
                {requirements.map((item) => {
                  const link = remediationLink(item.category);
                  return (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        {item.status === "compliant" ? (
                          <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                        ) : item.status === "warning" ? (
                          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                        ) : (
                          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800">{item.requirement}</p>
                          <p className="text-sm text-slate-500">{item.value}</p>
                          {link && item.status !== "compliant" && (
                            <Link
                              href={link.href}
                              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
                            >
                              {link.label}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {overview?.lastScan && (
            <p className="text-xs text-slate-500">
              Last saved scan: {overview.lastScan.status} ·{" "}
              {overview.lastScan.value ?? overview.lastScan.requirement} ·{" "}
              {overview.lastScan.recordedAt ? new Date(overview.lastScan.recordedAt).toLocaleString() : "—"}
            </p>
          )}
        </>
      )}

      {dashboard && tab === "requirements" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <select
              value={reqCategory}
              onChange={(e) => setReqCategory(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">All requirements</option>
              {requirements.map((r) => (
                <option key={r.id} value={r.category}>
                  {r.requirement}
                </option>
              ))}
            </select>
          </div>

          {filteredRequirements.map((item) => {
            const link = remediationLink(item.category);
            return (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      {CATEGORY_LABELS[item.category] ?? item.category}
                    </p>
                    <h3 className="font-semibold text-slate-800">{item.requirement}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {link && item.status !== "compliant" && (
                      <Link
                        href={link.href}
                        className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100"
                      >
                        {link.label}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(item.status)}`}>
                      {item.status}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-slate-600">{item.value}</p>
                {(item.issues?.length ?? 0) > 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    {item.totalIssues ?? item.issues!.length} issue(s) detected
                    {item.issuesTruncated && " — list truncated for performance"}
                  </p>
                )}
              </div>
            );
          })}

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-800">Staff-level issue detail</h3>
                <p className="text-xs text-slate-500">
                  Search by staff name or issue detail · {filteredIssues.length.toLocaleString()} matching
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={issueCategory}
                  onChange={(e) => setIssueCategory(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">All categories</option>
                  <option value="work_hours">Work hours</option>
                  <option value="rest">Rest periods</option>
                  <option value="scheduling">Schedule conflicts</option>
                </select>
                <ListSearchBar value={issueSearch} onChange={setIssueSearch} placeholder="Search staff or detail…" />
              </div>
            </div>
            {issuePagination.totalItems === 0 ? (
              <p className="text-sm text-slate-500">No staff-level issues match your filters.</p>
            ) : (
              <>
                <ul className="space-y-2 text-sm">
                  {issuePagination.paginatedItems.map((issue, i) => (
                    <li
                      key={`${issue.staff}-${issue.detail}-${i}`}
                      className="grid gap-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 sm:grid-cols-[1fr_2fr_auto]"
                    >
                      <span className="font-medium text-slate-800">{issue.staff}</span>
                      <span className="text-slate-600">{issue.detail}</span>
                      <span className="text-xs text-slate-400">
                        {CATEGORY_LABELS[issue.category] ?? issue.category}
                      </span>
                    </li>
                  ))}
                </ul>
                <Pagination
                  className="mt-4"
                  page={issuePagination.page}
                  pageSize={issuePagination.pageSize}
                  totalItems={issuePagination.totalItems}
                  totalPages={issuePagination.totalPages}
                  onPageChange={issuePagination.setPage}
                  onPageSizeChange={issuePagination.setPageSize}
                />
              </>
            )}
          </div>
        </div>
      )}

      {tab === "submissions" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-1 flex items-center gap-2 font-semibold text-slate-800">
              <FileText className="h-5 w-5 text-teal-600" /> Mandate templates
            </h3>
            <p className="mb-4 text-xs text-slate-500">Reference frameworks for workforce compliance documentation</p>
            <div className="space-y-3">
              {(overview?.templates ?? []).map((t) => (
                <div key={t.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-800">{t.name}</p>
                      <p className="text-sm text-slate-500">
                        {t.regulator} · {t.frequency}
                        {t.lastUpdated && ` · updated ${t.lastUpdated}`}
                      </p>
                      {t.description && <p className="mt-1 text-xs text-slate-500">{t.description}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={submitting === t.submissionId}
                        onClick={() => handleSubmit(t.submissionId, t.id)}
                        className="rounded-lg bg-teal-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
                      >
                        {submitting === t.submissionId ? "Generating…" : "Generate report"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          apiDownload(`/api/compliance/export/${t.submissionId}`, `${t.submissionId}_report.csv`)
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-teal-700 hover:bg-teal-50"
                      >
                        <Download className="h-4 w-4" />
                        CSV
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-1 flex items-center gap-2 font-semibold text-slate-800">
              <ClipboardList className="h-5 w-5 text-teal-600" /> Regulatory submissions
            </h3>
            <p className="mb-4 text-xs text-slate-500">Queue filings with current compliance snapshot attached</p>
            <div className="space-y-3">
              {(dashboard?.submissions ?? overview?.submissionForms ?? []).map((s) => (
                <div key={s.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-800">{s.name}</p>
                      <p className="text-sm text-slate-500">{s.description}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {s.regulator}
                        {s.frequency && ` · ${s.frequency}`}
                        {s.status && (
                          <span className={`ml-2 rounded px-1.5 py-0.5 ${statusBadgeClass(s.status)}`}>
                            {s.status}
                          </span>
                        )}
                        {s.lastSubmittedAt && (
                          <span className="ml-2">
                            Last: {new Date(s.lastSubmittedAt).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={submitting === s.id}
                        onClick={() => handleSubmit(s.id, s.templateId)}
                        className="rounded-lg bg-teal-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
                      >
                        {submitting === s.id ? "Generating…" : "Generate & queue"}
                      </button>
                      <button
                        type="button"
                        onClick={() => apiDownload(`/api/compliance/export/${s.id}`, `${s.id}_report.csv`)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-teal-700 hover:bg-teal-50"
                      >
                        <Download className="h-4 w-4" />
                        CSV
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 font-semibold text-slate-800">
              <History className="h-5 w-5 text-teal-600" /> Audit history
            </h3>
            <select
              value={historyType}
              onChange={(e) => setHistoryType(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">All records</option>
              <option value="scan">Scans</option>
              <option value="submission">Submissions</option>
              <option value="requirement_check">Requirement checks</option>
            </select>
          </div>
          {historyPagination.totalItems === 0 ? (
            <p className="text-sm text-slate-500">No history yet — run a compliance scan or submit a report.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3">Type</th>
                    <th className="pb-2 pr-3">Requirement</th>
                    <th className="pb-2 pr-3">Status</th>
                    <th className="pb-2">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {historyPagination.paginatedItems.map((h) => (
                    <tr key={h.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="py-2 pr-3 whitespace-nowrap text-slate-600">
                        {h.recordedAt ? new Date(h.recordedAt).toLocaleString() : "—"}
                      </td>
                      <td className="py-2 pr-3 capitalize text-slate-600">
                        {h.recordType?.replace(/_/g, " ") ?? "—"}
                      </td>
                      <td className="py-2 pr-3 font-medium text-slate-800">{h.requirement}</td>
                      <td className="py-2 pr-3">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(h.status)}`}>
                          {h.status}
                        </span>
                      </td>
                      <td className="py-2 text-slate-600">{h.value ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            className="mt-4"
            page={historyPagination.page}
            pageSize={historyPagination.pageSize}
            totalItems={historyPagination.totalItems}
            totalPages={historyPagination.totalPages}
            onPageChange={historyPagination.setPage}
            onPageSizeChange={historyPagination.setPageSize}
          />
        </div>
      )}
    </div>
  );
}
