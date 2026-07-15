"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiDownload } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";
import { ClipboardList, Search } from "lucide-react";

export default function AuditPage() {
  const { canExportAudit } = usePermissions();
  const [logs, setLogs] = useState<{ time: string; user: string; action: string; type: string }[]>([]);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [anomalies, setAnomalies] = useState<{ user: string; count: number; threshold: number }[]>([]);

  useEffect(() => {
    const type = filter === "all" ? "" : filter;
    const url = searchQuery
      ? `/api/audit/search?q=${encodeURIComponent(searchQuery)}&type=${type}`
      : `/api/audit?type=${type}`;
    apiFetch(url)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        if (Array.isArray(data)) {
          setLogs(data.map((l: { time?: string; user?: string; action?: string; type?: string }) => ({
            time: l.time ?? "",
            user: l.user ?? "",
            action: l.action ?? "",
            type: l.type ?? "",
          })));
        }
      });
  }, [filter, searchQuery]);

  useEffect(() => {
    apiFetch("/api/audit/anomalies")
      .then((r) => r.ok ? r.json() : { anomalies: [] })
      .then((d: { anomalies?: { user: string; count: number; threshold: number }[] }) => setAnomalies(d.anomalies || []));
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <ClipboardList className="h-7 w-7 text-teal-600" />
            Audit & Logging
          </h2>
          <p className="mt-1 text-slate-600">
            Comprehensive activity tracking, change history, and anomaly detection
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search audit logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 focus:border-teal-500 focus:outline-none"
            />
          </div>
        </div>
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); if (canExportAudit) apiDownload("/api/audit/export?format=csv", "audit-export.csv"); }}
          className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${canExportAudit ? "bg-teal-500 hover:bg-teal-600" : "cursor-not-allowed bg-slate-300"}`}
        >
          Export Excel
        </a>
        <button
          type="button"
          onClick={() => canExportAudit && apiDownload("/api/audit/export?format=csv", "audit-export.csv")}
          disabled={!canExportAudit}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Export CSV
        </button>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-4 py-2 focus:border-teal-500 focus:outline-none"
        >
          <option value="all">All actions</option>
          <option value="read">Read</option>
          <option value="write">Write</option>
          <option value="export">Export</option>
          <option value="import">Import</option>
          <option value="approve">Approve</option>
        </select>
      </div>

      {anomalies.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="mb-2 font-semibold text-amber-800">Anomaly Detection Alerts</h3>
          <ul className="space-y-1 text-sm text-amber-700">
            {anomalies.map((a, i) => (
              <li key={i}>{a.user}: {a.count} events (threshold exceeded)</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4 flex justify-between items-center">
          <h3 className="font-semibold text-slate-800">User Action Timeline</h3>
          <span className="text-sm text-slate-500">Filter by type above</span>
        </div>
        <div className="divide-y divide-slate-100">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ClipboardList className="mb-3 h-10 w-10 text-slate-300" />
              <p className="font-medium text-slate-600">No audit logs found</p>
              <p className="mt-1 text-sm text-slate-400">
                {searchQuery ? `No results for "${searchQuery}" — try a different search term.` : "Activity will appear here as users perform actions in the system."}
              </p>
            </div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="flex items-center gap-4 p-4 hover:bg-slate-50/60 transition-colors">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                  <ClipboardList className="h-4 w-4 text-slate-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-slate-800">{log.action}</p>
                  <p className="text-sm text-slate-500">{log.user}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      log.type === "write" || log.type === "import"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {log.type}
                  </span>
                  <span className="text-sm text-slate-500">{log.time}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-800">Forensic Investigation Tools</h3>
        <div className="flex flex-wrap gap-4">
          <button type="button" onClick={() => apiDownload("/api/audit/export?format=csv", "audit-export.csv")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Export full audit trail
          </button>
          <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Filter by user
          </button>
          <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Filter by date range
          </button>
          <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Retention compliance report
          </button>
        </div>
      </div>
    </div>
  );
}
