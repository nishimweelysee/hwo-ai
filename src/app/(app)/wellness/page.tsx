"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { scheduleStaffPath } from "@/lib/scheduling-links";
import { usePermissions } from "@/hooks/use-permissions";
import {
  filterWellnessAlerts,
  filterWellnessRecords,
  staffToSearchableOptions,
  type StaffLike,
} from "@/lib/searchable-options";
import { SearchableSelect } from "@/components/searchable-select";
import { ListSearchBar } from "@/components/list-search-bar";
import { StaffWeekShiftsPanel } from "@/components/staff-week-shifts-panel";
import { usePagination } from "@/hooks/use-pagination";
import { Pagination } from "@/components/pagination";
import { Heart, AlertTriangle, TrendingUp, ClipboardList, MessageSquare, Sparkles, Calendar } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Alert = {
  id?: string;
  staff: string;
  staffId?: string;
  email?: string;
  userId?: string;
  risk: string;
  overtime: number;
  department: string;
  aiRisk?: string;
  aiRiskProbability?: number;
  aiRecommendedIntervention?: string;
  aiTopFactors?: { factor: string; weight?: number; contribution_pct?: number; recommended_action?: string }[];
  aiWhyFlagged?: string;
  aiExplainability?: { why_flagged?: string; recommended_action?: string; methodology?: string };
};

type Intervention = {
  id: string;
  staffId?: string;
  staffName?: string;
  title: string;
  description: string;
  status: string;
  type?: string;
};

type WellnessRecord = {
  id: string;
  staffId: string;
  staffName?: string;
  department?: string;
  date?: string;
  overtime: number;
  riskLevel: string;
  score?: number;
};

type FeedbackItem = {
  id: string;
  rating?: number;
  message?: string;
  anonymous?: boolean;
  createdAt?: string;
  sentiment?: string;
  urgency?: string;
  themes?: string[];
};

const DEFAULT_INTERVENTION_TYPES = [
  "Reduce overtime",
  "Wellness check-in",
  "Peer support",
  "Schedule adjustment",
  "Mental health referral",
];

export default function WellnessPage() {
  const { manageSettings } = usePermissions();
  const [interventionTypes, setInterventionTypes] = useState<string[]>(DEFAULT_INTERVENTION_TYPES);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [atRiskCount, setAtRiskCount] = useState(0);
  const [avgOvertime, setAvgOvertime] = useState(0);
  const [wellnessTrend, setWellnessTrend] = useState<{ month: string; score: number }[]>([]);
  const [avgScore, setAvgScore] = useState(0);
  const [trendLabel, setTrendLabel] = useState("");
  const [surveyResponseRate, setSurveyResponseRate] = useState(0);
  const [aiWellnessActive, setAiWellnessActive] = useState(false);
  const [modelInfo, setModelInfo] = useState<Record<string, unknown> | null>(null);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [records, setRecords] = useState<WellnessRecord[]>([]);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [weekShiftsStaffId, setWeekShiftsStaffId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [alertSearch, setAlertSearch] = useState("");
  const [feedbackSearch, setFeedbackSearch] = useState("");

  const loadData = useCallback(() => {
    apiFetch("/api/wellness/meta")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.interventionTypes) && data.interventionTypes.length > 0) {
          setInterventionTypes(data.interventionTypes);
        }
      });
    apiFetch("/api/wellness")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
          setAtRiskCount(data.atRiskCount ?? 0);
          setAvgOvertime(data.avgOvertime ?? 0);
          setSurveyResponseRate(data.surveyResponseRate ?? 0);
          setAiWellnessActive(Boolean(data.aiWellnessActive ?? data.aiServiceHealthy));
        }
      });
    apiFetch("/api/wellness/ai/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setAiWellnessActive(Boolean(data.aiServiceHealthy));
      });
    apiFetch("/api/wellness/ai/model-info")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setModelInfo(data);
      });
    apiFetch("/api/wellness/trend")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          const series = Array.isArray(data.trend) ? data.trend : [];
          setWellnessTrend(series);
          setAvgScore(data.avgScore ?? 0);
          setTrendLabel(data.trendLabel ?? "");
        }
      });
    apiFetch("/api/wellness/interventions")
      .then((r) => (r.ok ? r.json() : []))
      .then(setInterventions);
    if (manageSettings) {
      apiFetch("/api/wellness/records")
        .then((r) => (r.ok ? r.json() : []))
        .then(setRecords);
      apiFetch("/api/wellness/feedback")
        .then((r) => (r.ok ? r.json() : []))
        .then(setFeedback);
    }
  }, [manageSettings]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const assignIntervention = async (alert: Alert, type: string) => {
    if (!alert.staffId) return;
    const interventionType = type || alert.aiRecommendedIntervention || "Wellness check-in";
    const res = await apiFetch("/api/wellness/interventions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId: alert.staffId, type: interventionType, status: "active" }),
    });
    if (res.ok) {
      setStatusMessage(`Assigned "${interventionType}" to ${alert.staff}`);
      setSelectedStaffId(null);
      loadData();
    }
  };

  const completeIntervention = async (id: string) => {
    const res = await apiFetch(`/api/wellness/interventions/${id}/complete`, { method: "PATCH" });
    if (res.ok) loadData();
  };

  const deleteIntervention = async (id: string) => {
    const res = await apiFetch(`/api/wellness/interventions/${id}`, { method: "DELETE" });
    if (res.ok) loadData();
  };

  const deleteRecord = async (id: string) => {
    const res = await apiFetch(`/api/wellness/records/${id}`, { method: "DELETE" });
    if (res.ok) loadData();
  };

  const deleteFeedbackItem = async (id: string) => {
    const res = await apiFetch(`/api/wellness/feedback/${id}`, { method: "DELETE" });
    if (res.ok) loadData();
  };

  const filteredAlerts = useMemo(() => filterWellnessAlerts(alerts, alertSearch), [alerts, alertSearch]);
  const alertsPagination = usePagination(filteredAlerts, 8, alertSearch);

  const filteredFeedback = useMemo(() => {
    const q = feedbackSearch.trim().toLowerCase();
    if (!q) return feedback;
    return feedback.filter((item) => {
      const haystack = [
        item.id,
        item.message,
        item.sentiment,
        item.urgency,
        item.rating != null ? String(item.rating) : "",
        item.createdAt,
        ...(item.themes ?? []),
        item.anonymous ? "anonymous" : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return q.split(/\s+/).every((token) => haystack.includes(token));
    });
  }, [feedback, feedbackSearch]);
  const feedbackPagination = usePagination(filteredFeedback, 10, feedbackSearch);

  const filteredInterventions = selectedStaffId
    ? interventions.filter((i) => i.staffId === selectedStaffId)
    : interventions;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
          <Heart className="h-7 w-7 text-rose-500" />
          Staff Wellness & Burnout Prevention
        </h2>
        <p className="mt-1 text-slate-600">Monitor wellness indicators, assign interventions, and prevent burnout</p>
        {statusMessage && <p className="mt-2 text-sm text-emerald-600">{statusMessage}</p>}
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            aiWellnessActive
              ? "border-violet-200 bg-violet-50 text-violet-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <p className="flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4" />
            AI Wellness: {aiWellnessActive ? "Active" : "Offline — using rule-based fallback"}
          </p>
          {aiWellnessActive && (
            <p className="mt-1 text-xs opacity-80">
              HistGradientBoostingClassifier — explainable burnout risk with feature contributions, F1/ROC-AUC metrics, and actionable recommendations
            </p>
          )}
        </div>
      </div>

      {modelInfo && aiWellnessActive && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-5">
          <h3 className="mb-2 font-semibold text-violet-900">AI Methodology & Model Evaluation</h3>
          <p className="text-sm text-violet-800">
            <span className="font-medium">Model:</span>{" "}
            {String(modelInfo.model_name ?? "HWO Burnout Risk Classifier")} —{" "}
            {String((modelInfo.metrics as Record<string, unknown>)?.algorithm ?? "HistGradientBoostingClassifier")}
          </p>
          {typeof modelInfo.metrics === "object" && modelInfo.metrics !== null ? (
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              {["accuracy", "precision", "recall", "f1_score", "roc_auc"].map((key) => {
                const val = (modelInfo.metrics as Record<string, number>)[key];
                if (val == null) return null;
                return (
                  <span key={key} className="rounded bg-white px-2 py-1 font-medium text-violet-700">
                    {key.replace("_", "-").toUpperCase()}: {(val * (val <= 1 ? 100 : 1)).toFixed(1)}
                    {val <= 1 ? "%" : ""}
                  </span>
                );
              })}
            </div>
          ) : null}
          <p className="mt-2 text-xs text-violet-700">
            Inputs: overtime, wellness score, weekly hours, score trend, consecutive night shifts, shift irregularity.
            Contributions use feature-ablation (SHAP-style approximation) plus domain rules.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={AlertTriangle} color="rose" label="At-Risk Staff" value={String(atRiskCount)} sub="Elevated burnout risk" />
        <KpiCard icon={TrendingUp} color="amber" label="Avg Overtime (hrs)" value={String(avgOvertime)} sub="Last 7 days per staff" />
        <KpiCard icon={Heart} color="emerald" label="Wellness Score" value={`${avgScore}/100`} sub={trendLabel ? `Trend: ${trendLabel}` : "Overall average"} />
        <KpiCard icon={ClipboardList} color="teal" label="Survey Response Rate" value={`${surveyResponseRate}%`} sub="Staff check-ins" />
      </div>

      {trendLabel && (
        <p className="text-sm text-slate-500">
          Trend: <span className="font-medium text-slate-700">{trendLabel}</span>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-semibold text-slate-800">Wellness Trend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={wellnessTrend.length ? wellnessTrend : [{ month: "—", score: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="score" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-800">Burnout Risk Alerts</h3>
              <p className="mt-1 text-xs text-slate-500">
                High overtime comes from scheduled shifts (last 7 days). Use <strong>View schedule</strong> to reassign or remove shifts, then assign wellness interventions.
              </p>
            </div>
            <ListSearchBar value={alertSearch} onChange={setAlertSearch} placeholder="Search staff, email, department, risk…" className="sm:max-w-xs" />
          </div>
          <div className="space-y-3">
            {filteredAlerts.length === 0 && <p className="text-sm text-slate-500">No at-risk staff alerts</p>}
            {alertsPagination.paginatedItems.map((alert, i) => (
              <div key={alert.id || alert.userId || i} className="rounded-lg border border-slate-200 p-4">
                <p className="font-medium text-slate-800">{alert.staff}</p>
                {alert.email && <p className="text-xs text-teal-600">{alert.email}</p>}
                <p className="text-sm text-slate-500">{alert.department}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      alert.risk === "high" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {alert.risk} risk
                  </span>
                  <span className="text-sm text-slate-600">+{alert.overtime}hr overtime</span>
                </div>
                {alert.aiRisk && (
                  <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50/60 p-3">
                    <p className="text-sm font-medium text-violet-900">
                      Burnout Risk: {alert.aiRisk.charAt(0).toUpperCase() + alert.aiRisk.slice(1)}
                      {alert.aiRiskProbability != null && ` (${(alert.aiRiskProbability * 100).toFixed(0)}%)`}
                    </p>
                    {(alert.aiWhyFlagged || alert.aiExplainability?.why_flagged) && (
                      <p className="mt-1 text-xs text-violet-800">
                        {alert.aiWhyFlagged || alert.aiExplainability?.why_flagged}
                      </p>
                    )}
                    {alert.aiTopFactors && alert.aiTopFactors.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold text-violet-900">Main contributing factors:</p>
                        <ul className="mt-1 space-y-1">
                          {alert.aiTopFactors.map((f, idx) => (
                            <li key={idx} className="text-xs text-violet-800">
                              • {f.factor}
                              {f.contribution_pct != null && ` (+${f.contribution_pct}%)`}
                              {f.recommended_action && (
                                <span className="block pl-3 text-violet-600">→ {f.recommended_action}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {alert.aiRecommendedIntervention && (
                      <p className="mt-2 text-xs font-medium text-teal-700">
                        Recommended action: {alert.aiRecommendedIntervention}
                      </p>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedStaffId(selectedStaffId === alert.staffId ? null : alert.staffId ?? null)}
                  className="mt-3 text-sm font-medium text-teal-600 hover:text-teal-700"
                >
                  {selectedStaffId === alert.staffId ? "Hide intervention options" : "View intervention options"}
                </button>
                {alert.staffId && (
                  <div className="mt-2 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setWeekShiftsStaffId(
                          weekShiftsStaffId === alert.staffId ? null : alert.staffId ?? null
                        )
                      }
                      className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-slate-900"
                    >
                      <Calendar className="h-4 w-4" />
                      {weekShiftsStaffId === alert.staffId
                        ? "Hide this week's shifts"
                        : "This week's shifts"}
                    </button>
                    <Link
                      href={scheduleStaffPath(alert.staffId, alert.staff)}
                      className="text-sm font-medium text-teal-700 hover:text-teal-800"
                    >
                      Open scheduling
                    </Link>
                    <Link
                      href="/workload-analysis"
                      className="text-sm font-medium text-slate-600 hover:text-slate-800"
                    >
                      Workload analysis
                    </Link>
                  </div>
                )}
                {alert.staffId && (
                  <StaffWeekShiftsPanel
                    staffId={alert.staffId}
                    staffName={alert.staff}
                    expanded={weekShiftsStaffId === alert.staffId}
                  />
                )}
                {selectedStaffId === alert.staffId && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {alert.aiRecommendedIntervention && (
                      <button
                        type="button"
                        onClick={() => assignIntervention(alert, alert.aiRecommendedIntervention!)}
                        className="rounded-lg border border-violet-300 bg-violet-100 px-2 py-1 text-xs font-medium text-violet-800 hover:bg-violet-200"
                      >
                        AI pick: {alert.aiRecommendedIntervention}
                      </button>
                    )}
                    {interventionTypes.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => assignIntervention(alert, type)}
                        className="rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-100"
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {filteredAlerts.length > 0 && (
            <Pagination
              className="mt-4"
              page={alertsPagination.page}
              pageSize={alertsPagination.pageSize}
              totalItems={alertsPagination.totalItems}
              totalPages={alertsPagination.totalPages}
              onPageChange={alertsPagination.setPage}
              onPageSizeChange={alertsPagination.setPageSize}
            />
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-800">
          {selectedStaffId ? "Interventions for selected staff" : "Recommended interventions"}
        </h3>
        <InterventionsPanel
          interventions={filteredInterventions}
          manageSettings={manageSettings}
          interventionTypes={interventionTypes}
          onComplete={completeIntervention}
          onDelete={deleteIntervention}
          onRefresh={loadData}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-semibold text-slate-800">Staff Satisfaction Survey</h3>
          <WellnessSurvey onSubmitted={loadData} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-semibold text-slate-800">Daily Check-in</h3>
          <DailyCheckin onSubmitted={loadData} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-800">Anonymous Feedback</h3>
        <AnonymousFeedback onSubmitted={loadData} />
      </div>

      {manageSettings && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-slate-600" />
              <h3 className="font-semibold text-slate-800">Wellness Records (Admin)</h3>
            </div>
            <RecordsAdminPanel records={records} onDelete={deleteRecord} onRefresh={loadData} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-slate-600" />
                <h3 className="font-semibold text-slate-800">Feedback Inbox (Admin)</h3>
              </div>
              <ListSearchBar value={feedbackSearch} onChange={setFeedbackSearch} placeholder="Search message, sentiment, themes…" className="sm:max-w-xs" />
            </div>
            {filteredFeedback.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center">
                <MessageSquare className="mb-3 h-8 w-8 text-slate-300" />
                <p className="font-medium text-slate-600">No feedback submitted yet</p>
                <p className="mt-1 text-sm text-slate-400">Staff can submit anonymous feedback using the form below.</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {feedbackPagination.paginatedItems.map((item) => (
                    <div key={item.id} className="flex items-start justify-between rounded-lg border border-slate-100 p-3 text-sm">
                      <div>
                        <p className="text-slate-800">{item.message || "(no message)"}</p>
                        <p className="text-xs text-slate-500">
                          {item.createdAt} · Rating: {item.rating ?? "—"}
                          {item.anonymous ? " · Anonymous" : ""}
                          {item.sentiment && ` · ${item.sentiment}`}
                          {item.urgency && item.urgency !== "low" && ` · ${item.urgency} urgency`}
                          {item.themes && item.themes.length > 0 && ` · ${item.themes.join(", ")}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteFeedbackItem(item.id)}
                        className="text-xs text-rose-600 hover:text-rose-700"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
                <Pagination
                  className="mt-4"
                  page={feedbackPagination.page}
                  pageSize={feedbackPagination.pageSize}
                  totalItems={feedbackPagination.totalItems}
                  totalPages={feedbackPagination.totalPages}
                  onPageChange={feedbackPagination.setPage}
                  onPageSizeChange={feedbackPagination.setPageSize}
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  color,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: "rose" | "amber" | "emerald" | "teal";
  label: string;
  value: string;
  sub?: string;
}) {
  const colors = {
    rose: "bg-rose-100 text-rose-600",
    amber: "bg-amber-100 text-amber-600",
    emerald: "bg-emerald-100 text-emerald-600",
    teal: "bg-teal-100 text-teal-600",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-2 ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function WellnessSurvey({ onSubmitted }: { onSubmitted: () => void }) {
  const [questions, setQuestions] = useState<{ id: string; text: string; type: string }[]>([]);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    apiFetch("/api/wellness/survey")
      .then((r) => (r.ok ? r.json() : { questions: [] }))
      .then((d: { questions?: { id: string; text: string; type: string }[] }) => setQuestions(d.questions || []));
  }, []);

  const handleSubmit = async () => {
    const res = await apiFetch("/api/wellness/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answers),
    });
    if (res.ok) {
      setSubmitted(true);
      onSubmitted();
    }
  };

  if (submitted) return <p className="text-emerald-600">Thank you for completing the survey.</p>;

  return (
    <div className="space-y-4">
      {questions.map((q) => (
        <div key={q.id}>
          <p className="text-sm text-slate-700">{q.text}</p>
          {q.type === "scale" && (
            <div className="mt-1 flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: n }))}
                  className={`rounded px-2 py-1 text-sm ${answers[q.id] === n ? "bg-teal-500 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          {q.type === "number" && (
            <input
              type="number"
              min={0}
              max={80}
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: Number(e.target.value) }))}
              className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm"
              placeholder="Hours"
            />
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={handleSubmit}
        className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600"
      >
        Submit
      </button>
    </div>
  );
}

function DailyCheckin({ onSubmitted }: { onSubmitted: () => void }) {
  const [score, setScore] = useState(75);
  const [overtime, setOvertime] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    const res = await apiFetch("/api/wellness/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, overtime }),
    });
    if (res.ok) {
      setSubmitted(true);
      onSubmitted();
    }
  };

  if (submitted) return <p className="text-emerald-600">Check-in recorded. Thank you!</p>;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-700">Wellness score (0–100)</p>
        <input
          type="range"
          min={0}
          max={100}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          className="mt-1 w-full"
        />
        <p className="text-sm font-medium text-slate-800">{score}</p>
      </div>
      <div>
        <p className="text-sm text-slate-700">Overtime hours this week</p>
        <input
          type="number"
          min={0}
          max={80}
          value={overtime}
          onChange={(e) => setOvertime(Number(e.target.value))}
          className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600"
      >
        Check in
      </button>
    </div>
  );
}

function AnonymousFeedback({ onSubmitted }: { onSubmitted: () => void }) {
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [analysis, setAnalysis] = useState<{ sentiment?: string; urgency?: string } | null>(null);

  const handleSubmit = async () => {
    const res = await apiFetch("/api/wellness/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymous: true, rating, message }),
    });
    if (res.ok) {
      const data = await res.json();
      setAnalysis({ sentiment: data.sentiment, urgency: data.urgency });
      setSubmitted(true);
      onSubmitted();
    }
  };

  if (submitted) {
    return (
      <div className="text-emerald-600">
        <p>Thank you for your feedback.</p>
        {analysis?.sentiment && (
          <p className="mt-1 text-sm text-violet-700">
            AI analysis: {analysis.sentiment} sentiment
            {analysis.urgency ? ` · ${analysis.urgency} urgency` : ""}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-700">Rate your wellness (1-5)</p>
        <div className="mt-1 flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className={`rounded px-2 py-1 text-sm ${rating === n ? "bg-teal-500 text-white" : "bg-slate-100"}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm text-slate-700">Comments (optional)</p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mt-1 w-full rounded border border-slate-200 p-2 text-sm"
          rows={3}
        />
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600"
      >
        Submit anonymously
      </button>
    </div>
  );
}

function InterventionsPanel({
  interventions,
  manageSettings,
  interventionTypes,
  onComplete,
  onDelete,
  onRefresh,
}: {
  interventions: Intervention[];
  manageSettings: boolean;
  interventionTypes: string[];
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) {
  const [newType, setNewType] = useState(interventionTypes[0] ?? "Wellness check-in");

  useEffect(() => {
    if (interventionTypes.length > 0 && !interventionTypes.includes(newType)) {
      setNewType(interventionTypes[0]);
    }
  }, [interventionTypes, newType]);

  const createTemplate = async () => {
    const res = await apiFetch("/api/wellness/interventions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: newType, status: "planned" }),
    });
    if (res.ok) onRefresh();
  };

  if (interventions.length === 0) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center">
          <ClipboardList className="mb-3 h-8 w-8 text-slate-300" />
          <p className="font-medium text-slate-600">No interventions yet</p>
          <p className="mt-1 text-sm text-slate-400">Assign an intervention from a burnout alert above, or add a template below.</p>
        </div>
        {manageSettings && (
          <div className="mt-3 flex gap-2">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="rounded border border-slate-200 px-2 py-1 text-sm"
            >
              {interventionTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button type="button" onClick={createTemplate} className="text-sm text-teal-600 hover:text-teal-700">
              Add template
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {interventions.map((i) => (
        <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3 text-sm">
          <div>
            <p className="font-medium text-slate-800">{i.title}</p>
            <p className="text-slate-500">
              {i.staffName ? `${i.staffName} · ` : ""}
              {i.description} · Status: {i.status}
            </p>
          </div>
          <div className="flex gap-2">
            {i.status !== "completed" && (
              <button type="button" onClick={() => onComplete(i.id)} className="text-xs text-teal-600 hover:text-teal-700">
                Mark complete
              </button>
            )}
            {manageSettings && (
              <button type="button" onClick={() => onDelete(i.id)} className="text-xs text-rose-600 hover:text-rose-700">
                Delete
              </button>
            )}
          </div>
        </div>
      ))}
      {manageSettings && (
        <div className="mt-3 flex gap-2">
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="rounded border border-slate-200 px-2 py-1 text-sm"
          >
            {interventionTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button type="button" onClick={createTemplate} className="text-sm text-teal-600 hover:text-teal-700">
            Add template
          </button>
        </div>
      )}
    </div>
  );
}

function RecordsAdminPanel({
  records,
  onDelete,
  onRefresh,
}: {
  records: WellnessRecord[];
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) {
  const [staffList, setStaffList] = useState<StaffLike[]>([]);
  const [staffId, setStaffId] = useState("");
  const [overtime, setOvertime] = useState(0);
  const [riskLevel, setRiskLevel] = useState("low");
  const [score, setScore] = useState(80);
  const [recordSearch, setRecordSearch] = useState("");

  useEffect(() => {
    apiFetch("/api/staff?limit=500")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: StaffLike[]) => setStaffList(Array.isArray(rows) ? rows : []));
  }, []);

  const staffOptions = useMemo(() => staffToSearchableOptions(staffList), [staffList]);
  const filteredRecords = useMemo(() => filterWellnessRecords(records, recordSearch), [records, recordSearch]);
  const recordsPagination = usePagination(filteredRecords, 10, recordSearch);

  const createRecord = async () => {
    if (!staffId.trim()) return;
    const res = await apiFetch("/api/wellness/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId: staffId.trim(), overtime, riskLevel, score }),
    });
    if (res.ok) {
      setStaffId("");
      onRefresh();
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-4">
        <SearchableSelect
          label="Staff"
          value={staffId}
          options={staffOptions}
          onChange={setStaffId}
          placeholder="Select staff"
        />
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Overtime (hours)</span>
          <input
            type="number"
            placeholder="Overtime"
            value={overtime}
            onChange={(e) => setOvertime(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Risk level</span>
          <select
            value={riskLevel}
            onChange={(e) => setRiskLevel(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
        <button type="button" onClick={createRecord} className="self-end rounded-lg bg-teal-500 px-3 py-2 text-sm font-medium text-white hover:bg-teal-600">
          Add record
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">{filteredRecords.length} record{filteredRecords.length === 1 ? "" : "s"}</p>
        <ListSearchBar value={recordSearch} onChange={setRecordSearch} placeholder="Search staff, date, risk, score…" className="sm:max-w-xs" />
      </div>
      {filteredRecords.length === 0 ? (
        <p className="text-sm text-slate-500">No wellness records.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-4">Staff</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Risk</th>
                  <th className="py-2 pr-4">Overtime</th>
                  <th className="py-2 pr-4">Score</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recordsPagination.paginatedItems.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                    <td className="py-2 pr-4">{r.staffName ?? r.staffId}</td>
                    <td className="py-2 pr-4">{r.date ?? "—"}</td>
                    <td className="py-2 pr-4">{r.riskLevel}</td>
                    <td className="py-2 pr-4">+{r.overtime}h</td>
                    <td className="py-2 pr-4">{r.score ?? "—"}</td>
                    <td className="py-2">
                      <button type="button" onClick={() => onDelete(r.id)} className="text-xs text-rose-600">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            className="mt-4"
            page={recordsPagination.page}
            pageSize={recordsPagination.pageSize}
            totalItems={recordsPagination.totalItems}
            totalPages={recordsPagination.totalPages}
            onPageChange={recordsPagination.setPage}
            onPageSizeChange={recordsPagination.setPageSize}
          />
        </>
      )}
    </div>
  );
}
