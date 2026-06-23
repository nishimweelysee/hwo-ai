"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Brain,
  CheckCircle,
  GitCompare,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Download,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  BarChart,
  Bar,
  Legend,
  ReferenceLine,
} from "recharts";

type ModelInfo = {
  id: string;
  name: string;
  type: string;
  accuracy?: number;
  mae?: number;
  rmse?: number;
  r2?: number;
  lastTrained?: string;
  version?: string;
  scope?: string;
  granularity?: string;
  active?: boolean;
  trainingDataPoints?: number;
};

type ModelHealth = {
  aiServiceHealthy?: boolean;
  systemModelActive?: boolean;
  globalModelActive?: boolean;
  activeModelName?: string;
  activeModelVersion?: string;
  departmentModelsActive?: number;
  schedulingAiActive?: boolean;
  globalModelR2?: number;
  globalModelRmse?: number;
  globalCvMae?: number;
  globalLastTrained?: string;
  globalModelType?: string;
  globalTrainingDataPoints?: number;
  modelGranularity?: string;
  departmentsIncluded?: number;
  improvementVsNaive?: number;
  modelComplexity?: string;
  minTrainingPoints?: number;
};

type TrendRow = { month: string; actual: number | null; predicted: number };
type ForecastRow = { month: string; predicted: number; low: number; high: number; band?: [number, number] };
type ChartTab = "forecast" | "historical" | "combined";

function ChartSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <div className={`animate-pulse rounded-lg bg-slate-100 ${tall ? "h-80" : "h-72"}`} />
  );
}

function MetricSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm animate-pulse">
      <div className="h-4 w-24 rounded bg-slate-200" />
      <div className="mt-3 h-8 w-16 rounded bg-slate-200" />
    </div>
  );
}

function WorkloadTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; payload?: ForecastRow & TrendRow }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-slate-800">{label}</p>
      {payload.map((entry) =>
        entry.value != null && entry.name ? (
          <p key={entry.name} style={{ color: entry.color }} className="text-slate-600">
            {entry.name}: <span className="font-semibold text-slate-800">{Math.round(Number(entry.value))}%</span>
          </p>
        ) : null
      )}
      {row && "low" in row && row.low != null && row.high != null && (
        <p className="text-xs text-slate-500">
          95% band: {Math.round(row.low)}% – {Math.round(row.high)}%
        </p>
      )}
    </div>
  );
}

function formatFeatureName(feature: string): string {
  return feature
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AIPredictionPage() {
  const { manageSettings } = usePermissions();
  const [metrics, setMetrics] = useState<Record<string, unknown>>({});
  const [workloadTrend, setWorkloadTrend] = useState<TrendRow[]>([]);
  const [forecastData, setForecastData] = useState<ForecastRow[]>([]);
  const [featureImportance, setFeatureImportance] = useState<{ feature: string; importance: number }[]>([]);
  const [training, setTraining] = useState(false);
  const [modelTrained, setModelTrained] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [compareModelA, setCompareModelA] = useState("");
  const [compareModelB, setCompareModelB] = useState("");
  const [comparison, setComparison] = useState<{
    modelA: ModelInfo;
    modelB: ModelInfo;
    winner: { accuracy: string; mae: string; rmse: string };
  } | null>(null);
  const [workloadSummary, setWorkloadSummary] = useState<{ avgWorkload?: number; totalStaff?: number } | null>(null);
  const [modelHealth, setModelHealth] = useState<ModelHealth | null>(null);
  const [lastTrainSummary, setLastTrainSummary] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [chartsLoading, setChartsLoading] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [chartTab, setChartTab] = useState<ChartTab>("combined");
  const [loadError, setLoadError] = useState<string | null>(null);

  const forecastChartData = useMemo(
    () =>
      forecastData.map((row) => ({
        ...row,
        band: [row.low, row.high] as [number, number],
      })),
    [forecastData]
  );

  const combinedChartData = useMemo(() => {
    const rows: Array<{
      label: string;
      actual?: number | null;
      predicted?: number;
      low?: number;
      high?: number;
      band?: [number, number];
      segment: "history" | "forecast";
    }> = [];

    workloadTrend.forEach((row, i) => {
      rows.push({
        label: `${row.month}${workloadTrend.length > 12 ? ` ${i + 1}` : ""}`,
        actual: row.actual,
        predicted: row.predicted,
        segment: "history",
      });
    });

    forecastData.forEach((row, i) => {
      rows.push({
        label: `${row.month}${forecastData.length > 1 ? ` +${i + 1}` : ""}`,
        predicted: row.predicted,
        low: row.low,
        high: row.high,
        band: [row.low, row.high],
        segment: "forecast",
      });
    });

    return rows;
  }, [workloadTrend, forecastData]);

  const featureChartData = useMemo(
    () =>
      [...featureImportance]
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 10)
        .map((item) => ({
          feature: formatFeatureName(item.feature),
          importance: Math.round(item.importance * 1000) / 10,
        })),
    [featureImportance]
  );

  const loadPredictions = useCallback(async (modelId?: string | null, silent = false) => {
    if (!silent) setChartsLoading(true);
    try {
      const url = modelId ? `/api/predictions?modelId=${modelId}` : "/api/predictions";
      const res = await apiFetch(url);
      if (!res.ok) {
        setLoadError("Could not load prediction charts");
        return;
      }
      const data = await res.json();
      if (data) {
        setMetrics(data.metrics ?? {});
        setWorkloadTrend(Array.isArray(data.workloadTrend) ? data.workloadTrend : []);
        setForecastData(Array.isArray(data.forecastData) ? data.forecastData : []);
        setFeatureImportance(Array.isArray(data.featureImportance) ? data.featureImportance : []);
        setModelTrained(!!data.modelTrained);
        setLoadError(null);
      }
    } catch {
      setLoadError("Failed to load predictions — check backend and AI service");
    } finally {
      if (!silent) setChartsLoading(false);
    }
  }, []);

  const loadPage = useCallback(async () => {
    setPageLoading(true);
    setLoadError(null);
    try {
      const [modelsRes, healthRes, summaryRes] = await Promise.all([
        apiFetch("/api/predictions/models"),
        apiFetch("/api/predictions/health"),
        apiFetch("/api/workload/summary"),
      ]);
      if (modelsRes.ok) {
        const d = await modelsRes.json();
        setModels(Array.isArray(d.models) ? d.models : []);
      }
      if (healthRes.ok) setModelHealth(await healthRes.json());
      if (summaryRes.ok) setWorkloadSummary(await summaryRes.json());
      await loadPredictions(selectedModelId, true);
    } finally {
      setPageLoading(false);
    }
  }, [loadPredictions, selectedModelId]);

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  const pollTrainingStatus = async (): Promise<{
    status: string;
    result?: Record<string, unknown>;
    error?: string;
  }> => {
    const deadline = Date.now() + 6 * 60 * 1000; // up to 6 minutes
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        const res = await apiFetch("/api/predictions/training-status");
        if (!res.ok) continue;
        const s = await res.json();
        if (s.status === "completed" || s.status === "failed") return s;
      } catch {
        // transient issue while polling — keep trying until the deadline
      }
    }
    return { status: "failed", error: "Training timed out — please try again." };
  };

  const handleTrain = async () => {
    setTraining(true);
    setLastTrainSummary(null);
    try {
      const startRes = await apiFetch("/api/predictions/retrain", { method: "POST" });
      if (!startRes.ok && startRes.status !== 202) {
        let startErr: Record<string, unknown> = {};
        try {
          startErr = await startRes.json();
        } catch {
          // ignore non-JSON error body
        }
        alert(typeof startErr.error === "string" ? startErr.error : "Training failed");
        return;
      }
      setLastTrainSummary("Training ensemble model… this can take 1–2 minutes.");

      // Training runs in the background; poll for completion so the request never
      // stays open long enough to hit the ~30s proxy timeout.
      const status = await pollTrainingStatus();
      if (status.status !== "completed") {
        alert(
          typeof status.error === "string" && status.error
            ? status.error
            : "Training failed — please try again."
        );
        return;
      }
      const data = (status.result ?? {}) as Record<string, unknown>;

      setModelTrained(true);
      setLastTrainSummary(
        data.modelName
          ? `Trained ${String(data.modelName)} on ${Number(data.trainingDataPoints ?? 0)} daily points. Refreshing charts…`
          : `Trained unified model v${String(data.version ?? "?")}. Refreshing charts…`
      );
      setMetrics((m) => ({
        ...m,
        accuracy: data.accuracy as number | undefined,
        mae: data.mae as number | undefined,
        rmse: data.rmse as number | undefined,
        r2: data.r2 as number | undefined,
        cvMae: data.cvMae as number | undefined,
        modelName: data.modelName as string | undefined,
        modelType: data.modelType as string | undefined,
        version: data.version as string | undefined,
        lastTrained: new Date().toISOString().split("T")[0],
        baselineNaiveMae: data.baselineNaiveMae as number | undefined,
        baselineMovingAvgMae: data.baselineMovingAvgMae as number | undefined,
        improvementVsNaive: data.improvementVsNaive as number | undefined,
      }));
      if (typeof data.modelId === "string") setSelectedModelId(data.modelId);
      if (Array.isArray(data.featureImportance)) {
        setFeatureImportance(data.featureImportance as { feature: string; importance: number }[]);
      }
      if (data.modelHealth && typeof data.modelHealth === "object") {
        setModelHealth(data.modelHealth as ModelHealth);
      }

      const modelsRes = await apiFetch("/api/predictions/models");
      if (modelsRes.ok) {
        const modelsData = await modelsRes.json();
        setModels(modelsData.models || []);
      }

      setChartsLoading(true);
      await loadPredictions(typeof data.modelId === "string" ? data.modelId : selectedModelId, true);
      const healthRes = await apiFetch("/api/predictions/health");
      if (healthRes.ok) setModelHealth(await healthRes.json());
      setLastTrainSummary(
        data.modelName
          ? `Trained ${String(data.modelName)} (${Number(data.trainingDataPoints ?? 0)} daily points).`
          : `Training complete — model v${String(data.version ?? "?")}.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Training failed";
      alert(
        message.includes("timed out") || message.includes("timeout")
          ? "Training timed out — large datasets can take several minutes. Ensure the Python AI service is running on port 8000, then retry."
          : `Training failed: ${message}`
      );
    } finally {
      setTraining(false);
      setChartsLoading(false);
    }
  };

  const handleCompare = async () => {
    if (!compareModelA || !compareModelB) return;
    setComparing(true);
    setComparison(null);
    try {
      const res = await apiFetch(`/api/predictions/compare?modelA=${compareModelA}&modelB=${compareModelB}`);
      if (res.ok) setComparison(await res.json());
    } finally {
      setComparing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const url = selectedModelId
        ? `/api/predictions/export?modelId=${selectedModelId}`
        : "/api/predictions/export";
      const res = await apiFetch(url);
      if (!res.ok) {
        alert("Export failed");
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "predictions-export.csv";
      link.click();
      URL.revokeObjectURL(objectUrl);
    } finally {
      setExporting(false);
    }
  };

  const aiOnline = modelHealth?.aiServiceHealthy;
  const modelActive = modelHealth?.systemModelActive ?? modelHealth?.globalModelActive;
  const showChartEmpty = !chartsLoading && !pageLoading && !modelTrained && forecastData.length === 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <Brain className="h-7 w-7 text-teal-600" />
            AI Prediction
          </h2>
          <p className="mt-1 text-slate-600">
            ML workload forecasting from patient volume history — powers scheduling surge targets
          </p>
          {(metrics.modelName as string | undefined) && (
            <p className="mt-2 inline-flex flex-wrap items-center gap-2 text-sm text-teal-700">
              <Sparkles className="h-4 w-4" />
              {String(metrics.modelName)}
              {metrics.version ? ` · v${String(metrics.version)}` : ""}
              {metrics.modelType ? ` · ${String(metrics.modelType)}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadPage()}
            disabled={pageLoading || chartsLoading || training}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${pageLoading || chartsLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          {models.length > 0 && (
            <select
              value={selectedModelId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setSelectedModelId(id);
                void loadPredictions(id);
              }}
              disabled={chartsLoading || training}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="">Latest active model</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.version ? ` (v${m.version})` : ""} — {m.accuracy?.toFixed(1) ?? "—"}%
                </option>
              ))}
            </select>
          )}
          <button
            onClick={handleTrain}
            disabled={training || !manageSettings || !aiOnline}
            title={!manageSettings ? "Settings permission required" : !aiOnline ? "Start AI service on port 8000" : undefined}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {training ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Training… (1–2 min)
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Train model
              </>
            )}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || !modelTrained}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export
          </button>
        </div>
      </div>

      {training && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          <p className="flex items-center gap-2 font-medium">
            <Loader2 className="h-4 w-4 animate-spin" />
            Training ensemble model on workload history…
          </p>
          <p className="mt-1 text-xs text-indigo-700">
            This usually takes 1–2 minutes. The Python AI service (port 8000) is fitting Ridge + gradient boosting on your patient/workload data.
          </p>
        </div>
      )}

      {modelHealth && !training && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            aiOnline && modelActive
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <p className="flex flex-wrap items-center gap-x-2 font-medium">
            {aiOnline && modelActive ? (
              <CheckCircle className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            AI service: {aiOnline ? "Online" : "Offline — run cd ai-service && python3 main.py"}
            <span className="text-slate-400">·</span>
            Model: {modelActive ? "Trained" : "Not trained — import workload data and click Train"}
            {modelHealth.activeModelName && ` · ${modelHealth.activeModelName}`}
            {modelHealth.schedulingAiActive ? " · Scheduling uses ML" : " · Scheduling uses heuristics"}
          </p>
          {modelHealth.globalLastTrained && (
            <p className="mt-1 text-xs opacity-85">
              Last trained {modelHealth.globalLastTrained}
              {modelHealth.globalTrainingDataPoints != null && ` · ${modelHealth.globalTrainingDataPoints} points`}
              {modelHealth.globalModelR2 != null && ` · R² ${(modelHealth.globalModelR2 * 100).toFixed(1)}%`}
              {modelHealth.departmentsIncluded != null && ` · ${modelHealth.departmentsIncluded} departments`}
            </p>
          )}
        </div>
      )}

      {lastTrainSummary && !training && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {lastTrainSummary}
        </p>
      )}

      {loadError && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{loadError}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {pageLoading ? (
          <>
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-teal-100 p-2">
                  <Brain className="h-5 w-5 text-teal-600" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Accuracy</p>
                  <p className="text-2xl font-bold text-slate-800">
                    {metrics.accuracy != null ? `${Number(metrics.accuracy).toFixed(1)}%` : "—"}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">MAE · RMSE</p>
              <p className="text-2xl font-bold text-slate-800">
                {metrics.mae != null ? Number(metrics.mae).toFixed(2) : "—"}
                <span className="text-lg font-normal text-slate-400">
                  {" / "}
                  {metrics.rmse != null ? Number(metrics.rmse).toFixed(2) : "—"}
                </span>
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">R² · CV-MAE</p>
              <p className="text-2xl font-bold text-slate-800">
                {metrics.r2 != null ? `${(Number(metrics.r2) * 100).toFixed(1)}%` : "—"}
                <span className="text-lg font-normal text-slate-400">
                  {" / "}
                  {metrics.cvMae != null ? Number(metrics.cvMae).toFixed(2) : "—"}
                </span>
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">vs naive baseline</p>
                  <p className="text-2xl font-bold text-teal-600">
                    {metrics.improvementVsNaive != null && Number(metrics.improvementVsNaive) >= 0
                      ? `+${(Number(metrics.improvementVsNaive) * 100).toFixed(0)}%`
                      : "—"}
                  </p>
                </div>
              </div>
              {metrics.lastTrained != null && (
                <p className="mt-2 text-xs text-slate-500">Trained {String(metrics.lastTrained)}</p>
              )}
            </div>
          </>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-800">Workload forecasts</h3>
            <p className="text-xs text-slate-500">Predicted hospital workload % (0–100 scale)</p>
          </div>
          <div className="flex rounded-lg border border-slate-200 p-0.5 text-sm">
            {(
              [
                ["combined", "Combined"],
                ["forecast", "Forward forecast"],
                ["historical", "Model fit"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setChartTab(id)}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  chartTab === id ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {chartsLoading || pageLoading ? (
          <ChartSkeleton tall />
        ) : showChartEmpty ? (
          <div className="flex h-80 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 text-center">
            <Brain className="mb-3 h-10 w-10 text-slate-300" />
            <p className="font-medium text-slate-700">No trained model yet</p>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              Import patient/workload data in Data Collection, start the AI service, then train a model to see forecasts here.
            </p>
          </div>
        ) : chartTab === "forecast" ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={forecastChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="forecastBand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#94a3b8" unit="%" width={42} />
                <Tooltip content={<WorkloadTooltip />} />
                <Legend />
                {workloadSummary?.avgWorkload != null && (
                  <ReferenceLine
                    y={workloadSummary.avgWorkload}
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    label={{ value: "Current avg", position: "insideTopRight", fontSize: 11, fill: "#64748b" }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="band"
                  stroke="none"
                  fill="url(#forecastBand)"
                  name="95% interval"
                  legendType="rect"
                />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  stroke="#0d9488"
                  strokeWidth={2.5}
                  dot={{ fill: "#0d9488", r: 4 }}
                  activeDot={{ r: 6 }}
                  name="Predicted"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : chartTab === "historical" ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={workloadTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#94a3b8" unit="%" width={42} />
                <Tooltip content={<WorkloadTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="#0f766e"
                  strokeWidth={2.5}
                  dot={{ fill: "#0f766e", r: 3 }}
                  connectNulls
                  name="Actual workload"
                />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={{ fill: "#f59e0b", r: 3 }}
                  name="Model backtest"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={combinedChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#94a3b8" unit="%" width={42} />
                <Tooltip content={<WorkloadTooltip />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="band"
                  stroke="none"
                  fill="#99f6e4"
                  fillOpacity={0.45}
                  name="Forecast band"
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="#0f766e"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  connectNulls
                  name="Actual"
                />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  stroke="#0d9488"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={{ r: 3 }}
                  connectNulls
                  name="Predicted"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-1 font-semibold text-slate-800">Feature importance</h3>
          <p className="mb-4 text-xs text-slate-500">What drives the model (top signals)</p>
          {pageLoading || chartsLoading ? (
            <ChartSkeleton />
          ) : featureChartData.length === 0 ? (
            <p className="text-sm text-slate-500">Train a model to see which inputs matter most.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={featureChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" domain={[0, "auto"]} unit="%" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="feature" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`${v}%`, "Importance"]} />
                  <Bar dataKey="importance" fill="#0d9488" radius={[0, 4, 4, 0]} name="Importance" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-semibold text-slate-800">Scenario modeling</h3>
          <div className="grid gap-3 sm:grid-cols-1">
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="font-medium text-slate-800">Baseline</p>
              <p className="text-xs text-slate-500">Current average workload</p>
              <p className="mt-2 text-2xl font-bold text-slate-800">
                {workloadSummary?.avgWorkload != null ? `${Math.round(workloadSummary.avgWorkload)}%` : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-4">
              <p className="font-medium text-teal-900">+10% staff</p>
              <p className="text-xs text-teal-700">
                {workloadSummary?.totalStaff != null
                  ? `~${Math.round(workloadSummary.totalStaff * 0.1)} additional FTE`
                  : "Estimated relief"}
              </p>
              <p className="mt-2 text-2xl font-bold text-teal-800">
                {workloadSummary?.avgWorkload != null
                  ? `${Math.round(workloadSummary.avgWorkload * 0.9)}%`
                  : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
              <p className="font-medium text-amber-900">Peak forecast</p>
              <p className="text-xs text-amber-700">Next horizon from ML model</p>
              <p className="mt-2 text-2xl font-bold text-amber-800">
                {forecastData.length > 0
                  ? `${Math.max(...forecastData.map((f) => f.predicted))}%`
                  : workloadSummary?.avgWorkload != null
                    ? `${Math.round(workloadSummary.avgWorkload * 1.1)}%`
                    : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {models.length >= 2 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
            <GitCompare className="h-5 w-5" /> Model comparison
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={compareModelA}
              onChange={(e) => setCompareModelA(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Model A</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.version ? `(v${m.version})` : ""}
                </option>
              ))}
            </select>
            <span className="text-slate-400">vs</span>
            <select
              value={compareModelB}
              onChange={(e) => setCompareModelB(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Model B</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.version ? `(v${m.version})` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={handleCompare}
              disabled={!compareModelA || !compareModelB || comparing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {comparing && <Loader2 className="h-4 w-4 animate-spin" />}
              Compare
            </button>
          </div>
          {comparing && <p className="mt-3 text-sm text-slate-500">Comparing models…</p>}
          {comparison && !comparing && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {[comparison.modelA, comparison.modelB].map((model, idx) => {
                const key = idx === 0 ? "modelA" : "modelB";
                const wins = [
                  comparison.winner.accuracy === key && "Accuracy",
                  comparison.winner.mae === key && "MAE",
                  comparison.winner.rmse === key && "RMSE",
                ].filter(Boolean);
                return (
                  <div
                    key={model.id}
                    className={`rounded-lg border p-4 ${wins.length ? "border-teal-300 bg-teal-50/40" : "border-slate-200"}`}
                  >
                    <p className="font-medium text-slate-800">{model.name}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Accuracy {model.accuracy?.toFixed(1) ?? "—"}% · MAE {model.mae?.toFixed(2) ?? "—"} · RMSE{" "}
                      {model.rmse?.toFixed(2) ?? "—"}
                    </p>
                    {model.lastTrained && (
                      <p className="mt-1 text-xs text-slate-500">Trained {model.lastTrained}</p>
                    )}
                    {wins.length > 0 && (
                      <p className="mt-2 text-xs font-medium text-teal-700">Better: {wins.join(", ")}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
