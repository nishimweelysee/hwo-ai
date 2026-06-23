"use client";

import { useState, useEffect } from "react";
import { apiFetch, apiDownload } from "@/lib/api";
import { FileText, Download, Calendar, BarChart3, Layout, Target, FileCheck } from "lucide-react";

const reportTypes = [
  { id: "operational", icon: FileText, label: "Operational Report", desc: "Weekly workload summary" },
  { id: "strategic", icon: BarChart3, label: "Strategic Report", desc: "Quarterly workforce planning" },
  { id: "compliance", icon: Calendar, label: "Compliance Report", desc: "Regulatory requirements" },
];

const customSections = [
  { id: "departments", label: "Departments", desc: "Department list with staff and workload" },
  { id: "staff", label: "Staff", desc: "Staff roster with roles" },
  { id: "workload", label: "Workload", desc: "Workload records by date" },
];

export default function ReportingPage() {
  const [reports, setReports] = useState<{ id: string; name: string; type: string; format: string; date: string }[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<"excel" | "csv">("excel");
  const [customSectionsSelected, setCustomSectionsSelected] = useState<string[]>([]);
  const [benchmarks, setBenchmarks] = useState<{ department: string; metric: string; current: string; target: string; status: string }[]>([]);
  const [execSummary, setExecSummary] = useState<{ highlights: { label: string; value: number | string; unit: string }[]; recommendations: string[] } | null>(null);

  useEffect(() => {
    apiFetch("/api/reports")
      .then((r) => r.ok ? r.json() : [])
      .then(setReports);
    apiFetch("/api/reports/benchmark")
      .then((r) => r.ok ? r.json() : { benchmarks: [] })
      .then((d: { benchmarks?: { department: string; metric: string; current: string; target: string; status: string }[] }) => setBenchmarks(d.benchmarks || []));
  }, []);

  const handleGenerate = async (type: string) => {
    setGenerating(type);
    try {
      const res = await apiFetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, format: exportFormat }),
      });
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}-report.${exportFormat === "excel" ? "xlsx" : "csv"}`;
      a.click();
      URL.revokeObjectURL(url);
      const refreshed = await apiFetch("/api/reports").then((r) => r.ok ? r.json() : []);
      if (Array.isArray(refreshed)) setReports(refreshed);
    } catch {
      alert("Report generation failed");
    }
    setGenerating(null);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Reporting & Analytics</h2>
        <p className="text-slate-600">
          Generate operational, strategic, and compliance reports
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
          <Layout className="h-5 w-5" /> Custom Report Builder
        </h3>
        <p className="mb-3 text-sm text-slate-500">Select sections to include in your report</p>
        <div className="flex flex-wrap gap-3">
          {customSections.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 hover:bg-slate-50">
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
        <button
          onClick={async () => {
            if (!customSectionsSelected.length) return;
            setGenerating("custom");
            try {
              const res = await apiFetch("/api/reports/custom", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sections: customSectionsSelected, format: "xlsx" }),
              });
              if (!res.ok) throw new Error("Failed");
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `custom_report_${new Date().toISOString().split("T")[0]}.xlsx`;
              a.click();
              URL.revokeObjectURL(url);
            } catch {
              alert("Custom report failed");
            }
            setGenerating(null);
          }}
          disabled={!customSectionsSelected.length || !!generating}
          className="mt-3 flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {generating === "custom" ? "Generating..." : "Generate custom report"}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
            <Target className="h-5 w-5" /> Benchmark Report
          </h3>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {benchmarks.length === 0 ? (
              <p className="text-sm text-slate-500">No benchmark data</p>
            ) : (
              benchmarks.map((b, i) => (
                <div key={i} className="flex justify-between rounded-lg border border-slate-100 p-2 text-sm">
                  <span className="font-medium text-slate-700">{b.department}</span>
                  <span className={`rounded px-2 py-0.5 text-xs ${b.status === "compliant" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {b.current} vs {b.target}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
            <FileCheck className="h-5 w-5" /> Executive Summary
          </h3>
          {!execSummary ? (
            <button
              onClick={async () => {
                const res = await apiFetch("/api/reports/executive-summary", { method: "POST" });
                const data = res.ok ? await res.json() : null;
                if (data) setExecSummary(data);
              }}
              className="rounded-lg bg-teal-500 px-3 py-2 text-sm font-medium text-white hover:bg-teal-600"
            >
              Generate summary
            </button>
          ) : (
            <div className="space-y-3">
              {execSummary.highlights?.map((h, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-slate-600">{h.label}</span>
                  <span className="font-medium text-slate-800">{h.value} {h.unit}</span>
                </div>
              ))}
              <div className="mt-3 border-t border-slate-200 pt-3">
                <p className="text-xs font-medium text-slate-500">Recommendations</p>
                <ul className="mt-1 list-disc pl-4 text-sm text-slate-600">
                  {execSummary.recommendations?.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-800">Export Format</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setExportFormat("excel")}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              exportFormat === "excel"
                ? "bg-teal-500 text-white"
                : "border border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            Excel
          </button>
          <button
            onClick={() => setExportFormat("csv")}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              exportFormat === "csv"
                ? "bg-teal-500 text-white"
                : "border border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            CSV
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {reportTypes.map(({ id, icon: Icon, label, desc }) => (
          <div
            key={id}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <Icon className="h-8 w-8 text-teal-500" />
            <h3 className="mt-3 font-semibold text-slate-800">{label}</h3>
            <p className="mt-1 text-sm text-slate-500">{desc}</p>
            <button
              onClick={() => handleGenerate(id)}
              disabled={!!generating}
              className="mt-4 flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {generating === id ? "Generating..." : "Generate"}
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-800">Scheduled reports</h3>
        <ScheduledReportsList />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-800">Recent Reports</h3>
        <div className="space-y-3">
          {reports.length === 0 ? (
            <p className="text-sm text-slate-500">No reports generated yet. Generate one above.</p>
          ) : (
            reports.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
              >
                <div>
                  <p className="font-medium text-slate-800">{r.name}</p>
                  <p className="text-sm text-slate-500">{r.date} • {r.format}</p>
                </div>
                <span className="rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600">
                  {r.type}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ScheduledReportsList() {
  const [scheduled, setScheduled] = useState<{ id: string; type: string; format: string; frequency: string; nextRun: string }[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newReport, setNewReport] = useState({ type: "operational", format: "excel", frequency: "weekly" });
  useEffect(() => {
    apiFetch("/api/scheduled-reports").then((r) => r.ok ? r.json() : []).then(setScheduled);
  }, []);
  const handleAdd = async () => {
    const res = await apiFetch("/api/scheduled-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newReport) });
    if (!res.ok) return;
    apiFetch("/api/scheduled-reports").then((r) => r.ok ? r.json() : []).then(setScheduled);
    setShowAdd(false);
  };
  if (scheduled.length === 0 && !showAdd) return (
    <div>
      <p className="text-sm text-slate-500 mb-2">No scheduled reports.</p>
      <button onClick={() => setShowAdd(true)} className="text-sm text-teal-600 hover:text-teal-700">+ Schedule report</button>
    </div>
  );
  return (
    <div className="space-y-2">
      {showAdd && (
        <div className="rounded-lg border border-slate-200 p-3 flex gap-2 flex-wrap items-center">
          <select value={newReport.type} onChange={(e) => setNewReport((n) => ({ ...n, type: e.target.value }))} className="rounded border px-2 py-1 text-sm">
            <option value="operational">Operational</option>
            <option value="strategic">Strategic</option>
            <option value="compliance">Compliance</option>
          </select>
          <select value={newReport.format} onChange={(e) => setNewReport((n) => ({ ...n, format: e.target.value }))} className="rounded border px-2 py-1 text-sm">
            <option value="excel">Excel</option>
            <option value="csv">CSV</option>
          </select>
          <select value={newReport.frequency} onChange={(e) => setNewReport((n) => ({ ...n, frequency: e.target.value }))} className="rounded border px-2 py-1 text-sm">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <button onClick={handleAdd} className="rounded bg-teal-500 px-3 py-1 text-sm text-white">Add</button>
          <button onClick={() => setShowAdd(false)} className="rounded border px-3 py-1 text-sm">Cancel</button>
        </div>
      )}
      <button onClick={() => setShowAdd(true)} className="text-sm text-teal-600 hover:text-teal-700">+ Schedule report</button>
      {scheduled.map((r) => (
        <div key={r.id} className="flex justify-between rounded-lg border border-slate-100 p-2 text-sm">
          <span>{r.type} • {r.format} • {r.frequency}</span>
          <span className="text-slate-500">Next: {r.nextRun ? new Date(r.nextRun).toLocaleDateString() : "—"}</span>
        </div>
      ))}
    </div>
  );
}
