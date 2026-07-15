import type { ExcelSheet } from "./report-excel";
import type { ReportData } from "./fetch-report";

function sheet(name: string, headers: string[], rows: ExcelSheet["rows"]): ExcelSheet {
  return { name, headers, rows };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowsFrom(data: any[] | undefined, mapper: (r: any) => ExcelSheet["rows"][0]): ExcelSheet["rows"] {
  return (data ?? []).map(mapper);
}

export function buildReportSheets(data: ReportData): ExcelSheet[] {
  const sheets: ExcelSheet[] = [];
  const title = String(data.title ?? "Report");

  if (data.kpis) {
    const k = data.kpis;
    sheets.push(
      sheet("KPIs", ["Metric", "Value"], [
        ["Staff count", k.staffCount],
        ["Departments", k.departmentCount],
        ["Avg workload %", k.avgWorkload],
        ["At-risk staff", k.atRiskCount],
        ["Avg overtime (hrs)", k.avgOvertime],
        ["Schedule coverage %", k.coverage],
        ["Open shifts", k.openShifts],
        ["Swap requests", k.swapRequests],
        ["Compliance violations", k.complianceViolations],
        ["Compliance records", k.complianceRecords],
      ])
    );
  }

  if (data.departments?.length) {
    sheets.push(
      sheet(
        "Departments",
        ["Name", "Code", "Description", "Active", "Staff count", "Workload %"],
        rowsFrom(data.departments, (d) => [
          d.name, d.code, d.description, d.active, d.staffCount, d.workload,
        ])
      )
    );
  }

  if (data.staff?.length) {
    sheets.push(
      sheet(
        "Staff",
        ["Name", "Role", "Email", "Phone", "Department"],
        rowsFrom(data.staff, (s) => [s.name, s.role, s.email, s.phone, s.department])
      )
    );
  }

  if (data.workload?.length) {
    sheets.push(
      sheet(
        "Workload",
        ["Date", "Department", "Hour", "Workload", "Patient volume", "Staff on duty"],
        rowsFrom(data.workload, (w) => [
          w.date, w.department, w.hour, w.workload, w.patientVolume, w.staffOnDuty,
        ])
      )
    );
  }

  if (data.workloadTrend?.length) {
    sheets.push(
      sheet("Workload trend", ["Month", "Avg workload"], rowsFrom(data.workloadTrend, (t) => [t.month, t.workload]))
    );
  }

  const wellnessSummary = data.wellnessSummary ?? data.summary;
  if (wellnessSummary?.alerts?.length) {
    sheets.push(
      sheet(
        "Wellness alerts",
        ["Staff", "Department", "Risk", "Overtime"],
        rowsFrom(wellnessSummary.alerts, (a) => [a.staff, a.department, a.risk, a.overtime])
      )
    );
  }

  const wellnessRecords = data.wellnessRecords ?? data.records;
  if (wellnessRecords?.length) {
    sheets.push(
      sheet(
        "Wellness records",
        ["Staff", "Department", "Date", "Overtime", "Risk", "Score"],
        rowsFrom(wellnessRecords, (r) => [
          r.staffName, r.department, r.date, r.overtime, r.riskLevel, r.score,
        ])
      )
    );
  }

  if (data.interventions?.length) {
    sheets.push(
      sheet(
        "Interventions",
        ["Staff", "Type", "Title", "Status", "Recommended"],
        rowsFrom(data.interventions, (i) => [
          i.staffName, i.type, i.title, i.status, i.recommendedAt,
        ])
      )
    );
  }

  if (data.feedback?.length) {
    sheets.push(
      sheet(
        "Feedback",
        ["Sentiment", "Rating", "Message", "Date"],
        rowsFrom(data.feedback, (f) => [f.sentiment, f.rating, f.message, f.createdAt])
      )
    );
  }

  if (data.trend?.length || data.wellnessTrend?.length) {
    const trend = (data.wellnessTrend ?? data.trend) as ReportData[];
    sheets.push(
      sheet("Wellness trend", ["Month", "Score"], rowsFrom(trend, (t) => [t.month, t.score]))
    );
  }

  const sched = data.scheduling ?? data;
  if (sched.weekSummary) {
    const ws = sched.weekSummary;
    sheets.push(
      sheet("Schedule summary", ["Metric", "Value"], [
        ["Coverage %", ws.coverage],
        ["Open shifts", ws.openShifts],
        ["Swap requests", ws.swapRequests],
        ["Scheduled", ws.scheduled],
        ["Target shifts", ws.targetShifts],
      ])
    );
  }

  if (sched.dailySummaries?.length) {
    sheets.push(
      sheet(
        "Daily coverage",
        ["Date", "Coverage %", "Open shifts", "Swap requests"],
        rowsFrom(sched.dailySummaries, (d) => [
          d.date,
          d.summary?.coverage,
          d.summary?.openShifts,
          d.summary?.swapRequests,
        ])
      )
    );
  }

  if (sched.schedules?.length) {
    sheets.push(
      sheet(
        "Shifts",
        ["Date", "Staff", "Role", "Department", "Shift", "Status", "Swap"],
        rowsFrom(sched.schedules, (s) => [
          s.date, s.staff, s.role, s.dept, s.shift, s.status, s.swapRequested ? "Yes" : "No",
        ])
      )
    );
  }

  if (sched.conflicts?.length) {
    sheets.push(
      sheet(
        "Conflicts",
        ["Date", "Type", "Staff", "Detail"],
        rowsFrom(sched.conflicts, (c) => [c.date, c.type, c.staff, c.detail])
      )
    );
  }

  if (sched.leave?.length) {
    sheets.push(
      sheet(
        "Leave",
        ["Staff", "Type", "Start", "End", "Status"],
        rowsFrom(sched.leave, (l) => [
          l.staff?.name, l.type, l.startDate, l.endDate, l.status,
        ])
      )
    );
  }

  if (sched.onCall?.length) {
    sheets.push(
      sheet(
        "On-call",
        ["Staff", "Date", "Start", "End", "Status"],
        rowsFrom(sched.onCall, (o) => [
          o.staff?.name, o.date, o.startTime, o.endTime, o.status,
        ])
      )
    );
  }

  if (data.benchmarks?.length) {
    sheets.push(
      sheet(
        "Benchmarks",
        ["Department", "Metric", "Current", "Target", "Status"],
        rowsFrom(data.benchmarks, (b) => [b.department, b.metric, b.current, b.target, b.status])
      )
    );
  }

  if (data.recommendations?.length) {
    sheets.push(
      sheet(
        "Recommendations",
        ["#", "Recommendation"],
        data.recommendations.map((r: string, i: number) => [i + 1, r])
      )
    );
  }

  if (data.compliance?.length) {
    sheets.push(
      sheet(
        "Compliance history",
        ["Requirement", "Status", "Value", "Type", "Category", "Regulator", "Submitted by", "Recorded at", "Details"],
        rowsFrom(data.compliance, (c) => [
          c.requirement,
          c.status,
          c.value,
          c.recordType,
          c.category,
          c.regulator,
          c.submittedBy,
          c.recordedAt,
          c.details,
        ])
      )
    );
  }

  if (!sheets.length) {
    sheets.push(sheet(title, ["Info"], [["No data available for this report"]]));
  }

  return sheets;
}
