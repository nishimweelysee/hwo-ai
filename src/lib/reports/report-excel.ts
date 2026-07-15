import * as XLSX from "xlsx";

export type ExcelSheet = {
  name: string;
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
};

export function downloadExcel(filename: string, sheets: ExcelSheet[]) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const data = [sheet.headers, ...sheet.rows.map((r) => r.map((c) => c ?? ""))];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  const name = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, name);
}

export function downloadCsv(filename: string, sheets: ExcelSheet[]) {
  const parts: string[] = [];
  for (const sheet of sheets) {
    parts.push(`# ${sheet.name}`);
    parts.push([sheet.headers, ...sheet.rows.map((r) => r.map((c) => String(c ?? "")))].map((row) => row.map(csvEscape).join(",")).join("\n"));
    parts.push("");
  }
  const blob = new Blob([parts.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
