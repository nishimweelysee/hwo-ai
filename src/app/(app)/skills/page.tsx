"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Download,
  Search,
  Sparkles,
  GraduationCap,
  Grid3X3,
} from "lucide-react";
import { apiDownload, apiFetch, parseApiError } from "@/lib/api";
import { TextField, SelectField, SearchableSelectField } from "@/components/form-fields";
import { staffToSearchableOptions } from "@/lib/searchable-options";
import { usePagination } from "@/hooks/use-pagination";
import { Pagination } from "@/components/pagination";

type Tab = "overview" | "certifications" | "matrix" | "training" | "development";

type Cert = {
  id: string;
  staffId: string;
  staffName: string;
  certName: string;
  name: string;
  expiry: string;
  issuedDate?: string;
  status: string;
  department: string;
  departmentId?: string;
  credentialId?: string;
  notes?: string;
  daysToExpiry?: number;
};

type SkillRow = { skill: string; counts: Record<string, number>; total?: number };
type TrainingNeed = {
  id?: string;
  certification: string;
  staffCount: number;
  description: string;
  gapType?: string;
  department?: string;
  priority?: string;
  priority_score?: number;
  rank?: number;
  rationale?: string;
  aiPowered?: boolean;
};
type DevProgram = {
  id: string;
  name: string;
  description?: string;
  active?: boolean;
  enrolled: number;
  completed: number;
  enrollments?: {
    id: string;
    staffId: string;
    staffName: string;
    status: string;
    enrolledAt?: string;
    completedAt?: string;
  }[];
};
type DevRecommendation = { program: string; reason: string; priority: string };
type DeptCoverage = {
  department: string;
  coveragePercent: number;
  staffTotal: number;
  qualifiedStaff: number;
  requiredCerts: string[];
};

type Meta = {
  statuses: string[];
  staff: { id: string; name: string; department: string; email?: string; role?: string }[];
  departments: { id: string; name: string }[];
  certCatalog?: string[];
  canManage: boolean;
};

const EMPTY_CERT = {
  staffId: "",
  name: "",
  expiry: "",
  issuedDate: "",
  status: "active",
  credentialId: "",
  notes: "",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  expiring: "bg-amber-100 text-amber-800",
  expired: "bg-rose-100 text-rose-700",
  revoked: "bg-slate-100 text-slate-600",
  urgent: "bg-rose-100 text-rose-800",
  high: "bg-amber-100 text-amber-800",
  medium: "bg-blue-100 text-blue-800",
  low: "bg-slate-100 text-slate-700",
};

function statusClass(s: string) {
  return STATUS_COLORS[s] ?? "bg-slate-100 text-slate-700";
}

export default function SkillsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [data, setData] = useState({
    certifications: [] as Cert[],
    totalSkills: 0,
    staffWithProfiles: 0,
    expiringCount: 0,
    skillGaps: 0,
    skillMatrix: [] as SkillRow[],
    trainingNeeds: [] as TrainingNeed[],
    aiTrainingPriorities: [] as TrainingNeed[],
    developmentPrograms: [] as DevProgram[],
    departmentCoverage: [] as DeptCoverage[],
    canManage: false,
  });
  const [aiHealth, setAiHealth] = useState<{ skillsAiActive?: boolean; aiServiceHealthy?: boolean } | null>(null);
  const [aiGapAnalysis, setAiGapAnalysis] = useState<{ avg_coverage?: number; at_risk_departments?: number } | null>(null);

  const [certSearch, setCertSearch] = useState("");
  const [certStatus, setCertStatus] = useState("");
  const [filteredCerts, setFilteredCerts] = useState<Cert[]>([]);

  const [showCertForm, setShowCertForm] = useState(false);
  const [editingCertId, setEditingCertId] = useState<string | null>(null);
  const [certForm, setCertForm] = useState(EMPTY_CERT);

  const [showProgramForm, setShowProgramForm] = useState(false);
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [programForm, setProgramForm] = useState({ name: "", description: "" });
  const [enrollProgramId, setEnrollProgramId] = useState<string | null>(null);
  const [enrollStaffId, setEnrollStaffId] = useState("");
  const [devStaffId, setDevStaffId] = useState("");
  const [devRecommendations, setDevRecommendations] = useState<{
    recommendations?: DevRecommendation[];
    top_pick?: string;
    staffName?: string;
    skillGaps?: string[];
    aiPowered?: boolean;
  } | null>(null);
  const [loadingDev, setLoadingDev] = useState(false);

  const certCatalogOptions = useMemo(
    () => (meta?.certCatalog ?? []).map((c) => ({ value: c, label: c })),
    [meta]
  );

  const deptOptions = useMemo(
    () => (meta?.departments ?? []).map((d) => ({ value: d.id, label: d.name })),
    [meta]
  );
  const staffOptions = useMemo(
    () =>
      staffToSearchableOptions(
        (meta?.staff ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          role: s.role,
          department: s.department,
        }))
      ),
    [meta]
  );
  const matrixDepts = useMemo(() => {
    const fromMatrix = data.skillMatrix.flatMap((r) => Object.keys(r.counts || {}));
    return [...new Set(fromMatrix.length ? fromMatrix : (meta?.departments ?? []).map((d) => d.name))];
  }, [data.skillMatrix, meta]);

  const skillsAiActive = Boolean(aiHealth?.skillsAiActive);
  const trainingRows = data.aiTrainingPriorities.length ? data.aiTrainingPriorities : data.trainingNeeds;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, metaRes] = await Promise.all([
        apiFetch("/api/certifications"),
        apiFetch("/api/certifications/meta"),
      ]);
      if (!dashRes.ok) {
        setError(await parseApiError(dashRes, "Failed to load skills data"));
        return;
      }
      const dash = await dashRes.json();
      setData({
        certifications: dash.certifications ?? [],
        totalSkills: dash.totalSkills ?? 0,
        staffWithProfiles: dash.staffWithProfiles ?? 0,
        expiringCount: dash.expiringCount ?? 0,
        skillGaps: dash.skillGaps ?? 0,
        skillMatrix: dash.skillMatrix ?? [],
        trainingNeeds: dash.trainingNeeds ?? [],
        aiTrainingPriorities: dash.aiTrainingPriorities ?? [],
        developmentPrograms: dash.developmentPrograms ?? [],
        departmentCoverage: dash.departmentCoverage ?? [],
        canManage: dash.canManage ?? false,
      });
      setAiHealth(dash.aiHealth ?? null);
      setAiGapAnalysis(dash.aiGapAnalysis ?? null);
      if (metaRes.ok) setMeta(await metaRes.json());
    } catch {
      setError("Failed to load skills & competency data");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCerts = useCallback(async () => {
    const params = new URLSearchParams();
    if (certSearch.trim()) params.set("search", certSearch.trim());
    if (certStatus) params.set("status", certStatus);
    const qs = params.toString();
    try {
      const res = await apiFetch(`/api/certifications/list${qs ? `?${qs}` : ""}`);
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to load certifications"));
        return;
      }
      setFilteredCerts(await res.json());
    } catch {
      setError("Failed to load certifications");
    }
  }, [certSearch, certStatus]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab === "certifications") loadCerts();
  }, [tab, loadCerts, certStatus]);

  const flash = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const openCreateCert = () => {
    setEditingCertId(null);
    setCertForm({
      ...EMPTY_CERT,
      staffId: staffOptions[0]?.value ?? "",
      name: certCatalogOptions[0]?.value ?? "",
    });
    setShowCertForm(true);
  };

  const openEditCert = (c: Cert) => {
    setEditingCertId(c.id);
    setCertForm({
      staffId: c.staffId,
      name: c.certName,
      expiry: c.expiry,
      issuedDate: c.issuedDate ?? "",
      status: c.status,
      credentialId: c.credentialId ?? "",
      notes: c.notes ?? "",
    });
    setShowCertForm(true);
  };

  const saveCert = async () => {
    if (!certForm.staffId || !certForm.name) {
      setError(certCatalogOptions.length === 0
        ? "Configure the certification catalog in Configuration → Skills first"
        : "Staff and certification are required");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      staffId: certForm.staffId,
      name: certForm.name,
      expiry: certForm.expiry,
      issuedDate: certForm.issuedDate || undefined,
      status: certForm.status,
      credentialId: certForm.credentialId,
      notes: certForm.notes,
    };
    try {
      const res = editingCertId
        ? await apiFetch(`/api/certifications/${editingCertId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await apiFetch("/api/certifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to save certification"));
        return;
      }
      setShowCertForm(false);
      flash(editingCertId ? "Certification updated" : "Certification added");
      await load();
      if (tab === "certifications") await loadCerts();
    } catch {
      setError("Failed to save certification");
    } finally {
      setSaving(false);
    }
  };

  const deleteCert = async (id: string) => {
    if (!confirm("Delete this certification record?")) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/certifications/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to delete certification"));
        return;
      }
      flash("Certification deleted");
      await load();
      if (tab === "certifications") await loadCerts();
    } catch {
      setError("Failed to delete certification");
    } finally {
      setSaving(false);
    }
  };

  const exportCerts = async () => {
    try {
      await apiDownload("/api/certifications/export", "certifications.csv");
      flash("Certifications exported");
    } catch {
      setError("Failed to export certifications");
    }
  };

  const openCreateProgram = () => {
    setEditingProgramId(null);
    setProgramForm({ name: "", description: "" });
    setShowProgramForm(true);
  };

  const openEditProgram = (p: DevProgram) => {
    setEditingProgramId(p.id);
    setProgramForm({ name: p.name, description: p.description ?? "" });
    setShowProgramForm(true);
  };

  const saveProgram = async () => {
    if (!programForm.name.trim()) {
      setError("Program name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = editingProgramId
        ? await apiFetch(`/api/certifications/programs/${editingProgramId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(programForm),
          })
        : await apiFetch("/api/certifications/programs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(programForm),
          });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to save program"));
        return;
      }
      setShowProgramForm(false);
      flash(editingProgramId ? "Program updated" : "Program created");
      await load();
    } catch {
      setError("Failed to save program");
    } finally {
      setSaving(false);
    }
  };

  const deleteProgram = async (id: string) => {
    if (!confirm("Delete this program and all enrollments?")) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/certifications/programs/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to delete program"));
        return;
      }
      flash("Program deleted");
      await load();
    } catch {
      setError("Failed to delete program");
    } finally {
      setSaving(false);
    }
  };

  const enrollInProgram = async (programId: string) => {
    if (!enrollStaffId) {
      setError("Select a staff member to enroll");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/certifications/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId, staffId: enrollStaffId }),
      });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to enroll staff"));
        return;
      }
      setEnrollProgramId(null);
      setEnrollStaffId("");
      flash("Staff enrolled");
      await load();
    } catch {
      setError("Failed to enroll staff");
    } finally {
      setSaving(false);
    }
  };

  const completeEnrollment = async (enrollmentId: string) => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/certifications/enrollments/${enrollmentId}/complete`, { method: "PATCH" });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to complete enrollment"));
        return;
      }
      flash("Enrollment marked complete");
      await load();
    } catch {
      setError("Failed to complete enrollment");
    } finally {
      setSaving(false);
    }
  };

  const loadStaffDevelopment = async (staffId: string) => {
    if (!staffId) {
      setDevRecommendations(null);
      return;
    }
    setLoadingDev(true);
    try {
      const res = await apiFetch(`/api/certifications/ai/development/${staffId}`);
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to load development recommendations"));
        return;
      }
      setDevRecommendations(await res.json());
    } catch {
      setError("Failed to load development recommendations");
    } finally {
      setLoadingDev(false);
    }
  };

  const certRows = tab === "certifications" ? filteredCerts : data.certifications;
  const certPagination = usePagination(certRows, 15, `${tab}-${certSearch}-${certStatus}`);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "certifications", label: "Certifications" },
    { id: "matrix", label: "Skill Matrix" },
    { id: "training", label: "Training" },
    { id: "development", label: "Development" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Skills & Competency Management</h2>
          <p className="text-slate-600">Certifications, competency gaps, training priorities, and development planning</p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>}

      <div className={`rounded-xl border px-4 py-3 ${skillsAiActive ? "border-indigo-200 bg-indigo-50/60" : "border-amber-200 bg-amber-50/60"}`}>
        <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <Sparkles className={`h-4 w-4 ${skillsAiActive ? "text-indigo-600" : "text-amber-600"}`} />
          AI Skills: {skillsAiActive ? "Active — training prioritization & gap analysis" : "Offline — using rule-based fallback"}
        </p>
        {skillsAiActive && aiGapAnalysis && (
          <p className="mt-1 text-xs text-slate-600">
            Avg dept coverage {aiGapAnalysis.avg_coverage ?? 100}% · {aiGapAnalysis.at_risk_departments ?? 0} department(s) below target
          </p>
        )}
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

      {loading && <p className="text-sm text-slate-500">Loading skills data…</p>}

      {!loading && tab === "overview" && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <Award className="h-8 w-8 text-teal-500" />
              <p className="mt-2 text-sm text-slate-500">Cert Types Tracked</p>
              <p className="text-2xl font-bold text-slate-800">{data.totalSkills}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Staff with Profiles</p>
              <p className="text-2xl font-bold text-slate-800">{data.staffWithProfiles}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <AlertCircle className="h-8 w-8 text-amber-500" />
              <p className="mt-2 text-sm text-slate-500">Expiring / Expired</p>
              <p className="text-2xl font-bold text-slate-800">{data.expiringCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Competency Gaps</p>
              <p className="text-2xl font-bold text-slate-800">{data.skillGaps}</p>
            </div>
          </div>

          {data.departmentCoverage.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 font-semibold text-slate-800">Department Certification Coverage</h3>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {data.departmentCoverage.map((d) => (
                  <div key={d.department} className="rounded-lg border border-slate-100 p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-slate-800">{d.department}</p>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${d.coveragePercent >= 80 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
                        {d.coveragePercent}%
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {d.qualifiedStaff}/{d.staffTotal} staff meet requirements
                      {d.requiredCerts?.length ? ` · ${d.requiredCerts.join(", ")}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {trainingRows.length > 0 && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-6 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-800">
                <Sparkles className="h-5 w-5 text-indigo-600" />
                {skillsAiActive ? "AI Training Priorities" : "Top Training Needs"}
              </h3>
              <ul className="space-y-2 text-sm">
                {trainingRows.slice(0, 5).map((t, i) => (
                  <li key={t.id ?? i} className="flex justify-between rounded border border-indigo-100 bg-white p-2">
                    <div>
                      <p className="font-medium text-slate-800">{t.certification}</p>
                      <p className="text-xs text-slate-500">{t.rationale ?? t.description}</p>
                    </div>
                    <div className="text-right">
                      <span className={`rounded px-2 py-0.5 text-xs capitalize ${statusClass(t.priority ?? "medium")}`}>{t.priority ?? "medium"}</span>
                      <p className="mt-1 text-xs text-slate-500">{t.staffCount} staff</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {!loading && tab === "certifications" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-slate-800">Staff Certifications</h3>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={exportCerts} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                <Download className="h-4 w-4" /> Export
              </button>
              {data.canManage && (
                <button type="button" onClick={openCreateCert} className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700">
                  <Plus className="h-4 w-4" /> Add Certification
                </button>
              )}
            </div>
          </div>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={certSearch}
                  onChange={(e) => setCertSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadCerts()}
                  placeholder="Staff or cert name…"
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
                />
              </div>
            </div>
            <div className="min-w-[140px]">
              <SelectField
                label="Status"
                value={certStatus}
                options={[{ value: "", label: "All" }, ...(meta?.statuses ?? ["active", "expiring", "expired"]).map((s) => ({ value: s, label: s }))]}
                onChange={(v) => setCertStatus(v)}
              />
            </div>
            <button type="button" onClick={() => loadCerts()} className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">Apply</button>
          </div>
          {certRows.length === 0 ? (
            <p className="text-sm text-slate-500">No certifications match your filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="pb-3 pr-3">Certification</th>
                    <th className="pb-3 pr-3">Staff</th>
                    <th className="pb-3 pr-3">Department</th>
                    <th className="pb-3 pr-3">Expiry</th>
                    <th className="pb-3 pr-3">Status</th>
                    {data.canManage && <th className="pb-3">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {certPagination.paginatedItems.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100">
                      <td className="py-3 pr-3 font-medium text-slate-800">{c.certName}</td>
                      <td className="py-3 pr-3">{c.staffName}</td>
                      <td className="py-3 pr-3 text-slate-600">{c.department || "—"}</td>
                      <td className="py-3 pr-3">{c.expiry || "—"}</td>
                      <td className="py-3 pr-3">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${statusClass(c.status)}`}>{c.status}</span>
                      </td>
                      {data.canManage && (
                        <td className="py-3">
                          <div className="flex gap-2">
                            <button type="button" onClick={() => openEditCert(c)} className="text-teal-600 hover:text-teal-800"><Pencil className="h-4 w-4" /></button>
                            <button type="button" onClick={() => deleteCert(c.id)} className="text-rose-600 hover:text-rose-800"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                className="mt-4"
                page={certPagination.page}
                pageSize={certPagination.pageSize}
                totalItems={certPagination.totalItems}
                totalPages={certPagination.totalPages}
                onPageChange={certPagination.setPage}
                onPageSizeChange={certPagination.setPageSize}
              />
            </div>
          )}
        </div>
      )}

      {!loading && tab === "matrix" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Grid3X3 className="h-5 w-5 text-slate-500" />
            <h3 className="font-semibold text-slate-800">Skills Matrix by Department</h3>
          </div>
          {data.skillMatrix.length === 0 ? (
            <p className="text-sm text-slate-500">No competency data yet — add certifications to staff.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="pb-2 text-left font-medium text-slate-600">Skill / Cert</th>
                    {matrixDepts.map((d) => (
                      <th key={d} className="pb-2 text-center font-medium text-slate-600">{d}</th>
                    ))}
                    <th className="pb-2 text-center font-medium text-slate-600">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.skillMatrix.map((row, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2 font-medium text-slate-800">{row.skill}</td>
                      {matrixDepts.map((d) => (
                        <td key={d} className="py-2 text-center">
                          <span className={`rounded px-2 py-0.5 ${(row.counts?.[d] ?? 0) > 0 ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-400"}`}>
                            {row.counts?.[d] ?? 0}
                          </span>
                        </td>
                      ))}
                      <td className="py-2 text-center font-medium">{row.total ?? Object.values(row.counts || {}).reduce((a, b) => a + b, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!loading && tab === "training" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 font-semibold text-slate-800">Training Needs & Gaps</h3>
            {trainingRows.length === 0 ? (
              <p className="text-sm text-slate-500">No training needs identified — all requirements met and certs current.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      {skillsAiActive && <th className="pb-3 pr-3">Rank</th>}
                      <th className="pb-3 pr-3">Certification</th>
                      <th className="pb-3 pr-3">Staff</th>
                      <th className="pb-3 pr-3">Type</th>
                      <th className="pb-3 pr-3">Priority</th>
                      <th className="pb-3">Rationale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainingRows.map((t, i) => (
                      <tr key={t.id ?? i} className="border-b border-slate-100">
                        {skillsAiActive && <td className="py-2 pr-3 text-slate-500">#{t.rank ?? i + 1}</td>}
                        <td className="py-2 pr-3 font-medium">{t.certification}</td>
                        <td className="py-2 pr-3">{t.staffCount}</td>
                        <td className="py-2 pr-3 capitalize">{t.gapType ?? "renewal"}</td>
                        <td className="py-2 pr-3">
                          <span className={`rounded px-2 py-0.5 text-xs capitalize ${statusClass(t.priority ?? "medium")}`}>{t.priority ?? "medium"}</span>
                        </td>
                        <td className="py-2 text-slate-600">{t.rationale ?? t.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && tab === "development" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-slate-500" />
                <h3 className="font-semibold text-slate-800">Professional Development Programs</h3>
              </div>
              {data.canManage && (
                <button
                  type="button"
                  onClick={openCreateProgram}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
                >
                  <Plus className="h-4 w-4" /> Add Program
                </button>
              )}
            </div>
            {data.developmentPrograms.length === 0 ? (
              <p className="text-sm text-slate-500">No development programs yet. Add one or seed via Configuration → Skills.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {data.developmentPrograms.map((p) => (
                  <div key={p.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-800">{p.name}</p>
                        {p.description && <p className="mt-1 text-sm text-slate-500">{p.description}</p>}
                        <p className="mt-2 text-sm text-teal-700">{p.enrolled} enrolled · {p.completed} completed</p>
                      </div>
                      {data.canManage && (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => openEditProgram(p)} className="text-teal-600 hover:text-teal-800" title="Edit">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => deleteProgram(p.id)} className="text-rose-600 hover:text-rose-800" title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    {p.enrollments && p.enrollments.length > 0 && (
                      <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
                        {p.enrollments.map((e) => (
                          <li key={e.id} className="flex items-center justify-between gap-2">
                            <span>{e.staffName} — {e.status}</span>
                            {data.canManage && e.status === "enrolled" && (
                              <button type="button" onClick={() => completeEnrollment(e.id)} className="text-teal-600 hover:text-teal-700">
                                Complete
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {data.canManage && (
                      <div className="mt-3">
                        {enrollProgramId === p.id ? (
                          <div className="flex flex-wrap items-end gap-2">
                            <div className="min-w-[180px] flex-1">
                              <SearchableSelectField label="Staff" value={enrollStaffId} options={staffOptions} onChange={setEnrollStaffId} placeholder="Select staff" />
                            </div>
                            <button type="button" disabled={saving} onClick={() => enrollInProgram(p.id)} className="rounded-lg bg-teal-600 px-3 py-2 text-sm text-white hover:bg-teal-700 disabled:opacity-50">
                              Enroll
                            </button>
                            <button type="button" onClick={() => setEnrollProgramId(null)} className="rounded-lg border px-3 py-2 text-sm">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => { setEnrollProgramId(p.id); setEnrollStaffId(staffOptions[0]?.value ?? ""); }} className="text-sm font-medium text-teal-600 hover:text-teal-700">
                            Enroll staff
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-6 shadow-sm">
            <h3 className="mb-3 font-semibold text-slate-800">AI Development Recommendations</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px]">
                <SearchableSelectField
                  label="Staff member"
                  value={devStaffId}
                  options={staffOptions}
                  onChange={(v) => { setDevStaffId(v); loadStaffDevelopment(v); }}
                  placeholder="Select staff"
                />
              </div>
            </div>
            {loadingDev && <p className="mt-3 text-sm text-slate-500">Loading recommendations…</p>}
            {devRecommendations && !loadingDev && (
              <div className="mt-4 space-y-2">
                {devRecommendations.skillGaps && devRecommendations.skillGaps.length > 0 && (
                  <p className="text-sm text-slate-600">Skill gaps: {devRecommendations.skillGaps.join(", ")}</p>
                )}
                {devRecommendations.top_pick && (
                  <p className="text-sm font-medium text-indigo-800">Top pick: {devRecommendations.top_pick}</p>
                )}
                {(devRecommendations.recommendations ?? []).map((rec, i) => (
                  <div key={i} className="rounded-lg border border-indigo-100 bg-white p-3 text-sm">
                    <p className="font-medium text-slate-800">{rec.program}</p>
                    <p className="text-slate-600">{rec.reason}</p>
                    <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs capitalize ${statusClass(rec.priority)}`}>{rec.priority}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showProgramForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">{editingProgramId ? "Edit Program" : "Add Program"}</h3>
            <div className="space-y-3">
              <TextField label="Program name" value={programForm.name} onChange={(v) => setProgramForm({ ...programForm, name: v })} />
              <TextField label="Description" value={programForm.description} onChange={(v) => setProgramForm({ ...programForm, description: v })} />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowProgramForm(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button type="button" disabled={saving} onClick={saveProgram} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCertForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">{editingCertId ? "Edit Certification" : "Add Certification"}</h3>
            <div className="space-y-3">
              <SearchableSelectField label="Staff" value={certForm.staffId} options={staffOptions} onChange={(v) => setCertForm({ ...certForm, staffId: v })} placeholder="Select staff" />
              {certCatalogOptions.length > 0 ? (
                <SelectField
                  label="Certification"
                  value={certForm.name}
                  options={[{ value: "", label: "Select certification" }, ...certCatalogOptions]}
                  onChange={(v) => setCertForm({ ...certForm, name: v })}
                />
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Configure the certification catalog under Configuration → Skills before adding staff certifications.
                </div>
              )}
              <TextField label="Expiry date" value={certForm.expiry} onChange={(v) => setCertForm({ ...certForm, expiry: v })} type="date" />
              <TextField label="Issued date (optional)" value={certForm.issuedDate} onChange={(v) => setCertForm({ ...certForm, issuedDate: v })} type="date" />
              <SelectField label="Status" value={certForm.status} options={(meta?.statuses ?? ["active"]).map((s) => ({ value: s, label: s }))} onChange={(v) => setCertForm({ ...certForm, status: v })} />
              <TextField label="Credential ID" value={certForm.credentialId} onChange={(v) => setCertForm({ ...certForm, credentialId: v })} />
              <TextField label="Notes" value={certForm.notes} onChange={(v) => setCertForm({ ...certForm, notes: v })} />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCertForm(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button type="button" disabled={saving || certCatalogOptions.length === 0} onClick={saveCert} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
