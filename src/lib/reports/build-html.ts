import { buildWellnessPrintHtml } from "@/components/reports/wellness-report";
import { buildSchedulingPrintHtml } from "@/components/reports/scheduling-report";
import { riskBadge, table } from "@/lib/report-print";
import { escapeHtml } from "@/lib/reports/print-document";
import type { ReportData } from "./fetch-report";

function kpiStats(kpis: Record<string, unknown>) {
  return `
    <div class="stats">
      <div class="stat"><div class="stat-label">Staff</div><div class="stat-value">${kpis.staffCount ?? 0}</div></div>
      <div class="stat"><div class="stat-label">Departments</div><div class="stat-value">${kpis.departmentCount ?? 0}</div></div>
      <div class="stat"><div class="stat-label">Avg workload</div><div class="stat-value">${kpis.avgWorkload ?? 0}%</div></div>
      <div class="stat"><div class="stat-label">At-risk staff</div><div class="stat-value">${kpis.atRiskCount ?? 0}</div></div>
      <div class="stat"><div class="stat-label">Schedule coverage</div><div class="stat-value">${kpis.coverage ?? 0}%</div></div>
      <div class="stat"><div class="stat-label">Open shifts</div><div class="stat-value">${kpis.openShifts ?? 0}</div></div>
    </div>`;
}

function departmentSection(departments: ReportData[]) {
  if (!departments?.length) return "";
  const rows = departments.map((d) => [
    String(d.name ?? "—"),
    String(d.code ?? "—"),
    String(d.description ?? "—").slice(0, 60),
    d.active ? "Yes" : "No",
    String(d.staffCount ?? "—"),
    String(d.workload ?? "—"),
  ]);
  return `<h2>Departments (${rows.length})</h2>${table(["Name", "Code", "Description", "Active", "Staff", "Workload %"], rows)}`;
}

function staffSection(staff: ReportData[]) {
  if (!staff?.length) return "";
  const rows = staff.map((s) => [
    String(s.name ?? "—"),
    String(s.role ?? "—"),
    String(s.email ?? "—"),
    String(s.phone ?? "—"),
    String(s.department ?? "—"),
  ]);
  return `<h2>Staff roster (${rows.length})</h2>${table(["Name", "Role", "Email", "Phone", "Department"], rows)}`;
}

function workloadSection(workload: ReportData[], trend?: ReportData[]) {
  let html = "";
  if (workload?.length) {
    const rows = workload.map((w) => [
      String(w.date ?? "—"),
      String(w.department ?? "—"),
      String(w.hour ?? "—"),
      String(w.workload ?? "—"),
      String(w.patientVolume ?? "—"),
      String(w.staffOnDuty ?? "—"),
    ]);
    html += `<h2>Workload records (${rows.length})</h2>${table(["Date", "Department", "Hour", "Workload", "Patients", "Staff on duty"], rows)}`;
  }
  if (trend?.length) {
    const rows = trend.map((t) => [String(t.month), String(t.workload)]);
    html += `<h2>Workload trend</h2>${table(["Month", "Avg workload"], rows)}`;
  }
  return html;
}

function wellnessSections(data: ReportData) {
  const summary = data.wellnessSummary ?? data.summary;
  let html = "";
  if (summary) {
    const alerts = (summary.alerts as ReportData[]) ?? [];
    const alertRows = alerts.map((a) => [
      String(a.staff ?? "—"),
      String(a.department ?? "—"),
      riskBadge(String(a.risk ?? "low")),
      String(a.overtime ?? "—"),
    ]);
    html += `<h2>Wellness summary</h2>
      <div class="stats">
        <div class="stat"><div class="stat-label">At-risk</div><div class="stat-value">${summary.atRiskCount ?? 0}</div></div>
        <div class="stat"><div class="stat-label">Avg overtime</div><div class="stat-value">${summary.avgOvertime ?? 0}h</div></div>
        <div class="stat"><div class="stat-label">Survey response</div><div class="stat-value">${summary.surveyResponseRate ?? 0}%</div></div>
        <div class="stat"><div class="stat-label">Interventions</div><div class="stat-value">${summary.interventionCount ?? 0}</div></div>
      </div>`;
    if (alertRows.length) {
      html += `<h2>Wellness alerts (${alertRows.length})</h2>${table(["Staff", "Department", "Risk", "Overtime"], alertRows)}`;
    }
  }
  const records = (data.wellnessRecords ?? data.records) as ReportData[] | undefined;
  if (records?.length) {
    const rows = records.map((r) => [
      String(r.staffName ?? "—"),
      String(r.department ?? "—"),
      String(r.date ?? "—"),
      String(r.overtime ?? "—"),
      riskBadge(String(r.riskLevel ?? "low")),
      r.score != null ? String(r.score) : "—",
    ]);
    html += `<h2>Wellness records (${rows.length})</h2>${table(["Staff", "Department", "Date", "Overtime", "Risk", "Score"], rows)}`;
  }
  const interventions = data.interventions as ReportData[] | undefined;
  if (interventions?.length) {
    const rows = interventions.map((i) => [
      String(i.staffName ?? "—"),
      String(i.type ?? "—"),
      String(i.title ?? "—"),
      String(i.status ?? "—"),
      i.recommendedAt ? String(i.recommendedAt).slice(0, 10) : "—",
    ]);
    html += `<h2>Interventions (${rows.length})</h2>${table(["Staff", "Type", "Title", "Status", "Recommended"], rows)}`;
  }
  const feedback = data.feedback as ReportData[] | undefined;
  if (feedback?.length) {
    const rows = feedback.map((f) => [
      String(f.sentiment ?? "—"),
      f.rating != null ? String(f.rating) : "—",
      String(f.message ?? "—").slice(0, 100),
      String(f.createdAt ?? "—"),
    ]);
    html += `<h2>Feedback (${rows.length})</h2>${table(["Sentiment", "Rating", "Message", "Date"], rows)}`;
  }
  const trend = (data.wellnessTrend ?? data.trend) as ReportData[] | undefined;
  if (trend?.length) {
    const rows = trend.map((t) => [String(t.month), String(t.score ?? t.workload ?? "—")]);
    html += `<h2>Wellness trend</h2>${table(["Month", "Score"], rows)}`;
  }
  return html;
}

function schedulingSection(sched: ReportData, embedded = false) {
  if (!sched) return "";

  const ws = (sched.weekSummary as ReportData) ?? {};
  const dailySummaries = ((sched.dailySummaries as ReportData[]) ?? []).map((d) => ({
    date: String(d.date ?? ""),
    summary: d.summary as { coverage?: number; openShifts?: number; swapRequests?: number } | undefined,
  }));
  const schedules = (sched.schedules as ReportData[]) ?? [];
  const conflicts = (sched.conflicts as ReportData[]) ?? [];
  const leave = (sched.leave as ReportData[]) ?? [];
  const onCall = (sched.onCall as ReportData[]) ?? [];

  if (!embedded) {
    return buildSchedulingPrintHtml({
      title: String(sched.title ?? "Scheduling"),
      generatedAt: String(sched.generatedAt ?? new Date().toISOString()),
      periodStart: String(sched.periodStart ?? ""),
      periodEnd: String(sched.periodEnd ?? ""),
      weekSummary: ws,
      schedules,
      conflicts,
      leave,
      onCall,
      dailySummaries,
    });
  }

  const stats = `
    <div class="stats">
      <div class="stat"><div class="stat-label">Coverage</div><div class="stat-value">${ws.coverage ?? 0}%</div></div>
      <div class="stat"><div class="stat-label">Open shifts</div><div class="stat-value">${ws.openShifts ?? 0}</div></div>
      <div class="stat"><div class="stat-label">Swap requests</div><div class="stat-value">${ws.swapRequests ?? 0}</div></div>
      <div class="stat"><div class="stat-label">Scheduled</div><div class="stat-value">${ws.scheduled ?? 0} / ${ws.targetShifts ?? 0}</div></div>
    </div>`;

  const dailyRows = dailySummaries.map((d) => [
    d.date,
    String(d.summary?.coverage ?? "—"),
    String(d.summary?.openShifts ?? "—"),
    String(d.summary?.swapRequests ?? "—"),
  ]);
  const scheduleRows = schedules.map((s) => [
    String(s.date ?? "—"),
    String(s.staff ?? "—"),
    String(s.role ?? "—"),
    String(s.dept ?? "—"),
    String(s.shift ?? "—"),
    String(s.status ?? "—"),
    s.swapRequested ? "Yes" : "No",
  ]);
  const conflictRows = conflicts.map((c) => [
    String(c.date ?? "—"),
    String(c.type ?? "—"),
    String(c.staff ?? "—"),
    String(c.detail ?? "—"),
  ]);
  const leaveRows = leave.map((l) => [
    String((l.staff as ReportData)?.name ?? "—"),
    String(l.type ?? "—"),
    `${l.startDate ?? "—"} → ${l.endDate ?? "—"}`,
    String(l.status ?? "—"),
  ]);
  const onCallRows = onCall.map((o) => [
    String((o.staff as ReportData)?.name ?? "—"),
    String(o.date ?? "—"),
    `${o.startTime ?? "—"} – ${o.endTime ?? "—"}`,
    String(o.status ?? "—"),
  ]);

  let html = `<h2>Scheduling (${sched.periodStart ?? ""} – ${sched.periodEnd ?? ""})</h2>${stats}`;
  if (dailyRows.length) {
    html += table(["Date", "Coverage %", "Open shifts", "Swap requests"], dailyRows);
  }
  if (scheduleRows.length) {
    html += `<h2>Shift roster (${scheduleRows.length})</h2>${table(["Date", "Staff", "Role", "Department", "Shift", "Status", "Swap"], scheduleRows)}`;
  }
  if (conflictRows.length) {
    html += `<h2>Conflicts (${conflictRows.length})</h2>${table(["Date", "Type", "Staff", "Detail"], conflictRows)}`;
  }
  if (leaveRows.length) {
    html += `<h2>Leave (${leaveRows.length})</h2>${table(["Staff", "Type", "Period", "Status"], leaveRows)}`;
  }
  if (onCallRows.length) {
    html += `<h2>On-call (${onCallRows.length})</h2>${table(["Staff", "Date", "Hours", "Status"], onCallRows)}`;
  }
  return html;
}

function complianceSection(records: ReportData[] | undefined) {
  if (!records?.length) return "";
  const rows = records.map((c) => [
    String(c.requirement ?? "—"),
    String(c.status ?? "—"),
    String(c.value ?? "—"),
    String(c.recordType ?? "—"),
    String(c.category ?? "—"),
    String(c.regulator ?? "—"),
    String(c.submittedBy ?? "—"),
    c.recordedAt ? String(c.recordedAt).slice(0, 19).replace("T", " ") : "—",
    String(c.details ?? "—").slice(0, 80),
  ]);
  return `<h2>Compliance history (${rows.length})</h2>${table(
    ["Requirement", "Status", "Value", "Type", "Category", "Regulator", "Submitted by", "Recorded", "Details"],
    rows
  )}`;
}

function strategicExtras(data: ReportData) {
  let html = "";
  if (data.quarter) {
    html += `<div class="meta">Quarter: ${data.quarter} · Industry avg: ${data.industryAvg ?? "—"}% · Your avg: ${data.yourAvg ?? "—"}% · Ranking: ${data.ranking ?? "—"}</div>`;
  }
  const benchmarks = data.benchmarks as ReportData[] | undefined;
  if (benchmarks?.length) {
    const rows = benchmarks.map((b) => [
      String(b.department ?? "—"),
      String(b.metric ?? "—"),
      String(b.current ?? "—"),
      String(b.target ?? "—"),
      String(b.status ?? "—"),
    ]);
    html += `<h2>Benchmarks (${rows.length})</h2>${table(["Department", "Metric", "Current", "Target", "Status"], rows)}`;
  }
  const recs = data.recommendations as string[] | undefined;
  if (recs?.length) {
    html += `<h2>Strategic recommendations</h2><ol>${recs.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ol>`;
  }
  return html;
}

export function buildReportPrintHtml(data: ReportData): string {
  const title = String(data.title ?? "Report");
  const generatedAt = data.generatedAt
    ? new Date(String(data.generatedAt)).toLocaleString()
    : new Date().toLocaleString();

  if (title === "Wellness Report" && data.summary) {
    return buildWellnessPrintHtml(data as Parameters<typeof buildWellnessPrintHtml>[0]);
  }

  if (title === "Scheduling Report" && data.schedules) {
    return buildSchedulingPrintHtml(data as Parameters<typeof buildSchedulingPrintHtml>[0]);
  }

  const sched = data.scheduling as ReportData | undefined;
  const isSchedulingOnly = title === "Scheduling Report" || (sched && !data.departments);

  if (isSchedulingOnly && sched) {
    return schedulingSection(sched);
  }

  let body = `<h1>${title}</h1><div class="meta">Generated ${generatedAt}</div>`;

  if (data.kpis) body += kpiStats(data.kpis as Record<string, unknown>);
  body += departmentSection(data.departments as ReportData[]);
  body += staffSection(data.staff as ReportData[]);
  body += workloadSection(data.workload as ReportData[], data.workloadTrend as ReportData[]);
  body += wellnessSections(data);
  if (sched) body += schedulingSection(sched, true);
  body += complianceSection(data.compliance as ReportData[] | undefined);
  body += strategicExtras(data);

  return body;
}
