import { apiFetch } from "@/lib/api";

export type ReportType = "operational" | "strategic" | "wellness" | "scheduling" | "custom";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ReportData = Record<string, any>;

export async function fetchReportData(
  type: ReportType,
  sections?: string[]
): Promise<ReportData> {
  if (type === "custom") {
    const res = await apiFetch("/api/reports/custom-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections: sections ?? [] }),
    });
    if (!res.ok) throw new Error("Failed to load custom report data");
    return res.json();
  }
  const res = await apiFetch(`/api/reports/${type}`);
  if (!res.ok) throw new Error(`Failed to load ${type} report data`);
  return res.json();
}

export async function recordReportGeneration(type: string, format: string) {
  await apiFetch("/api/reports/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, format }),
  }).catch(() => {});
}
