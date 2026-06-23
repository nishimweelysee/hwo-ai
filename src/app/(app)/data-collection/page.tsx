"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Upload,
  Database,
  FileSpreadsheet,
  CheckCircle,
  Download,
  RefreshCw,
  Users,
  History,
  Clock,
  AlertCircle,
  Plus,
} from "lucide-react";
import { apiDownload, apiFetch, parseApiError } from "@/lib/api";
import { useWorkforceCatalog } from "@/hooks/use-workforce-catalog";
import { usePermissions } from "@/hooks/use-permissions";
import { integrationStatusClass } from "@/lib/integration-status";
import { TextField, SelectField } from "@/components/form-fields";
import { filterStaffRows } from "@/lib/searchable-options";
import { ListSearchBar } from "@/components/list-search-bar";
import { usePagination } from "@/hooks/use-pagination";
import { Pagination } from "@/components/pagination";
import { writableSettingsPayload, SYNC_FREQUENCY_OPTIONS } from "@/lib/settings-config";

type Tab = "import" | "staff" | "history" | "scheduler";

type ImportField = {
  column: string;
  description: string;
  example: string;
  required: boolean;
};

type ImportTemplate = {
  type: "staff" | "shift" | "patient";
  name: string;
  description: string;
  filename: string;
  fields?: ImportField[];
};

type ImportRecord = {
  id: string;
  filename: string;
  type: string;
  validCount: number;
  duplicateCount: number;
  errorCount: number;
  quality: number;
  status: string;
  importedAt?: string;
  errors?: string[];
};

type StaffRow = {
  id: string;
  name: string;
  email?: string;
  role: string;
  departmentId: string;
  department?: string;
};

type Meta = {
  canManage: boolean;
  templates: ImportTemplate[];
  lastImport?: ImportRecord | null;
  validationSummary?: {
    valid: number;
    duplicates: number;
    missing: number;
    quality: number;
    lastImportAt?: string;
    lastImportType?: string;
    lastImportFilename?: string;
  };
  counts?: { staff: number; schedules: number; workloadRecords: number };
  hisStatus?: string;
  hisStatusLabel?: string;
  hisMessage?: string;
  syncSchedule?: {
    syncFrequency: string;
    syncTimeUtc: string;
    hisEnabled: boolean;
    hrEnabled: boolean;
  };
};

const EMPTY_STAFF = { name: "", role: "", departmentId: "", email: "" };

export default function DataCollectionPage() {
  const { canManageData, manageSettings } = usePermissions();
  const [tab, setTab] = useState<Tab>("import");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [importType, setImportType] = useState<"staff" | "shift" | "patient">("staff");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lastResult, setLastResult] = useState<{
    valid?: number;
    duplicates?: number;
    missing?: number;
    quality?: number;
    errors?: string[];
    errorsTruncated?: boolean;
    totalErrors?: number;
    linkNotice?: string;
    error?: string;
  } | null>(null);

  const [history, setHistory] = useState<ImportRecord[]>([]);
  const [historyStart, setHistoryStart] = useState("");
  const [historyEnd, setHistoryEnd] = useState("");

  const [staffRows, setStaffRows] = useState<StaffRow[]>([]);
  const [staffSearch, setStaffSearch] = useState("");

  const [syncFrequency, setSyncFrequency] = useState("daily");
  const [syncTimeUtc, setSyncTimeUtc] = useState("02:00");

  const templates = meta?.templates ?? [];
  const validation = meta?.validationSummary ?? { valid: 0, duplicates: 0, missing: 0, quality: 0 };

  const filteredStaff = useMemo(() => filterStaffRows(staffRows, staffSearch), [staffRows, staffSearch]);
  const staffPagination = usePagination(filteredStaff, 15, staffSearch);

  const loadMeta = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/import/meta");
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to load data collection settings"));
        return;
      }
      const data: Meta = await res.json();
      setMeta(data);
      if (data.syncSchedule) {
        setSyncFrequency(String(data.syncSchedule.syncFrequency ?? "daily"));
        setSyncTimeUtc(String(data.syncSchedule.syncTimeUtc ?? "02:00"));
      }
    } catch {
      setError("Failed to load data collection settings");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    const params = new URLSearchParams();
    if (historyStart) params.set("startDate", historyStart);
    if (historyEnd) params.set("endDate", historyEnd);
    const qs = params.toString();
    try {
      const res = await apiFetch(`/api/import/history${qs ? `?${qs}` : ""}`);
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to load import history"));
        return;
      }
      setHistory(await res.json());
    } catch {
      setError("Failed to load import history");
    }
  }, [historyStart, historyEnd]);

  const loadStaff = useCallback(async () => {
    try {
      const res = await apiFetch("/api/staff");
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to load staff"));
        return;
      }
      setStaffRows(await res.json());
    } catch {
      setError("Failed to load staff");
    }
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (tab === "history") loadHistory();
    if (tab === "staff") loadStaff();
  }, [tab, loadHistory, loadStaff]);

  const flash = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.name.toLowerCase().endsWith(".csv")) setFile(f);
    else if (f) setError("Only CSV files are supported. Download a template and save as .csv");
  }, []);

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.name.toLowerCase().endsWith(".csv")) {
      setFile(f);
      setError(null);
    } else if (f) {
      setError("Only CSV files are supported. Excel (.xlsx) is not accepted.");
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setLastResult(null);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", importType);
      const res = await apiFetch("/api/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setLastResult({ error: data.error ?? "Import failed" });
        return;
      }
      setLastResult(data);
      setFile(null);
      flash(`Imported ${data.validCount ?? data.valid ?? 0} records`);
      await loadMeta();
      if (tab === "history") await loadHistory();
    } catch {
      setLastResult({ error: "Upload failed" });
    } finally {
      setUploading(false);
    }
  };

  const saveScheduler = async () => {
    if (!manageSettings) {
      setError("Integration schedule requires settings:manage permission — use Configuration → Integrations");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = writableSettingsPayload("integrations", {
        syncFrequency,
        syncTimeUtc,
      });
      const res = await apiFetch("/api/settings/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to save sync schedule"));
        return;
      }
      flash("Sync schedule saved — applies when HIS/HR integrations are enabled");
      await loadMeta();
    } catch {
      setError("Failed to save sync schedule");
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "import", label: "Import" },
    { id: "staff", label: "Staff" },
    { id: "history", label: "History" },
    { id: "scheduler", label: "Scheduler" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Workforce Data Collection</h2>
          <p className="text-slate-600">Import CSV data, manage staff records, and monitor collection health</p>
          {!canManageData && (
            <p className="mt-2 text-sm text-amber-700">
              Data import and manual staff entry require the <strong>data:manage</strong> permission.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => { loadMeta(); if (tab === "history") loadHistory(); if (tab === "staff") loadStaff(); }}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>}

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard icon={Users} label="Staff records" value={meta?.counts?.staff ?? 0} color="teal" />
        <KpiCard icon={Clock} label="Schedule rows" value={meta?.counts?.schedules ?? 0} color="indigo" />
        <KpiCard icon={Database} label="Workload records" value={meta?.counts?.workloadRecords ?? 0} color="emerald" />
        <KpiCard icon={CheckCircle} label="Last import quality" value={`${validation.quality}%`} color="slate" />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
              tab === t.id ? "border border-b-0 border-slate-200 bg-white text-teal-700" : "text-slate-600 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && tab === "import" && <p className="text-sm text-slate-500">Loading…</p>}

      {!loading && tab === "import" && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-2 font-semibold text-slate-800">CSV import templates</h3>
            <p className="mb-4 text-sm text-slate-500">
              Download templates, fill in your data, and upload CSV files. Use department and role <strong>codes</strong> from Configuration.
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              {templates.map((template) => (
                <div
                  key={template.type}
                  role="button"
                  tabIndex={0}
                  onClick={() => setImportType(template.type)}
                  onKeyDown={(e) => e.key === "Enter" && setImportType(template.type)}
                  className={`rounded-lg border p-4 ${importType === template.type ? "border-teal-300 bg-teal-50/50" : "border-slate-200"}`}
                >
                  <p className="font-medium text-slate-800">{template.name}</p>
                  <p className="mt-1 text-sm text-slate-600">{template.description}</p>
                  {template.fields && template.fields.length > 0 && (
                    <dl className="mt-3 max-h-40 space-y-1 overflow-y-auto border-t border-slate-200 pt-3 text-xs">
                      {template.fields.map((field) => (
                        <div key={field.column}>
                          <dt className="font-semibold text-slate-700">
                            {field.column}
                            {field.required ? <span className="ml-1 text-rose-600">*</span> : null}
                          </dt>
                          <dd className="text-slate-500">{field.description}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      apiDownload(`/api/import/templates/${template.type}`, template.filename);
                    }}
                    className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50"
                  >
                    <Download className="h-4 w-4" />
                    Download CSV
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center"
            >
              <Upload className="mx-auto h-12 w-12 text-slate-400" />
              <h3 className="mt-4 font-semibold text-slate-800">Upload CSV</h3>
              <p className="mt-2 text-sm text-slate-500">CSV only — drag and drop or select a file</p>
              <div className="mt-3 flex justify-center gap-2">
                {(["staff", "shift", "patient"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setImportType(t)}
                    className={`rounded px-3 py-1 text-sm font-medium capitalize ${importType === t ? "bg-teal-500 text-white" : "bg-slate-200 text-slate-600"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {file && <p className="mt-2 text-sm font-medium text-teal-600">{file.name}</p>}
              <div className="mt-4 flex justify-center gap-2">
                <input type="file" accept=".csv" onChange={onFileSelect} className="hidden" id="file-upload" />
                <label
                  htmlFor="file-upload"
                  className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-white ${canManageData ? "bg-teal-500 hover:bg-teal-600" : "cursor-not-allowed bg-slate-300"}`}
                >
                  Select CSV
                </label>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!file || uploading || !canManageData}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  {uploading ? "Uploading…" : "Import"}
                </button>
              </div>
              {lastResult && !lastResult.error && (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-left text-sm text-emerald-800">
                  <p>
                    Imported {lastResult.valid ?? 0} · {lastResult.duplicates ?? 0} duplicates · {lastResult.missing ?? 0} errors · Quality {lastResult.quality ?? 0}%
                  </p>
                  {lastResult.errors && lastResult.errors.length > 0 && (
                    <ul className="mt-2 list-inside list-disc text-xs text-emerald-900">
                      {lastResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                  {lastResult.errorsTruncated && (
                    <p className="mt-1 text-xs">Showing first errors — {lastResult.totalErrors} total</p>
                  )}
                  {lastResult.linkNotice && (
                    <p className="mt-2 text-xs text-amber-800">{lastResult.linkNotice}</p>
                  )}
                </div>
              )}
              {lastResult?.error && <p className="mt-4 text-sm text-rose-600">{lastResult.error}</p>}
            </div>

            <div className="space-y-4">
              <StatusCard
                icon={FileSpreadsheet}
                title="Last import"
                subtitle={
                  meta?.lastImport
                    ? `${meta.lastImport.filename} · ${meta.lastImport.type} · ${meta.lastImport.validCount} valid · ${formatDate(meta.lastImport.importedAt)}`
                    : "No imports recorded yet"
                }
              />
              <StatusCard
                icon={Database}
                title="HIS connection"
                subtitle={meta?.hisMessage ?? "Configure HIS in Configuration → Integrations"}
                badge={meta?.hisStatusLabel}
                badgeStatus={meta?.hisStatus}
              />
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-3 font-semibold text-slate-800">Validation summary</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-emerald-50 p-3">
                    <p className="text-xl font-bold text-emerald-700">{validation.valid}</p>
                    <p className="text-emerald-600">Valid (last run)</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-3">
                    <p className="text-xl font-bold text-amber-700">{validation.duplicates}</p>
                    <p className="text-amber-600">Duplicates</p>
                  </div>
                  <div className="rounded-lg bg-rose-50 p-3">
                    <p className="text-xl font-bold text-rose-700">{validation.missing}</p>
                    <p className="text-rose-600">Errors / skipped</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xl font-bold text-slate-700">{validation.quality}%</p>
                    <p className="text-slate-600">Quality score</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === "staff" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 font-semibold text-slate-800">Manual staff entry</h3>
            <ManualStaffEntry canManage={canManageData} onSuccess={() => { flash("Staff added"); loadStaff(); loadMeta(); }} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold text-slate-800">Staff roster ({filteredStaff.length})</h3>
              <ListSearchBar
                value={staffSearch}
                onChange={setStaffSearch}
                placeholder="Search name, email, role, department, ID…"
                className="sm:max-w-sm"
              />
            </div>
            {filteredStaff.length === 0 ? (
              <p className="text-sm text-slate-500">No staff records. Import a staff CSV or add manually.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="pb-3 pr-3">Name</th>
                      <th className="pb-3 pr-3">Email</th>
                      <th className="pb-3 pr-3">Role</th>
                      <th className="pb-3">Department</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffPagination.paginatedItems.map((s) => (
                      <tr key={s.id} className="border-b border-slate-100">
                        <td className="py-2 pr-3 font-medium text-slate-800">{s.name}</td>
                        <td className="py-2 pr-3 text-slate-600">{s.email || "—"}</td>
                        <td className="py-2 pr-3 text-slate-600">{s.role}</td>
                        <td className="py-2 text-slate-600">{s.department || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination
                  className="mt-4"
                  page={staffPagination.page}
                  pageSize={staffPagination.pageSize}
                  totalItems={staffPagination.totalItems}
                  totalPages={staffPagination.totalPages}
                  onPageChange={staffPagination.setPage}
                  onPageSizeChange={staffPagination.setPageSize}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <TextField label="From" value={historyStart} onChange={setHistoryStart} type="date" />
            <TextField label="To" value={historyEnd} onChange={setHistoryEnd} type="date" />
            <button
              type="button"
              onClick={loadHistory}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Apply filter
            </button>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">No import history for the selected range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="pb-3 pr-3">When</th>
                    <th className="pb-3 pr-3">File</th>
                    <th className="pb-3 pr-3">Type</th>
                    <th className="pb-3 pr-3">Valid</th>
                    <th className="pb-3 pr-3">Duplicates</th>
                    <th className="pb-3 pr-3">Errors</th>
                    <th className="pb-3 pr-3">Quality</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3 text-slate-600">{formatDate(h.importedAt)}</td>
                      <td className="py-2 pr-3 font-medium">{h.filename}</td>
                      <td className="py-2 pr-3 capitalize">{h.type}</td>
                      <td className="py-2 pr-3">{h.validCount}</td>
                      <td className="py-2 pr-3">{h.duplicateCount}</td>
                      <td className="py-2 pr-3">{h.errorCount}</td>
                      <td className="py-2 pr-3">{h.quality}%</td>
                      <td className="py-2 capitalize">{h.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "scheduler" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-2 font-semibold text-slate-800">Automated collection schedule</h3>
          <p className="mb-4 text-sm text-slate-500">
            Sync frequency for HIS/HR integrations (Configuration → Integrations). Automated pulls run when integrations are enabled.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <SelectField
              label="Frequency"
              value={syncFrequency}
              options={SYNC_FREQUENCY_OPTIONS.map((f) => ({ value: f, label: f.charAt(0).toUpperCase() + f.slice(1) }))}
              onChange={setSyncFrequency}
            />
            <TextField label="Time (UTC)" value={syncTimeUtc} onChange={setSyncTimeUtc} type="time" />
            <button
              type="button"
              disabled={saving || !manageSettings}
              onClick={saveScheduler}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save schedule"}
            </button>
          </div>
          {!manageSettings && (
            <p className="mt-3 flex items-center gap-2 text-sm text-amber-700">
              <AlertCircle className="h-4 w-4" />
              Saving requires settings permission — view schedule in Configuration → Integrations.
            </p>
          )}
          {meta?.syncSchedule && (
            <p className="mt-3 text-xs text-slate-500">
              HIS {meta.syncSchedule.hisEnabled ? "enabled" : "disabled"} · HR {meta.syncSchedule.hrEnabled ? "enabled" : "disabled"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
  color: "teal" | "indigo" | "emerald" | "slate";
}) {
  const colors = {
    teal: "text-teal-500",
    indigo: "text-indigo-500",
    emerald: "text-emerald-500",
    slate: "text-slate-500",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <Icon className={`h-7 w-7 ${colors[color]}`} />
      <p className="mt-2 text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
    </div>
  );
}

function StatusCard({
  icon: Icon,
  title,
  subtitle,
  badge,
  badgeStatus,
}: {
  icon: typeof FileSpreadsheet;
  title: string;
  subtitle: string;
  badge?: string;
  badgeStatus?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Icon className="h-8 w-8 text-emerald-500" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-slate-800">{title}</p>
            {badge && badgeStatus && (
              <span className={`rounded px-2 py-0.5 text-xs ${integrationStatusClass(badgeStatus)}`}>{badge}</span>
            )}
          </div>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <CheckCircle className="h-5 w-5 text-emerald-500" />
      </div>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function ManualStaffEntry({ canManage, onSuccess }: { canManage: boolean; onSuccess: () => void }) {
  const { departments, staffRoles, loading } = useWorkforceCatalog();
  const [form, setForm] = useState(EMPTY_STAFF);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add staff");
        return;
      }
      setForm(EMPTY_STAFF);
      onSuccess();
    } catch {
      setError("Failed to add staff");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {error && <p className="text-sm text-rose-600 md:col-span-5">{error}</p>}
      <TextField label="Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
      <SelectField
        label="Role"
        value={form.role}
        options={staffRoles.map((r) => ({ value: r.name, label: `${r.name} (${r.code})` }))}
        onChange={(v) => setForm((f) => ({ ...f, role: v }))}
        placeholder="Select role"
      />
      <SelectField
        label="Department"
        value={form.departmentId}
        options={departments.map((d) => ({ value: d.id, label: d.name }))}
        onChange={(v) => setForm((f) => ({ ...f, departmentId: v }))}
        placeholder="Select department"
      />
      <TextField label="Email (optional)" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} type="email" />
      <div className="flex items-end">
        <button
          type="submit"
          disabled={saving || loading || !canManage}
          className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {saving ? "Saving…" : "Add staff"}
        </button>
      </div>
    </form>
  );
}
