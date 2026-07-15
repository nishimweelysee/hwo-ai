import { printReportDocument } from "@/lib/reports/print-document";

export { PRINT_STYLES } from "@/lib/reports/print-styles";

export function printReportHtml(title: string, bodyHtml: string) {
  printReportDocument(title, bodyHtml);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function riskBadge(risk: string) {
  const level = (risk || "low").toLowerCase();
  const cls = level === "high" ? "badge-high" : level === "medium" ? "badge-medium" : "badge-low";
  return `<span class="badge ${cls}">${escapeHtml(level)}</span>`;
}

export function table(headers: string[], rows: string[][]) {
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${row.map((c) => `<td>${tableCell(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function tableCell(value: string) {
  if (value.includes("<") && value.includes(">")) return value;
  return escapeHtml(value);
}
