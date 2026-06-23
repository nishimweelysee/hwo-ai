export type IntegrationSource = {
  name: string;
  status: string;
  statusLabel?: string;
  connected?: boolean;
  records: number;
  localRecords?: number;
  syncedRecords?: number;
  message?: string;
  endpoint?: string;
};

export function integrationStatusClass(status: string): string {
  switch (status) {
    case "connected":
      return "bg-emerald-100 text-emerald-700";
    case "local_data":
      return "bg-amber-100 text-amber-800";
    case "disconnected":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export function integrationStatusLabel(status: string, fallback?: string): string {
  if (fallback) return fallback;
  switch (status) {
    case "connected":
      return "Connected";
    case "local_data":
      return "Local data";
    case "disconnected":
      return "Disconnected";
    case "not_configured":
      return "Not configured";
    case "idle":
      return "No imports yet";
    case "active":
      return "Active";
    default:
      return status;
  }
}
