import { printReportHtml, table } from "@/lib/report-print";

export type SchedulingReportData = {
  title: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  weekSummary: {
    coverage?: number;
    openShifts?: number;
    swapRequests?: number;
    scheduled?: number;
    targetShifts?: number;
  };
  schedules: Array<{
    date?: string;
    staff?: string;
    role?: string;
    dept?: string;
    shift?: string;
    status?: string;
    swapRequested?: boolean;
  }>;
  conflicts: Array<{
    date?: string;
    type?: string;
    staff?: string;
    detail?: string;
  }>;
  leave: Array<{
    staff?: { name?: string };
    startDate?: string;
    endDate?: string;
    type?: string;
    status?: string;
  }>;
  onCall: Array<{
    staff?: { name?: string };
    date?: string;
    startTime?: string;
    endTime?: string;
    status?: string;
  }>;
  dailySummaries: Array<{
    date: string;
    summary?: {
      coverage?: number;
      openShifts?: number;
      swapRequests?: number;
    };
  }>;
};

export function buildSchedulingPrintHtml(data: SchedulingReportData) {
  const ws = data.weekSummary;
  const stats = `
    <div class="stats">
      <div class="stat"><div class="stat-label">Coverage</div><div class="stat-value">${ws.coverage ?? 0}%</div></div>
      <div class="stat"><div class="stat-label">Open shifts</div><div class="stat-value">${ws.openShifts ?? 0}</div></div>
      <div class="stat"><div class="stat-label">Swap requests</div><div class="stat-value">${ws.swapRequests ?? 0}</div></div>
      <div class="stat"><div class="stat-label">Scheduled</div><div class="stat-value">${ws.scheduled ?? 0} / ${ws.targetShifts ?? 0}</div></div>
    </div>`;

  const dailyRows = data.dailySummaries.map((d) => [
    d.date,
    String(d.summary?.coverage ?? "—"),
    String(d.summary?.openShifts ?? "—"),
    String(d.summary?.swapRequests ?? "—"),
  ]);

  const scheduleRows = data.schedules.map((s) => [
    s.date ?? "—",
    s.staff ?? "—",
    s.role ?? "—",
    s.dept ?? "—",
    s.shift ?? "—",
    s.status ?? "—",
    s.swapRequested ? "Yes" : "No",
  ]);

  const conflictRows = data.conflicts.map((c) => [
    c.date ?? "—",
    c.type ?? "—",
    c.staff ?? "—",
    c.detail ?? "—",
  ]);

  const leaveRows = data.leave.map((l) => [
    l.staff?.name ?? "—",
    l.type ?? "—",
    `${l.startDate ?? "—"} → ${l.endDate ?? "—"}`,
    l.status ?? "—",
  ]);

  const onCallRows = data.onCall.map((o) => [
    o.staff?.name ?? "—",
    o.date ?? "—",
    `${o.startTime ?? "—"} – ${o.endTime ?? "—"}`,
    o.status ?? "—",
  ]);

  const body = `
    <h1>Scheduling Report</h1>
    <div class="meta">Period ${data.periodStart} to ${data.periodEnd} · Generated ${new Date(data.generatedAt).toLocaleString()}</div>
    ${stats}
    <h2>Daily coverage summary</h2>
    ${dailyRows.length ? table(["Date", "Coverage %", "Open shifts", "Swap requests"], dailyRows) : "<p>No daily data.</p>"}
    <h2>Shift roster (${scheduleRows.length})</h2>
    ${scheduleRows.length ? table(["Date", "Staff", "Role", "Department", "Shift", "Status", "Swap"], scheduleRows) : "<p>No shifts scheduled.</p>"}
    <h2>Conflicts (${conflictRows.length})</h2>
    ${conflictRows.length ? table(["Date", "Type", "Staff", "Detail"], conflictRows) : "<p>No conflicts detected.</p>"}
    <h2>Leave requests (${leaveRows.length})</h2>
    ${leaveRows.length ? table(["Staff", "Type", "Period", "Status"], leaveRows) : "<p>No leave records.</p>"}
    <h2>On-call roster (${onCallRows.length})</h2>
    ${onCallRows.length ? table(["Staff", "Date", "Hours", "Status"], onCallRows) : "<p>No on-call assignments.</p>"}
  `;
  return body;
}

export function printSchedulingReport(data: SchedulingReportData) {
  printReportHtml("Scheduling Report", buildSchedulingPrintHtml(data));
}
