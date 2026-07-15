"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import {
  FileText,
  Download,
  BarChart3,
  Layout,
  Heart,
  CalendarDays,
  Printer,
  X,
  Eye,
} from "lucide-react";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { PrintReportModal } from "@/components/reports/PrintReportModal";
import { fetchReportData, recordReportGeneration, type ReportType, type ReportData } from "@/lib/reports/fetch-report";
import { buildReportSheets } from "@/lib/reports/build-sheets";
import { buildReportPrintHtml } from "@/lib/reports/build-html";
import { downloadCsv, downloadExcel } from "@/lib/reports/report-excel";

const reportTypes = [
  { id: "operational" as const, icon: FileText, label: "Operational Report", desc: "KPIs, departments, staff, workload, wellness & scheduling" },
  { id: "strategic" as const, icon: BarChart3, label: "Strategic Report", desc: "Operational data plus benchmarks and recommendations" },
  { id: "wellness" as const, icon: Heart, label: "Wellness Report", desc: "Staff wellness, alerts, interventions & feedback" },
  { id: "scheduling" as const, icon: CalendarDays, label: "Scheduling Report", desc: "Weekly shifts, coverage, conflicts & leave" },
];

const customSections = [
  { id: "departments", label: "Departments" },
  { id: "staff", label: "Staff" },
  { id: "workload", label: "Workload" },
  { id: "wellness", label: "Wellness" },
  { id: "scheduling", label: "Scheduling" },
  { id: "compliance", label: "Compliance" },
];

type ActiveReport = ReportType | "custom" | null;

export default function ReportingPage() {
  const [reports, setReports] = useState<{ id: string; name: string; type: string; format: string; date: string }[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<"excel" | "csv" | "pdf">("pdf");
  const [customSectionsSelected, setCustomSectionsSelected] = useState<string[]>([]);
  const [previewType, setPreviewType] = useState<ActiveReport>(null);
  const [previewData, setPreviewData] = useState<ReportData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [printModal, setPrintModal] = useState<{ title: string; html: string; autoPrint: boolean } | null>(null);

  useEffect(() => {
    apiFetch("/api/reports")
      .then((r) => (r.ok ? r.json() : []))
      .then(setReports);
  }, []);

  const refreshReports = () =>
    apiFetch("/api/reports")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => Array.isArray(list) && setReports(list));

  const loadReportData = async (type: ActiveReport): Promise<ReportData> => {
    if (type === "custom") {
      return fetchReportData("custom", customSectionsSelected);
    }
    return fetchReportData(type as ReportType);
  };

  const exportReport = async (type: ActiveReport, options?: { autoPrint?: boolean }) => {
    if (!type) return;
    if (type === "custom" && !customSectionsSelected.length) return;

    setGenerating(type);
    try {
      const data = await loadReportData(type);
      const date = new Date().toISOString().split("T")[0];
      const baseName = `${type}-report-${date}`;

      if (exportFormat === "pdf") {
        let html: string;
        try {
          html = buildReportPrintHtml(data);
        } catch (err) {
          console.error("Report HTML build failed:", err);
          alert("Could not build report for printing.");
          setGenerating(null);
          return;
        }
        if (!html?.trim()) {
          alert("Report has no printable content.");
          setGenerating(null);
          return;
        }
        setPrintModal({
          title: String(data.title ?? "Report"),
          html,
          autoPrint: options?.autoPrint ?? true,
        });
      } else {
        const sheets = buildReportSheets(data);
        if (exportFormat === "excel") {
          downloadExcel(baseName, sheets);
        } else {
          downloadCsv(baseName, sheets);
        }
      }

      await recordReportGeneration(type, exportFormat);
      await refreshReports();
    } catch (err) {
      console.error("Report export failed:", err);
      alert(type === "operational" || type === "strategic"
        ? "Report failed to load — large reports may take a moment. Check the backend is running and try again."
        : "Report generation failed");
    }
    setGenerating(null);
  };

  const openPreview = async (type: ActiveReport) => {
    if (!type) return;
    if (type === "custom" && !customSectionsSelected.length) {
      alert("Select at least one section for the custom report.");
      return;
    }
    setLoadingPreview(true);
    setPreviewType(type);
    setPreviewData(null);
    try {
      setPreviewData(await loadReportData(type));
    } catch {
      alert("Could not load report data");
      setPreviewType(null);
    }
    setLoadingPreview(false);
  };

  const riskClass = (risk?: string) => {
    const r = (risk ?? "low").toLowerCase();
    if (r === "high") return "bg-red-100 text-red-700";
    if (r === "medium") return "bg-amber-100 text-amber-700";
    return "bg-emerald-100 text-emerald-700";
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Reporting & Analytics</h2>
        <p className="text-slate-600">
          Generate workforce, wellness, and scheduling reports — PDF, Excel, or CSV
        </p>
      </div>

      {/* KPI summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-teal-100 p-2"><ClipboardList className="h-5 w-5 text-teal-600" /></div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Reports generated</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{reports.length}</p>
              <p className="mt-1 text-xs text-slate-400">Last 20 on record</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-indigo-100 p-2"><Calendar className="h-5 w-5 text-indigo-600" /></div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Scheduled reports</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">—</p>
              <p className="mt-1 text-xs text-slate-400">See section below</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-100 p-2"><TrendingUp className="h-5 w-5 text-amber-600" /></div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Depts benchmarked</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{benchmarks.length}</p>
              <p className="mt-1 text-xs text-slate-400">vs workload target</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className={`rounded-lg p-2 ${benchmarks.filter(b => b.status !== "compliant").length > 0 ? "bg-rose-100" : "bg-emerald-100"}`}>
              <Heart className={`h-5 w-5 ${benchmarks.filter(b => b.status !== "compliant").length > 0 ? "text-rose-600" : "text-emerald-600"}`} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Depts above target</p>
              <p className={`mt-1 text-2xl font-bold ${benchmarks.filter(b => b.status !== "compliant").length > 0 ? "text-rose-700" : "text-slate-800"}`}>
                {benchmarks.filter(b => b.status !== "compliant").length}
              </p>
              <p className="mt-1 text-xs text-slate-400">Workload exceeding limit</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-800">Export Format</h3>
        <div className="flex flex-wrap gap-3">
          {(["pdf", "excel", "csv"] as const).map((fmt) => (
            <button
              key={fmt}
              onClick={() => setExportFormat(fmt)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                exportFormat === fmt
                  ? "bg-teal-500 text-white"
                  : "border border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {fmt === "pdf" ? "PDF (Print)" : fmt === "excel" ? "Excel" : "CSV"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          PDF opens an in-app print view — choose &quot;Save as PDF&quot; in the print dialog. Excel and CSV download immediately with all report data.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {reportTypes.map(({ id, icon: Icon, label, desc }) => (
          <div key={id} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <Icon className="h-8 w-8 text-teal-500" />
            <h3 className="mt-3 font-semibold text-slate-800">{label}</h3>
            <p className="mt-1 text-sm text-slate-500">{desc}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => openPreview(id)}
                className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-800"
              >
                <Eye className="h-4 w-4" /> Preview
              </button>
              <button
                onClick={() => exportReport(id)}
                disabled={!!generating}
                className="flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700 disabled:opacity-50"
              >
                {exportFormat === "pdf" ? <Printer className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                {generating === id
                  ? "Generating..."
                  : exportFormat === "pdf"
                    ? "Print PDF"
                    : "Download"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
          <Layout className="h-5 w-5" /> Custom Report Builder
        </h3>
        <p className="mb-3 text-sm text-slate-500">Select sections to include in your report</p>
        <div className="flex flex-wrap gap-3">
          {customSections.map((s) => (
            <label
              key={s.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={customSectionsSelected.includes(s.id)}
                onChange={(e) =>
                  setCustomSectionsSelected((prev) =>
                    e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)
                  )
                }
                className="rounded"
              />
              <span className="text-sm font-medium text-slate-700">{s.label}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => openPreview("custom")}
            disabled={!customSectionsSelected.length || !!generating}
            className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-800 disabled:opacity-50"
          >
            <Eye className="h-4 w-4" /> Preview
          </button>
          <button
            onClick={() => exportReport("custom")}
            disabled={!customSectionsSelected.length || !!generating}
            className="flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700 disabled:opacity-50"
          >
            {exportFormat === "pdf" ? <Printer className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            {generating === "custom" ? "Generating..." : "Generate custom report"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-800">Scheduled reports</h3>
        <ScheduledReportsList />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-800">Recent Reports</h3>
        <div className="space-y-3">
          {reports.length === 0 ? (
            <p className="text-sm text-slate-500">No reports generated yet.</p>
          ) : (
            reports.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <div>
                  <p className="font-medium text-slate-800">{r.name}</p>
                  <p className="text-sm text-slate-500">{r.date} · {r.format}</p>
                </div>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{r.type}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {previewType && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">
                {previewData?.title ?? "Report Preview"}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (!previewData) return;
                    setPrintModal({
                      title: String(previewData.title ?? "Report"),
                      html: buildReportPrintHtml(previewData),
                      autoPrint: true,
                    });
                  }}
                  disabled={!previewData}
                  className="flex items-center gap-2 rounded-lg bg-teal-500 px-3 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
                >
                  <Printer className="h-4 w-4" /> Print PDF
                </button>
                <button onClick={() => { setPreviewType(null); setPreviewData(null); }} className="rounded-lg border p-2 hover:bg-slate-50">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <ReportHeader />

            {loadingPreview ? (
              <p className="text-slate-500">Loading report data…</p>
            ) : previewData ? (
              <ReportPreview data={previewData} riskClass={riskClass} />
            ) : null}
          </div>
        </div>
      )}

      {printModal && (
        <PrintReportModal
          open
          title={printModal.title}
          bodyHtml={printModal.html}
          autoPrint={printModal.autoPrint}
          onClose={() => setPrintModal(null)}
        />
      )}
    </div>
  );
}

function ReportPreview({ data, riskClass }: { data: ReportData; riskClass: (r?: string) => string }) {
  const kpis = data.kpis as Record<string, unknown> | undefined;
  const departments = data.departments as ReportData[] | undefined;
  const staff = data.staff as ReportData[] | undefined;
  const workload = data.workload as ReportData[] | undefined;
  const summary = (data.wellnessSummary ?? data.summary) as ReportData | undefined;
  const records = (data.wellnessRecords ?? data.records) as ReportData[] | undefined;
  const interventions = data.interventions as ReportData[] | undefined;
  const feedback = data.feedback as ReportData[] | undefined;
  const wellnessTrend = (data.wellnessTrend ?? data.trend) as ReportData[] | undefined;
  const compliance = data.compliance as ReportData[] | undefined;
  const sched = (data.scheduling ?? (data.schedules ? data : null)) as ReportData | null;
  const recommendations = data.recommendations as string[] | undefined;
  const alerts = (summary?.alerts as ReportData[]) ?? [];

  return (
    <div className="space-y-6 text-sm">
      <p className="text-slate-500">
        Generated {data.generatedAt ? new Date(String(data.generatedAt)).toLocaleString() : "—"}
        {data.quarter ? ` · ${data.quarter}` : ""}
      </p>

      {kpis && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {([
            ["Staff", kpis.staffCount],
            ["Departments", kpis.departmentCount],
            ["Avg workload", `${kpis.avgWorkload}%`],
            ["At-risk", kpis.atRiskCount],
            ["Coverage", `${kpis.coverage}%`],
            ["Open shifts", kpis.openShifts],
            ["Compliance violations", kpis.complianceViolations],
            ["Compliance records", kpis.complianceRecords],
          ] as [string, unknown][]).map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-lg font-bold text-slate-800">{String(value ?? "—")}</p>
            </div>
          ))}
        </div>
      )}

      {summary && (
        <Section title="Wellness summary">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["At-risk staff", summary.atRiskCount ?? 0],
              ["Avg overtime", `${summary.avgOvertime ?? 0}h`],
              ["Survey response", `${summary.surveyResponseRate ?? 0}%`],
              ["Interventions", summary.interventionCount ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="font-bold text-slate-800">{value}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {alerts.length ? (
        <Section title={`Wellness alerts (${alerts.length})`}>
          <DataTable
            headers={["Staff", "Department", "Risk", "Overtime"]}
            rows={alerts.map((a, idx) => [
              a.staff,
              a.department,
              <span key={idx} className={`rounded px-2 py-0.5 text-xs ${riskClass(String(a.risk))}`}>{a.risk}</span>,
              `${a.overtime}h`,
            ])}
          />
        </Section>
      ) : null}

      {departments?.length ? (
        <Section title={`Departments (${departments.length})`}>
          <DataTable
            headers={["Name", "Code", "Description", "Active", "Staff", "Workload %"]}
            rows={departments.map((d) => [d.name, d.code, d.description, d.active ? "Yes" : "No", d.staffCount, d.workload])}
          />
        </Section>
      ) : null}

      {staff?.length ? (
        <Section title={`Staff (${staff.length})`}>
          <DataTable
            headers={["Name", "Role", "Email", "Phone", "Department"]}
            rows={staff.map((s) => [s.name, s.role, s.email, s.phone || "—", s.department])}
          />
        </Section>
      ) : null}

      {workload?.length ? (
        <Section title={`Workload (${workload.length})`}>
          <DataTable
            headers={["Date", "Department", "Hour", "Workload", "Patients", "Staff"]}
            rows={workload.map((w) => [w.date, w.department, w.hour, w.workload, w.patientVolume, w.staffOnDuty])}
          />
        </Section>
      ) : null}

      {data.workloadTrend?.length ? (
        <Section title="Workload trend">
          <DataTable
            headers={["Month", "Avg workload"]}
            rows={(data.workloadTrend as ReportData[]).map((t) => [t.month, t.workload])}
          />
        </Section>
      ) : null}

      {records?.length ? (
        <Section title={`Wellness records (${records.length})`}>
          <DataTable
            headers={["Staff", "Department", "Date", "Overtime", "Risk", "Score"]}
            rows={records.map((r, idx) => [
              r.staffName,
              r.department,
              r.date,
              r.overtime,
              <span key={idx} className={`rounded px-2 py-0.5 text-xs ${riskClass(String(r.riskLevel))}`}>{r.riskLevel}</span>,
              r.score ?? "—",
            ])}
          />
        </Section>
      ) : null}

      {interventions?.length ? (
        <Section title={`Interventions (${interventions.length})`}>
          <DataTable
            headers={["Staff", "Type", "Title", "Status", "Recommended"]}
            rows={interventions.map((i) => [
              i.staffName,
              i.type,
              i.title,
              i.status,
              i.recommendedAt ? String(i.recommendedAt).slice(0, 10) : "—",
            ])}
          />
        </Section>
      ) : null}

      {feedback?.length ? (
        <Section title={`Feedback (${feedback.length})`}>
          <DataTable
            headers={["Sentiment", "Rating", "Message", "Date"]}
            rows={feedback.map((f) => [
              f.sentiment,
              f.rating,
              String(f.message ?? "—").slice(0, 120),
              f.createdAt,
            ])}
          />
        </Section>
      ) : null}

      {wellnessTrend?.length ? (
        <Section title="Wellness trend">
          <DataTable
            headers={["Month", "Score"]}
            rows={wellnessTrend.map((t) => [t.month, t.score])}
          />
        </Section>
      ) : null}

      {sched?.dailySummaries?.length ? (
        <Section title="Daily coverage">
          <DataTable
            headers={["Date", "Coverage %", "Open shifts", "Swap requests"]}
            rows={(sched.dailySummaries as ReportData[]).map((d) => [
              d.date,
              (d.summary as ReportData)?.coverage,
              (d.summary as ReportData)?.openShifts,
              (d.summary as ReportData)?.swapRequests,
            ])}
          />
        </Section>
      ) : null}

      {sched?.schedules?.length ? (
        <Section title={`Shifts (${(sched.schedules as ReportData[]).length})`}>
          <DataTable
            headers={["Date", "Staff", "Role", "Dept", "Shift", "Status", "Swap"]}
            rows={(sched.schedules as ReportData[]).map((s) => [
              s.date, s.staff, s.role, s.dept, s.shift, s.status, s.swapRequested ? "Yes" : "No",
            ])}
          />
        </Section>
      ) : null}

      {sched?.conflicts?.length ? (
        <Section title={`Conflicts (${(sched.conflicts as ReportData[]).length})`}>
          <DataTable
            headers={["Date", "Type", "Staff", "Detail"]}
            rows={(sched.conflicts as ReportData[]).map((c) => [c.date, c.type, c.staff, c.detail])}
          />
        </Section>
      ) : null}

      {sched?.leave?.length ? (
        <Section title={`Leave (${(sched.leave as ReportData[]).length})`}>
          <DataTable
            headers={["Staff", "Type", "Start", "End", "Status"]}
            rows={(sched.leave as ReportData[]).map((l) => [
              (l.staff as ReportData)?.name,
              l.type,
              l.startDate,
              l.endDate,
              l.status,
            ])}
          />
        </Section>
      ) : null}

      {sched?.onCall?.length ? (
        <Section title={`On-call (${(sched.onCall as ReportData[]).length})`}>
          <DataTable
            headers={["Staff", "Date", "Start", "End", "Status"]}
            rows={(sched.onCall as ReportData[]).map((o) => [
              (o.staff as ReportData)?.name,
              o.date,
              o.startTime,
              o.endTime,
              o.status,
            ])}
          />
        </Section>
      ) : null}

      {compliance?.length ? (
        <Section title={`Compliance history (${compliance.length})`}>
          <DataTable
            headers={["Requirement", "Status", "Value", "Type", "Category", "Regulator", "Submitted by", "Recorded"]}
            rows={compliance.map((c) => [
              c.requirement,
              c.status,
              c.value,
              c.recordType,
              c.category,
              c.regulator,
              c.submittedBy,
              c.recordedAt ? String(c.recordedAt).slice(0, 19).replace("T", " ") : "—",
            ])}
          />
        </Section>
      ) : null}

      {data.benchmarks?.length ? (
        <Section title="Benchmarks">
          <DataTable
            headers={["Department", "Metric", "Current", "Target", "Status"]}
            rows={(data.benchmarks as ReportData[]).map((b) => [b.department, b.metric, b.current, b.target, b.status])}
          />
        </Section>
      ) : null}

      {recommendations?.length ? (
        <Section title="Recommendations">
          <ul className="list-inside list-disc space-y-1 text-slate-700">
            {recommendations.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 font-semibold text-teal-700">{title}</h4>
      {children}
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  if (!rows.length) return <p className="text-slate-500">No data.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-teal-50 text-teal-800">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-100 even:bg-slate-50">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-slate-700">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScheduledReportsList() {
  const [scheduled, setScheduled] = useState<{ id: string; type: string; format: string; frequency: string; nextRun: string }[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newReport, setNewReport] = useState({ type: "wellness", format: "pdf", frequency: "weekly" });

  useEffect(() => {
    apiFetch("/api/scheduled-reports").then((r) => (r.ok ? r.json() : [])).then(setScheduled);
  }, []);

  const handleAdd = async () => {
    const res = await apiFetch("/api/scheduled-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newReport),
    });
    if (!res.ok) return;
    apiFetch("/api/scheduled-reports").then((r) => (r.ok ? r.json() : [])).then(setScheduled);
    setShowAdd(false);
  };

  return (
    <div className="space-y-2">
      {showAdd && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-3">
          <select
            value={newReport.type}
            onChange={(e) => setNewReport((n) => ({ ...n, type: e.target.value }))}
            className="rounded border px-2 py-1 text-sm"
          >
            <option value="operational">Operational</option>
            <option value="strategic">Strategic</option>
            <option value="wellness">Wellness</option>
            <option value="scheduling">Scheduling</option>
          </select>
          <select
            value={newReport.format}
            onChange={(e) => setNewReport((n) => ({ ...n, format: e.target.value }))}
            className="rounded border px-2 py-1 text-sm"
          >
            <option value="pdf">PDF</option>
            <option value="excel">Excel</option>
            <option value="csv">CSV</option>
          </select>
          <select
            value={newReport.frequency}
            onChange={(e) => setNewReport((n) => ({ ...n, frequency: e.target.value }))}
            className="rounded border px-2 py-1 text-sm"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <button onClick={handleAdd} className="rounded bg-teal-500 px-3 py-1 text-sm text-white">Add</button>
          <button onClick={() => setShowAdd(false)} className="rounded border px-3 py-1 text-sm">Cancel</button>
        </div>
      )}
      {scheduled.length === 0 && !showAdd ? (
        <p className="mb-2 text-sm text-slate-500">No scheduled reports.</p>
      ) : (
        scheduled.map((r) => (
          <div key={r.id} className="flex justify-between rounded-lg border border-slate-100 p-2 text-sm">
            <span>{r.type} · {r.format} · {r.frequency}</span>
            <span className="text-slate-500">Next: {r.nextRun ? new Date(r.nextRun).toLocaleDateString() : "—"}</span>
          </div>
        ))
      )}
      <button onClick={() => setShowAdd(true)} className="text-sm text-teal-600 hover:text-teal-700">+ Schedule report</button>
    </div>
  );
}
