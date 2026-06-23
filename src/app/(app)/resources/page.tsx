"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Package,
  AlertCircle,
  TrendingUp,
  Plus,
  Pencil,
  Trash2,
  ArrowLeftRight,
  ShoppingCart,
  History,
  RefreshCw,
  Download,
  Search,
  Sparkles,
} from "lucide-react";
import { apiDownload, apiFetch, parseApiError } from "@/lib/api";
import { TextField, SelectField } from "@/components/form-fields";

type Tab = "overview" | "inventory" | "transfers" | "procurement" | "history";

type InventoryItem = {
  id: string;
  name: string;
  type: string;
  available: number;
  inUse: number;
  freeStock: number;
  departmentId: string;
  department: string;
  sku?: string;
  location?: string;
  supplier?: string;
  reorderLevel: number;
  unitCost: number;
  maintenanceStatus: string;
  notes?: string;
  status: string;
  needsReorder: boolean;
};

type Transfer = {
  id: string;
  resourceId: string;
  resource: string;
  fromDepartment: string;
  toDepartmentId: string;
  toDepartment: string;
  quantity: number;
  status: string;
  notes?: string;
  createdAt?: string;
};

type Procurement = {
  id: string;
  resourceId?: string;
  resource: string;
  quantity: number;
  estimatedUnitCost: number;
  estimatedTotal: number;
  supplier?: string;
  priority: string;
  status: string;
  recommendation: string;
  notes?: string;
  createdAt?: string;
  aiRank?: number;
  aiRankScore?: number;
  aiRankReason?: string;
};

type Movement = {
  id: string;
  resource: string;
  type: string;
  quantity: number;
  previousAvailable: number;
  newAvailable: number;
  previousInUse: number;
  newInUse: number;
  notes?: string;
  createdAt?: string;
};

type ReorderSuggestion = {
  resourceId: string;
  name: string;
  department: string;
  freeStock: number;
  reorderLevel: number;
  suggestedQuantity: number;
  priority: string;
  priorityScore?: number;
  weeklyDemand?: number;
  daysOfCover?: number;
  unitCost: number;
  supplier?: string;
  estimatedCost: number;
  rationale: string;
  aiPowered?: boolean;
  source?: string;
};

type AiPortfolio = {
  at_risk_count: number;
  forecast_weekly_spend: number;
  avg_confidence: number;
  top_risks: {
    resource_id?: string;
    name: string;
    priority_score: number;
    weekly_demand: number;
    suggested_quantity: number;
    days_until_stockout?: number;
  }[];
  aiPowered?: boolean;
  source?: string;
};

type AiHealth = {
  aiServiceHealthy: boolean;
  inventoryAiActive: boolean;
  leadTimeDays: number;
};

type InventorySettings = {
  criticalUtilizationPercent: number;
  defaultReorderLevel: number;
  autoProcurementEnabled: boolean;
  lowStockNotifications: boolean;
  procurementLeadTimeDays: number;
};

type Meta = {
  types: string[];
  maintenanceStatuses: string[];
  adjustmentTypes: string[];
  transferStatuses: string[];
  procurementStatuses: string[];
  procurementPriorities: string[];
  departments: { id: string; name: string }[];
  inventorySettings?: InventorySettings;
  canManage: boolean;
};

const EMPTY_ITEM = {
  name: "",
  type: "Equipment",
  departmentId: "",
  available: "0",
  inUse: "0",
  sku: "",
  location: "",
  supplier: "",
  reorderLevel: "5",
  unitCost: "0",
  maintenanceStatus: "operational",
  notes: "",
};

const EMPTY_ADJUST = { type: "receive", quantity: "1", notes: "" };
const EMPTY_TRANSFER = { resourceId: "", toDepartmentId: "", quantity: "1", notes: "" };
const EMPTY_PROCUREMENT = {
  resourceId: "",
  resourceName: "",
  departmentId: "",
  quantity: "1",
  estimatedUnitCost: "0",
  supplier: "",
  priority: "medium",
  notes: "",
};

const STATUS_COLORS: Record<string, string> = {
  Critical: "bg-rose-100 text-rose-700",
  Adequate: "bg-emerald-100 text-emerald-700",
  "Low Stock": "bg-amber-100 text-amber-700",
  Maintenance: "bg-slate-100 text-slate-700",
  Retired: "bg-slate-100 text-slate-600",
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  in_transit: "bg-indigo-100 text-indigo-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-100 text-slate-600",
  ordered: "bg-violet-100 text-violet-800",
  received: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-700",
  urgent: "bg-rose-100 text-rose-800",
  high: "bg-amber-100 text-amber-800",
  medium: "bg-blue-100 text-blue-800",
  low: "bg-slate-100 text-slate-700",
};

function statusClass(status: string) {
  return STATUS_COLORS[status] ?? "bg-slate-100 text-slate-700";
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function ResourcesPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [data, setData] = useState({
    resources: [] as InventoryItem[],
    totalBeds: 0,
    occupancyRate: 0,
    shortageCount: 0,
    utilizationScore: 0,
    transfers: [] as Transfer[],
    procurement: [] as Procurement[],
    reorderAlerts: [] as { id: string; name: string; freeStock: number; reorderLevel: number; department: string }[],
    reorderSuggestions: [] as ReorderSuggestion[],
    budgetImpact: { estimatedCost: 0, description: "" },
    canManage: false,
  });
  const [movements, setMovements] = useState<Movement[]>([]);
  const [filteredInventory, setFilteredInventory] = useState<InventoryItem[]>([]);
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryType, setInventoryType] = useState("");
  const [inventoryDept, setInventoryDept] = useState("");
  const [historyResourceId, setHistoryResourceId] = useState("");
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null);
  const [aiPortfolio, setAiPortfolio] = useState<AiPortfolio | null>(null);

  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);

  const [adjustItemId, setAdjustItemId] = useState<string | null>(null);
  const [adjustForm, setAdjustForm] = useState(EMPTY_ADJUST);

  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferForm, setTransferForm] = useState(EMPTY_TRANSFER);

  const [showProcurementForm, setShowProcurementForm] = useState(false);
  const [procurementForm, setProcurementForm] = useState(EMPTY_PROCUREMENT);

  const [demandItemId, setDemandItemId] = useState<string | null>(null);
  const [demandForecast, setDemandForecast] = useState<{
    weekly_demand?: number;
    daily_demand?: number;
    confidence?: number;
    trend?: string;
    days_until_stockout?: number | null;
    source?: string;
    aiPowered?: boolean;
  } | null>(null);
  const [loadingDemand, setLoadingDemand] = useState(false);

  const deptOptions = useMemo(
    () => (meta?.departments ?? []).map((d) => ({ value: d.id, label: d.name })),
    [meta]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const moveUrl = historyResourceId
        ? `/api/resources/movements?resourceId=${encodeURIComponent(historyResourceId)}`
        : "/api/resources/movements";
      const [dashRes, metaRes, moveRes] = await Promise.all([
        apiFetch("/api/resources"),
        apiFetch("/api/resources/meta"),
        apiFetch(moveUrl),
      ]);
      if (!dashRes.ok) {
        setError(await parseApiError(dashRes, "Failed to load resources"));
        return;
      }
      const dash = await dashRes.json();
      const suggestions: ReorderSuggestion[] = dash.reorderSuggestions ?? [];
      setData({
        resources: dash.resources ?? [],
        totalBeds: dash.totalBeds ?? 0,
        occupancyRate: dash.occupancyRate ?? 0,
        shortageCount: dash.shortageCount ?? 0,
        utilizationScore: dash.utilizationScore ?? 0,
        transfers: dash.transfers ?? [],
        procurement: dash.procurement ?? [],
        reorderAlerts: dash.reorderAlerts ?? [],
        reorderSuggestions: suggestions,
        budgetImpact: dash.budgetImpact ?? { estimatedCost: 0, description: "" },
        canManage: dash.canManage ?? false,
      });
      setSelectedSuggestions(new Set(suggestions.map((s) => s.resourceId)));
      setAiHealth(dash.aiHealth ?? null);
      setAiPortfolio(dash.aiPortfolio ?? null);
      if (metaRes.ok) setMeta(await metaRes.json());
      if (moveRes.ok) setMovements(await moveRes.json());
    } catch {
      setError("Failed to load resource management data");
    } finally {
      setLoading(false);
    }
  }, [historyResourceId]);

  const loadInventory = useCallback(async () => {
    const params = new URLSearchParams();
    if (inventorySearch.trim()) params.set("search", inventorySearch.trim());
    if (inventoryType) params.set("type", inventoryType);
    if (inventoryDept) params.set("departmentId", inventoryDept);
    const qs = params.toString();
    try {
      const res = await apiFetch(`/api/resources/inventory${qs ? `?${qs}` : ""}`);
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to load inventory"));
        return;
      }
      setFilteredInventory(await res.json());
    } catch {
      setError("Failed to load inventory");
    }
  }, [inventorySearch, inventoryType, inventoryDept]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab === "inventory") loadInventory();
  }, [tab, loadInventory, inventoryType, inventoryDept]);

  const flash = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 3000);
  };

  const openCreateItem = () => {
    setEditingItemId(null);
    setItemForm({ ...EMPTY_ITEM, departmentId: deptOptions[0]?.value ?? "" });
    setShowItemForm(true);
  };

  const openEditItem = (item: InventoryItem) => {
    setEditingItemId(item.id);
    setItemForm({
      name: item.name,
      type: item.type,
      departmentId: item.departmentId,
      available: String(item.available),
      inUse: String(item.inUse),
      sku: item.sku ?? "",
      location: item.location ?? "",
      supplier: item.supplier ?? "",
      reorderLevel: String(item.reorderLevel),
      unitCost: String(item.unitCost),
      maintenanceStatus: item.maintenanceStatus,
      notes: item.notes ?? "",
    });
    setShowItemForm(true);
  };

  const saveItem = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      name: itemForm.name,
      type: itemForm.type,
      departmentId: itemForm.departmentId,
      available: Number(itemForm.available),
      inUse: Number(itemForm.inUse),
      sku: itemForm.sku,
      location: itemForm.location,
      supplier: itemForm.supplier,
      reorderLevel: Number(itemForm.reorderLevel),
      unitCost: Number(itemForm.unitCost),
      maintenanceStatus: itemForm.maintenanceStatus,
      notes: itemForm.notes,
    };
    try {
      const res = editingItemId
        ? await apiFetch(`/api/resources/inventory/${editingItemId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await apiFetch("/api/resources/inventory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to save inventory item"));
        return;
      }
      setShowItemForm(false);
      flash(editingItemId ? "Inventory item updated" : "Inventory item created");
      await load();
      if (tab === "inventory") await loadInventory();
    } catch {
      setError("Failed to save inventory item");
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm("Delete this inventory item?")) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/resources/inventory/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to delete item"));
        return;
      }
      flash("Inventory item deleted");
      await load();
    } catch {
      setError("Failed to delete item");
    } finally {
      setSaving(false);
    }
  };

  const saveAdjust = async () => {
    if (!adjustItemId) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/resources/inventory/${adjustItemId}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: adjustForm.type,
          quantity: Number(adjustForm.quantity),
          notes: adjustForm.notes,
        }),
      });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to adjust stock"));
        return;
      }
      setAdjustItemId(null);
      flash("Stock adjusted");
      await load();
    } catch {
      setError("Failed to adjust stock");
    } finally {
      setSaving(false);
    }
  };

  const saveTransfer = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/resources/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceId: transferForm.resourceId,
          toDepartmentId: transferForm.toDepartmentId,
          quantity: Number(transferForm.quantity),
          notes: transferForm.notes,
        }),
      });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to create transfer"));
        return;
      }
      setShowTransferForm(false);
      setTransferForm(EMPTY_TRANSFER);
      flash("Transfer request created");
      await load();
    } catch {
      setError("Failed to create transfer");
    } finally {
      setSaving(false);
    }
  };

  const updateTransfer = async (id: string, status: string) => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/resources/transfers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to update transfer"));
        return;
      }
      flash(`Transfer ${status}`);
      await load();
    } catch {
      setError("Failed to update transfer");
    } finally {
      setSaving(false);
    }
  };

  const saveProcurement = async () => {
    if (!procurementForm.departmentId) {
      setError("Department is required for procurement");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/resources/procurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceId: procurementForm.resourceId || undefined,
          resourceName: procurementForm.resourceName || undefined,
          departmentId: procurementForm.departmentId,
          quantity: Number(procurementForm.quantity),
          estimatedUnitCost: Number(procurementForm.estimatedUnitCost),
          supplier: procurementForm.supplier,
          priority: procurementForm.priority,
          notes: procurementForm.notes,
        }),
      });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to create procurement request"));
        return;
      }
      setShowProcurementForm(false);
      setProcurementForm(EMPTY_PROCUREMENT);
      flash("Procurement request created");
      await load();
    } catch {
      setError("Failed to create procurement request");
    } finally {
      setSaving(false);
    }
  };

  const updateProcurement = async (id: string, status: string) => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/resources/procurement/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to update procurement"));
        return;
      }
      flash(`Procurement ${status}`);
      await load();
    } catch {
      setError("Failed to update procurement");
    } finally {
      setSaving(false);
    }
  };

  const deleteTransfer = async (id: string) => {
    if (!confirm("Delete this transfer request?")) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/resources/transfers/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to delete transfer"));
        return;
      }
      flash("Transfer deleted");
      await load();
    } catch {
      setError("Failed to delete transfer");
    } finally {
      setSaving(false);
    }
  };

  const deleteProcurement = async (id: string) => {
    if (!confirm("Delete this procurement request?")) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/resources/procurement/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to delete procurement"));
        return;
      }
      flash("Procurement request deleted");
      await load();
    } catch {
      setError("Failed to delete procurement");
    } finally {
      setSaving(false);
    }
  };

  const exportInventory = async () => {
    try {
      await apiDownload("/api/resources/inventory/export", "inventory.csv");
      flash("Inventory exported");
    } catch {
      setError("Failed to export inventory");
    }
  };

  const toggleSuggestion = (resourceId: string) => {
    setSelectedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(resourceId)) next.delete(resourceId);
      else next.add(resourceId);
      return next;
    });
  };

  const autoProcureFromSuggestions = async (all = false) => {
    const resourceIds = all
      ? data.reorderSuggestions.map((s) => s.resourceId)
      : [...selectedSuggestions];
    if (resourceIds.length === 0) {
      setError("Select at least one reorder suggestion");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/resources/procurement/from-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceIds }),
      });
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to create procurement from suggestions"));
        return;
      }
      const created = await res.json();
      flash(`Created ${created.length} procurement request(s) from suggestions`);
      await load();
    } catch {
      setError("Failed to create procurement from suggestions");
    } finally {
      setSaving(false);
    }
  };

  const canDeleteTransfer = (status: string) => status === "pending" || status === "cancelled";
  const canDeleteProcurement = (status: string) =>
    status === "pending" || status === "cancelled" || status === "rejected";

  const inventoryRows = tab === "inventory" ? filteredInventory : data.resources;
  const autoProcureEnabled = meta?.inventorySettings?.autoProcurementEnabled ?? true;
  const loadDemandForecast = async (resourceId: string) => {
    setDemandItemId(resourceId);
    setLoadingDemand(true);
    setDemandForecast(null);
    try {
      const res = await apiFetch(`/api/resources/ai/demand/${resourceId}`);
      if (!res.ok) {
        setError(await parseApiError(res, "Failed to load demand forecast"));
        return;
      }
      setDemandForecast(await res.json());
    } catch {
      setError("Failed to load demand forecast");
    } finally {
      setLoadingDemand(false);
    }
  };

  const inventoryAiActive = Boolean(aiHealth?.inventoryAiActive);

  const transferActions = (status: string) => {
    switch (status) {
      case "pending": return ["approved", "cancelled"];
      case "approved": return ["in_transit", "cancelled"];
      case "in_transit": return ["completed", "cancelled"];
      default: return [];
    }
  };

  const procurementActions = (status: string) => {
    switch (status) {
      case "pending": return ["approved", "rejected", "cancelled"];
      case "approved": return ["ordered", "cancelled"];
      case "ordered": return ["received", "cancelled"];
      default: return [];
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "inventory", label: "Inventory" },
    { id: "transfers", label: "Transfers" },
    { id: "procurement", label: "Procurement" },
    { id: "history", label: "History" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Inventory Management</h2>
          <p className="text-slate-600">Equipment, supplies, transfers, procurement, and stock history</p>
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

      <div className={`rounded-xl border px-4 py-3 ${inventoryAiActive ? "border-indigo-200 bg-indigo-50/60" : "border-amber-200 bg-amber-50/60"}`}>
        <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <Sparkles className={`h-4 w-4 ${inventoryAiActive ? "text-indigo-600" : "text-amber-600"}`} />
          AI Inventory: {inventoryAiActive ? "Active — demand forecasting & reorder optimization" : "Offline — using rule-based fallback"}
        </p>
        {inventoryAiActive && aiPortfolio && (
          <p className="mt-1 text-xs text-slate-600">
            {aiPortfolio.at_risk_count} at-risk item(s) · projected replenishment spend ${aiPortfolio.forecast_weekly_spend?.toLocaleString() ?? 0} ·
            avg forecast confidence {(aiPortfolio.avg_confidence * 100).toFixed(0)}%
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

      {loading && <p className="text-sm text-slate-500">Loading inventory data…</p>}

      {!loading && tab === "overview" && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <Package className="h-8 w-8 text-teal-500" />
              <p className="mt-2 text-sm text-slate-500">Total Beds</p>
              <p className="text-2xl font-bold text-slate-800">{data.totalBeds}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Occupancy Rate</p>
              <p className="text-2xl font-bold text-slate-800">{data.occupancyRate}%</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <AlertCircle className="h-8 w-8 text-amber-500" />
              <p className="mt-2 text-sm text-slate-500">Shortage Alerts</p>
              <p className="text-2xl font-bold text-slate-800">{data.shortageCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <TrendingUp className="h-8 w-8 text-emerald-500" />
              <p className="mt-2 text-sm text-slate-500">Utilization Score</p>
              <p className="text-2xl font-bold text-slate-800">{data.utilizationScore}%</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 font-semibold text-slate-800">Reorder Alerts</h3>
              {data.reorderAlerts.length === 0 ? (
                <p className="text-sm text-slate-500">No items below reorder level</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.reorderAlerts.map((a) => (
                    <li key={a.id} className="flex justify-between rounded border border-amber-100 bg-amber-50 p-2">
                      <span>{a.name} ({a.department})</span>
                      <span className="text-amber-700">{a.freeStock} free / reorder {a.reorderLevel}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 font-semibold text-slate-800">Budget Impact</h3>
              <p className="text-2xl font-bold text-slate-800">${data.budgetImpact.estimatedCost?.toLocaleString() ?? 0}</p>
              <p className="text-xs text-slate-500">{data.budgetImpact.description}</p>
            </div>
          </div>

          {data.reorderSuggestions.length > 0 && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-600" />
                  <h3 className="font-semibold text-slate-800">
                    {inventoryAiActive ? "AI Reorder Suggestions" : "Reorder Suggestions"}
                  </h3>
                  {data.reorderSuggestions[0]?.aiPowered && (
                    <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">ML-powered</span>
                  )}
                </div>
                {data.canManage && autoProcureEnabled && (
                  <button
                    type="button"
                    disabled={saving || selectedSuggestions.size === 0}
                    onClick={() => autoProcureFromSuggestions(false)}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Create procurement ({selectedSuggestions.size})
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-sm">
                  <thead>
                    <tr className="border-b border-indigo-100 text-left text-slate-600">
                      {data.canManage && autoProcureEnabled && <th className="pb-2 pr-3 w-8" />}
                      <th className="pb-2 pr-3">Item</th>
                      <th className="pb-2 pr-3">Free / Reorder</th>
                      <th className="pb-2 pr-3">AI Weekly Demand</th>
                      <th className="pb-2 pr-3">Suggested Qty</th>
                      <th className="pb-2 pr-3">Priority</th>
                      <th className="pb-2 pr-3">Est. Cost</th>
                      <th className="pb-2">Rationale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.reorderSuggestions.map((s) => (
                      <tr key={s.resourceId} className="border-b border-indigo-50">
                        {data.canManage && autoProcureEnabled && (
                          <td className="py-2 pr-3">
                            <input
                              type="checkbox"
                              checked={selectedSuggestions.has(s.resourceId)}
                              onChange={() => toggleSuggestion(s.resourceId)}
                              className="rounded border-slate-300"
                            />
                          </td>
                        )}
                        <td className="py-2 pr-3">
                          <p className="font-medium text-slate-800">{s.name}</p>
                          <p className="text-xs text-slate-500">{s.department}{s.supplier ? ` · ${s.supplier}` : ""}</p>
                        </td>
                        <td className="py-2 pr-3">{s.freeStock} / {s.reorderLevel}</td>
                        <td className="py-2 pr-3">
                          {s.weeklyDemand != null ? `${s.weeklyDemand}/wk` : "—"}
                          {s.daysOfCover != null && (
                            <p className="text-xs text-slate-500">{s.daysOfCover}d cover</p>
                          )}
                        </td>
                        <td className="py-2 pr-3">{s.suggestedQuantity}</td>
                        <td className="py-2 pr-3">
                          <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${statusClass(s.priority)}`}>{s.priority}</span>
                          {s.priorityScore != null && (
                            <p className="text-xs text-slate-500">score {(s.priorityScore * 100).toFixed(0)}%</p>
                          )}
                        </td>
                        <td className="py-2 pr-3">${s.estimatedCost.toLocaleString()}</td>
                        <td className="py-2 text-slate-600">{s.rationale}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {meta?.inventorySettings && (
                <p className="mt-3 text-xs text-slate-500">
                  Critical utilization threshold: {meta.inventorySettings.criticalUtilizationPercent}% ·
                  Default reorder level: {meta.inventorySettings.defaultReorderLevel} ·
                  Lead time: {meta.inventorySettings.procurementLeadTimeDays} days
                </p>
              )}
            </div>
          )}
        </>
      )}

      {!loading && tab === "inventory" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-slate-800">Resource Inventory</h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={exportInventory}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" /> Export CSV
              </button>
              {data.canManage && (
                <button
                  type="button"
                  onClick={openCreateItem}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
                >
                  <Plus className="h-4 w-4" /> Add Item
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
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadInventory()}
                  placeholder="Name or SKU…"
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
                />
              </div>
            </div>
            <div className="min-w-[140px]">
              <SelectField
                label="Type"
                value={inventoryType}
                options={[{ value: "", label: "All types" }, ...(meta?.types ?? []).map((t) => ({ value: t, label: t }))]}
                onChange={(v) => setInventoryType(v)}
              />
            </div>
            <div className="min-w-[160px]">
              <SelectField
                label="Department"
                value={inventoryDept}
                options={[{ value: "", label: "All departments" }, ...deptOptions]}
                onChange={(v) => setInventoryDept(v)}
              />
            </div>
            <button
              type="button"
              onClick={() => loadInventory()}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Apply filters
            </button>
          </div>

          {inventoryRows.length === 0 ? (
            <p className="text-sm text-slate-500">No inventory items match your filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-sm text-slate-600">
                    <th className="pb-3 pr-3">Item</th>
                    <th className="pb-3 pr-3">Dept</th>
                    <th className="pb-3 pr-3">Location</th>
                    <th className="pb-3 pr-3">Supplier</th>
                    <th className="pb-3 pr-3">Available</th>
                    <th className="pb-3 pr-3">In Use</th>
                    <th className="pb-3 pr-3">Free</th>
                    <th className="pb-3 pr-3">Reorder</th>
                    <th className="pb-3 pr-3">Status</th>
                    <th className="pb-3 pr-3">Forecast</th>
                    {data.canManage && <th className="pb-3">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {inventoryRows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 text-sm">
                      <td className="py-3 pr-3">
                        <p className="font-medium text-slate-800">{r.name}</p>
                        <p className="text-xs text-slate-500">{r.type}{r.sku ? ` · ${r.sku}` : ""}</p>
                      </td>
                      <td className="py-3 pr-3 text-slate-600">{r.department}</td>
                      <td className="py-3 pr-3 text-slate-600">{r.location || "—"}</td>
                      <td className="py-3 pr-3 text-slate-600">{r.supplier || "—"}</td>
                      <td className="py-3 pr-3">{r.available}</td>
                      <td className="py-3 pr-3">{r.inUse}</td>
                      <td className="py-3 pr-3">{r.freeStock}</td>
                      <td className="py-3 pr-3">{r.reorderLevel}</td>
                      <td className="py-3 pr-3">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusClass(r.status)}`}>{r.status}</span>
                      </td>
                      <td className="py-3 pr-3">
                        <button
                          type="button"
                          onClick={() => loadDemandForecast(r.id)}
                          className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                        >
                          View
                        </button>
                      </td>
                      {data.canManage && (
                        <td className="py-3">
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => openEditItem(r)} className="text-teal-600 hover:text-teal-800" title="Edit">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => { setAdjustItemId(r.id); setAdjustForm(EMPTY_ADJUST); }}
                              className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                            >
                              Adjust
                            </button>
                            <button type="button" onClick={() => deleteItem(r.id)} className="text-rose-600 hover:text-rose-800" title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!loading && tab === "transfers" && (
        <div className="space-y-4">
          <div className="flex justify-between">
            <h3 className="font-semibold text-slate-800">Inter-Department Transfers</h3>
            {data.canManage && (
              <button
                type="button"
                onClick={() => setShowTransferForm(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
              >
                <ArrowLeftRight className="h-4 w-4" /> New Transfer
              </button>
            )}
          </div>
          {data.transfers.length === 0 ? (
            <p className="text-sm text-slate-500">No transfer requests.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.transfers.map((t) => (
                <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-800">{t.resource}</p>
                      <p className="text-sm text-slate-500">
                        {t.fromDepartment} → {t.toDepartment} · qty {t.quantity}
                      </p>
                      {t.notes && <p className="mt-1 text-xs text-slate-500">{t.notes}</p>}
                      <p className="mt-1 text-xs text-slate-400">{formatDate(t.createdAt)}</p>
                    </div>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusClass(t.status)}`}>{t.status}</span>
                  </div>
                  {data.canManage && (transferActions(t.status).length > 0 || canDeleteTransfer(t.status)) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {transferActions(t.status).map((action) => (
                        <button
                          key={action}
                          type="button"
                          disabled={saving}
                          onClick={() => updateTransfer(t.id, action)}
                          className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          {action.replace("_", " ")}
                        </button>
                      ))}
                      {canDeleteTransfer(t.status) && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => deleteTransfer(t.id)}
                          className="inline-flex items-center gap-1 rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && tab === "procurement" && (
        <div className="space-y-4">
          {data.reorderSuggestions.length > 0 && data.canManage && autoProcureEnabled && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-700">
                  <Sparkles className="mr-1 inline h-4 w-4 text-indigo-600" />
                  {data.reorderSuggestions.length} reorder suggestion(s) available — create procurement requests in one click.
                </p>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => autoProcureFromSuggestions(true)}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Auto-procure all suggestions
                </button>
              </div>
            </div>
          )}
          <div className="flex justify-between">
            <h3 className="font-semibold text-slate-800">Procurement Requests</h3>
            {data.canManage && (
              <button
                type="button"
                onClick={() => {
                  setProcurementForm({ ...EMPTY_PROCUREMENT, departmentId: deptOptions[0]?.value ?? "" });
                  setShowProcurementForm(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
              >
                <ShoppingCart className="h-4 w-4" /> New Request
              </button>
            )}
          </div>
          {data.procurement.length === 0 ? (
            <p className="text-sm text-slate-500">No procurement requests.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-sm text-slate-600">
                    <th className="p-3">Item</th>
                    <th className="p-3">Qty</th>
                    <th className="p-3">Est. Cost</th>
                    <th className="p-3">Priority</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.procurement.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 text-sm">
                      <td className="p-3">
                        <p className="font-medium text-slate-800">{p.resource}</p>
                        <p className="text-xs text-slate-500">{p.recommendation}</p>
                        {p.aiRank != null && (
                          <p className="text-xs text-indigo-600">AI rank #{p.aiRank}{p.aiRankReason ? ` · ${p.aiRankReason}` : ""}</p>
                        )}
                      </td>
                      <td className="p-3">{p.quantity}</td>
                      <td className="p-3">${p.estimatedTotal?.toLocaleString()}</td>
                      <td className="p-3 capitalize">{p.priority}</td>
                      <td className="p-3">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusClass(p.status)}`}>{p.status}</span>
                      </td>
                      <td className="p-3">
                        {data.canManage && (
                          <div className="flex flex-wrap gap-1">
                            {procurementActions(p.status).map((action) => (
                              <button
                                key={action}
                                type="button"
                                disabled={saving}
                                onClick={() => updateProcurement(p.id, action)}
                                className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                              >
                                {action}
                              </button>
                            ))}
                            {canDeleteProcurement(p.status) && (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => deleteProcurement(p.id)}
                                className="inline-flex items-center gap-1 rounded border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!loading && tab === "history" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-slate-500" />
              <h3 className="font-semibold text-slate-800">Stock Movement History</h3>
            </div>
            <div className="min-w-[220px]">
              <SelectField
                label="Filter by item"
                value={historyResourceId}
                options={[{ value: "", label: "All items" }, ...data.resources.map((r) => ({ value: r.id, label: r.name }))]}
                onChange={(v) => setHistoryResourceId(v)}
              />
            </div>
          </div>
          {movements.length === 0 ? (
            <p className="text-sm text-slate-500">No stock movements recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="pb-3 pr-3">When</th>
                    <th className="pb-3 pr-3">Item</th>
                    <th className="pb-3 pr-3">Type</th>
                    <th className="pb-3 pr-3">Qty</th>
                    <th className="pb-3 pr-3">Available</th>
                    <th className="pb-3 pr-3">In Use</th>
                    <th className="pb-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3 text-slate-500">{formatDate(m.createdAt)}</td>
                      <td className="py-2 pr-3 font-medium">{m.resource}</td>
                      <td className="py-2 pr-3 capitalize">{m.type.replace("_", " ")}</td>
                      <td className="py-2 pr-3">{m.quantity}</td>
                      <td className="py-2 pr-3">{m.previousAvailable} → {m.newAvailable}</td>
                      <td className="py-2 pr-3">{m.previousInUse} → {m.newInUse}</td>
                      <td className="py-2 text-slate-500">{m.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showItemForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">{editingItemId ? "Edit Item" : "Add Inventory Item"}</h3>
            <div className="space-y-3">
              <TextField label="Name" value={itemForm.name} onChange={(v) => setItemForm({ ...itemForm, name: v })} />
              <SelectField label="Type" value={itemForm.type} options={(meta?.types ?? ["Equipment"]).map((t) => ({ value: t, label: t }))} onChange={(v) => setItemForm({ ...itemForm, type: v })} />
              <SelectField label="Department" value={itemForm.departmentId} options={deptOptions} onChange={(v) => setItemForm({ ...itemForm, departmentId: v })} />
              {!editingItemId && (
                <>
                  <TextField label="Available" value={itemForm.available} onChange={(v) => setItemForm({ ...itemForm, available: v })} type="number" />
                  <TextField label="In Use" value={itemForm.inUse} onChange={(v) => setItemForm({ ...itemForm, inUse: v })} type="number" />
                </>
              )}
              <TextField label="SKU" value={itemForm.sku} onChange={(v) => setItemForm({ ...itemForm, sku: v })} />
              <TextField label="Location" value={itemForm.location} onChange={(v) => setItemForm({ ...itemForm, location: v })} />
              <TextField label="Supplier" value={itemForm.supplier} onChange={(v) => setItemForm({ ...itemForm, supplier: v })} />
              <TextField label="Reorder Level" value={itemForm.reorderLevel} onChange={(v) => setItemForm({ ...itemForm, reorderLevel: v })} type="number" />
              <TextField label="Unit Cost ($)" value={itemForm.unitCost} onChange={(v) => setItemForm({ ...itemForm, unitCost: v })} type="number" />
              <SelectField
                label="Maintenance Status"
                value={itemForm.maintenanceStatus}
                options={(meta?.maintenanceStatuses ?? ["operational"]).map((s) => ({ value: s, label: s }))}
                onChange={(v) => setItemForm({ ...itemForm, maintenanceStatus: v })}
              />
              <TextField label="Notes" value={itemForm.notes} onChange={(v) => setItemForm({ ...itemForm, notes: v })} />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowItemForm(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button type="button" disabled={saving} onClick={saveItem} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {adjustItemId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">Adjust Stock</h3>
            <div className="space-y-3">
              <SelectField
                label="Adjustment Type"
                value={adjustForm.type}
                options={(meta?.adjustmentTypes ?? ["receive"]).map((t) => ({ value: t, label: t }))}
                onChange={(v) => setAdjustForm({ ...adjustForm, type: v })}
              />
              <TextField label="Quantity" value={adjustForm.quantity} onChange={(v) => setAdjustForm({ ...adjustForm, quantity: v })} type="number" />
              <TextField label="Notes" value={adjustForm.notes} onChange={(v) => setAdjustForm({ ...adjustForm, notes: v })} />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setAdjustItemId(null)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button type="button" disabled={saving} onClick={saveAdjust} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
                {saving ? "Saving…" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTransferForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">New Transfer</h3>
            <div className="space-y-3">
              <SelectField
                label="Resource"
                value={transferForm.resourceId}
                options={data.resources.map((r) => ({ value: r.id, label: `${r.name} (${r.department})` }))}
                onChange={(v) => setTransferForm({ ...transferForm, resourceId: v })}
                placeholder="Select resource"
              />
              <SelectField
                label="To Department"
                value={transferForm.toDepartmentId}
                options={deptOptions}
                onChange={(v) => setTransferForm({ ...transferForm, toDepartmentId: v })}
                placeholder="Select department"
              />
              <TextField label="Quantity" value={transferForm.quantity} onChange={(v) => setTransferForm({ ...transferForm, quantity: v })} type="number" />
              <TextField label="Notes" value={transferForm.notes} onChange={(v) => setTransferForm({ ...transferForm, notes: v })} />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowTransferForm(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button type="button" disabled={saving} onClick={saveTransfer} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
                {saving ? "Saving…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {demandItemId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">Demand Forecast</h3>
            {loadingDemand ? (
              <p className="text-sm text-slate-500">Loading forecast…</p>
            ) : demandForecast ? (
              <div className="space-y-2 text-sm text-slate-700">
                <p>Weekly demand: <strong>{demandForecast.weekly_demand ?? "—"}</strong> units</p>
                <p>Daily demand: <strong>{demandForecast.daily_demand ?? "—"}</strong> units</p>
                <p>Trend: <strong>{demandForecast.trend ?? "stable"}</strong></p>
                {demandForecast.days_until_stockout != null && (
                  <p>Days until stockout: <strong>{demandForecast.days_until_stockout}</strong></p>
                )}
                {demandForecast.confidence != null && (
                  <p>Confidence: <strong>{Math.round(demandForecast.confidence * 100)}%</strong></p>
                )}
                <p className="text-xs text-slate-500">
                  Source: {demandForecast.aiPowered ? "AI" : demandForecast.source ?? "heuristic"}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No forecast available.</p>
            )}
            <div className="mt-6 flex justify-end">
              <button type="button" onClick={() => { setDemandItemId(null); setDemandForecast(null); }} className="rounded-lg border px-4 py-2 text-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showProcurementForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">New Procurement Request</h3>
            <div className="space-y-3">
              <SelectField
                label="Existing Item (optional)"
                value={procurementForm.resourceId}
                options={[{ value: "", label: "— New item —" }, ...data.resources.map((r) => ({ value: r.id, label: r.name }))]}
                onChange={(v) => {
                  const linked = data.resources.find((r) => r.id === v);
                  setProcurementForm({
                    ...procurementForm,
                    resourceId: v,
                    departmentId: linked?.departmentId ?? procurementForm.departmentId,
                    estimatedUnitCost: linked?.unitCost != null ? String(linked.unitCost) : procurementForm.estimatedUnitCost,
                  });
                }}
              />
              <SelectField
                label="Department"
                value={procurementForm.departmentId}
                options={deptOptions}
                onChange={(v) => setProcurementForm({ ...procurementForm, departmentId: v })}
              />
              {!procurementForm.resourceId && (
                <TextField label="Item Name" value={procurementForm.resourceName} onChange={(v) => setProcurementForm({ ...procurementForm, resourceName: v })} />
              )}
              <TextField label="Quantity" value={procurementForm.quantity} onChange={(v) => setProcurementForm({ ...procurementForm, quantity: v })} type="number" />
              <TextField label="Est. Unit Cost ($)" value={procurementForm.estimatedUnitCost} onChange={(v) => setProcurementForm({ ...procurementForm, estimatedUnitCost: v })} type="number" />
              <TextField label="Supplier" value={procurementForm.supplier} onChange={(v) => setProcurementForm({ ...procurementForm, supplier: v })} />
              <SelectField
                label="Priority"
                value={procurementForm.priority}
                options={(meta?.procurementPriorities ?? ["medium"]).map((p) => ({ value: p, label: p }))}
                onChange={(v) => setProcurementForm({ ...procurementForm, priority: v })}
              />
              <TextField label="Notes" value={procurementForm.notes} onChange={(v) => setProcurementForm({ ...procurementForm, notes: v })} />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowProcurementForm(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button type="button" disabled={saving} onClick={saveProcurement} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
                {saving ? "Saving…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
