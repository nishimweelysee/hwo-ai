import { printReportHtml, riskBadge, table } from "@/lib/report-print";

export type WellnessReportData = {
  title: string;
  generatedAt: string;
  avgScore: number;
  trendLabel: string;
  summary: {
    atRiskCount?: number;
    avgOvertime?: number;
    surveyResponseRate?: number;
    feedbackCount?: number;
    interventionCount?: number;
    activeInterventions?: number;
    alerts?: Array<{
      staff: string;
      department: string;
      risk: string;
      overtime: number;
    }>;
  };
  records: Array<{
    staffName?: string;
    department?: string;
    date?: string;
    overtime?: number;
    riskLevel?: string;
    score?: number | null;
  }>;
  interventions: Array<{
    staffName?: string;
    type?: string;
    title?: string;
    status?: string;
    recommendedAt?: string | null;
  }>;
  feedback: Array<{
    message?: string;
    sentiment?: string;
    createdAt?: string | null;
    rating?: number;
  }>;
  trend: Array<{ month: string; score: number }>;
};

export function buildWellnessPrintHtml(data: WellnessReportData) {
  const s = data.summary;
  const stats = `
    <div class="stats">
      <div class="stat"><div class="stat-label">At-risk staff</div><div class="stat-value">${s.atRiskCount ?? 0}</div></div>
      <div class="stat"><div class="stat-label">Avg overtime</div><div class="stat-value">${s.avgOvertime ?? 0}h</div></div>
      <div class="stat"><div class="stat-label">Survey response</div><div class="stat-value">${s.surveyResponseRate ?? 0}%</div></div>
      <div class="stat"><div class="stat-label">Wellness score</div><div class="stat-value">${data.avgScore} (${data.trendLabel})</div></div>
    </div>`;

  const alertRows = (s.alerts ?? []).map((a) => [
    a.staff,
    a.department,
    riskBadge(a.risk),
    String(a.overtime),
  ]);

  const recordRows = data.records.map((r) => [
    r.staffName ?? "—",
    r.department ?? "—",
    r.date ?? "—",
    String(r.overtime ?? "—"),
    riskBadge(r.riskLevel ?? "low"),
    r.score != null ? String(r.score) : "—",
  ]);

  const interventionRows = data.interventions.map((i) => [
    i.staffName ?? "—",
    i.type ?? "—",
    i.title ?? "—",
    i.status ?? "—",
    i.recommendedAt ? String(i.recommendedAt).slice(0, 10) : "—",
  ]);

  const feedbackRows = data.feedback.map((f) => [
    f.sentiment ?? "—",
    f.rating != null ? String(f.rating) : "—",
    (f.message ?? "—").slice(0, 120),
    f.createdAt ?? "—",
  ]);

  const trendRows = data.trend.map((t) => [t.month, String(t.score)]);

  const body = `
    <h1>Wellness Report</h1>
    <div class="meta">Generated ${new Date(data.generatedAt).toLocaleString()} · Active interventions: ${s.activeInterventions ?? 0} · Feedback items: ${s.feedbackCount ?? 0}</div>
    ${stats}
    <h2>At-risk alerts (${alertRows.length})</h2>
    ${alertRows.length ? table(["Staff", "Department", "Risk", "Overtime (hrs)"], alertRows) : "<p>No active alerts.</p>"}
    <h2>Wellness records (${recordRows.length})</h2>
    ${recordRows.length ? table(["Staff", "Department", "Date", "Overtime", "Risk", "Score"], recordRows) : "<p>No records.</p>"}
    <h2>Interventions (${interventionRows.length})</h2>
    ${interventionRows.length ? table(["Staff", "Type", "Title", "Status", "Recommended"], interventionRows) : "<p>No interventions.</p>"}
    <h2>Staff feedback (${feedbackRows.length})</h2>
    ${feedbackRows.length ? table(["Sentiment", "Rating", "Message", "Date"], feedbackRows) : "<p>No feedback.</p>"}
    <h2>Monthly wellness trend</h2>
    ${trendRows.length ? table(["Month", "Avg score"], trendRows) : "<p>No trend data.</p>"}
  `;
  return body;
}

export function printWellnessReport(data: WellnessReportData) {
  printReportHtml("Wellness Report", buildWellnessPrintHtml(data));
}
