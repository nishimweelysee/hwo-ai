"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiDownload } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";
import { integrationStatusClass, integrationStatusLabel, type IntegrationSource } from "@/lib/integration-status";
import { parseApiError, writableSettingsPayload } from "@/lib/settings-config";
import { Database, Shield, Archive } from "lucide-react";

function DataLineage() {
  const [sources, setSources] = useState<IntegrationSource[]>([]);
  useEffect(() => {
    apiFetch("/api/data-settings/lineage")
      .then((r) => r.ok ? r.json() : { sources: [] })
      .then((d: { sources?: IntegrationSource[] }) => setSources(d.sources || []));
  }, []);
  return (
    <div className="space-y-3">
      {sources.map((s, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-800">{s.name}</span>
            <span className={`rounded px-1.5 py-0.5 text-xs ${integrationStatusClass(s.status)}`}>
              {s.statusLabel || integrationStatusLabel(s.status)}
            </span>
            <span className="text-slate-500 text-sm">{s.records} records</span>
            {s.localRecords != null && s.localRecords > 0 && s.status === "local_data" && (
              <span className="text-xs text-amber-700">({s.localRecords} local)</span>
            )}
          </div>
          {s.message && <p className="mt-2 text-xs text-slate-500">{s.message}</p>}
        </div>
      ))}
    </div>
  );
}

function ArchivalBrowser() {
  const [archives, setArchives] = useState<{ period: string; size: string; status: string }[]>([]);
  useEffect(() => {
    apiFetch("/api/data-settings/archives")
      .then((r) => r.ok ? r.json() : { archives: [] })
      .then((d: { archives?: { period: string; size: string; status: string }[] }) => setArchives(d.archives || []));
  }, []);
  return (
    <div className="space-y-2 max-h-48 overflow-y-auto">
      {archives.map((a, i) => (
        <div key={i} className="flex justify-between rounded border border-slate-100 p-2 text-sm">
          <span>{a.period} ({a.size})</span>
          <span className="text-slate-500">{a.status}</span>
        </div>
      ))}
    </div>
  );
}

export default function DataManagementPage() {
  const { canManageData } = usePermissions();
  const [settings, setSettings] = useState<{
    retentionYears?: number;
    anonymization?: boolean;
    backupFrequency?: string;
    encryption?: string;
    hisConnected?: boolean;
    hrConnected?: boolean;
    hisStatus?: string;
    hrStatus?: string;
    hisStatusLabel?: string;
    hrStatusLabel?: string;
    hisMessage?: string;
    hrMessage?: string;
    hisLocalRecords?: number;
    hrLocalRecords?: number;
    quality?: { completeness: number; accuracy: number; integrityIssues: number };
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/data-settings")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setSettings(d));
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    const payload = writableSettingsPayload("data", settings as Record<string, unknown>);
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch("/api/data-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to save settings"));
        return;
      }
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
      setSuccess("Settings saved successfully");
    } catch {
      setError("Failed to save settings — check that the backend is running");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Data Management & Security</h2>
          <p className="text-slate-600">Loading settings from Configuration…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Data Management & Security</h2>
        <p className="text-slate-600">
          Secure storage, anonymization, and data quality
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
      )}
      {!canManageData && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You need the <strong>data:manage</strong> permission to change data retention and security settings.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Database className="h-8 w-8 text-teal-500" />
          <p className="mt-2 text-sm text-slate-500">Encryption</p>
          <p className="font-medium text-emerald-600">{settings.encryption || "—"} Enabled</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Shield className="h-8 w-8 text-teal-500" />
          <p className="mt-2 text-sm text-slate-500">Anonymization</p>
          <p className="font-medium text-emerald-600">
            {settings.anonymization ? "Active" : "Disabled"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Archive className="h-8 w-8 text-teal-500" />
          <p className="mt-2 text-sm text-slate-500">Retention Policy</p>
          <p className="font-medium text-slate-700">{settings.retentionYears} years</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-800">Configuration</h3>
        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-slate-700">Retention (years)</label>
            <input
              type="number"
              min={1}
              max={30}
              value={settings.retentionYears}
              onChange={(e) =>
                setSettings((s) => s ? { ...s, retentionYears: parseInt(e.target.value) || s.retentionYears || 1 } : s)
              }
              className="mt-1 rounded-lg border border-slate-200 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Backup frequency</label>
            <select
              value={settings.backupFrequency}
              onChange={(e) =>
                setSettings((s) => ({ ...s, backupFrequency: e.target.value }))
              }
              className="mt-1 rounded-lg border border-slate-200 px-3 py-2"
            >
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.anonymization}
              onChange={(e) =>
                setSettings((s) => ({ ...s, anonymization: e.target.checked }))
              }
              className="rounded"
            />
            <label className="text-sm text-slate-700">Enable data anonymization</label>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !canManageData}
            className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save settings"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-800">Data Lineage Visualization</h3>
        <DataLineage />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-800">Data Integration Configuration</h3>
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex justify-between items-start gap-3">
              <span className="font-medium text-slate-800">HIS Connection</span>
              <span className={`rounded px-2 py-0.5 text-xs shrink-0 ${integrationStatusClass(settings.hisStatus || (settings.hisConnected ? "connected" : "not_configured"))}`}>
                {settings.hisStatusLabel || integrationStatusLabel(settings.hisStatus || "", settings.hisConnected ? "Connected" : "Not configured")}
              </span>
            </div>
            {settings.hisMessage && <p className="mt-2 text-xs text-slate-500">{settings.hisMessage}</p>}
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex justify-between items-start gap-3">
              <span className="font-medium text-slate-800">HR System</span>
              <span className={`rounded px-2 py-0.5 text-xs shrink-0 ${integrationStatusClass(settings.hrStatus || (settings.hrConnected ? "connected" : "not_configured"))}`}>
                {settings.hrStatusLabel || integrationStatusLabel(settings.hrStatus || "", settings.hrConnected ? "Connected" : "Not configured")}
              </span>
            </div>
            {settings.hrMessage && <p className="mt-2 text-xs text-slate-500">{settings.hrMessage}</p>}
          </div>
          <p className="text-xs text-slate-500">
            Configure endpoints in Configuration → Integrations. &quot;Connected&quot; requires a reachable URL health check — local seed data is shown as &quot;Local data&quot;.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-800">Data Archival Browser</h3>
        <ArchivalBrowser />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-800">Data Quality Dashboard</h3>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-2xl font-bold text-slate-800">{settings.quality?.completeness ?? 0}%</p>
            <p className="text-sm text-slate-600">Completeness</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-2xl font-bold text-slate-800">{settings.quality?.accuracy ?? 0}%</p>
            <p className="text-sm text-slate-600">Accuracy</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-2xl font-bold text-slate-800 capitalize">{settings.backupFrequency}</p>
            <p className="text-sm text-slate-600">Backup Frequency</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-2xl font-bold text-slate-800">{settings.quality?.integrityIssues ?? 0}</p>
            <p className="text-sm text-slate-600">Integrity Issues</p>
          </div>
        </div>
      </div>
    </div>
  );
}
