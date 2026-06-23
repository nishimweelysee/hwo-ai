"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import {
  scheduleStaffPath,
  type StaffWeekShiftsSummary,
} from "@/lib/scheduling-links";

type StaffWeekShiftsPanelProps = {
  staffId: string;
  staffName: string;
  expanded: boolean;
  compact?: boolean;
};

function shiftBadgeClass(shift: string): string {
  const s = shift.toLowerCase();
  if (s.includes("night")) return "bg-indigo-100 text-indigo-700";
  if (s.includes("evening")) return "bg-amber-100 text-amber-700";
  return "bg-sky-100 text-sky-700";
}

export function StaffWeekShiftsPanel({
  staffId,
  staffName,
  expanded,
  compact = false,
}: StaffWeekShiftsPanelProps) {
  const [data, setData] = useState<StaffWeekShiftsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded || !staffId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch(`/api/wellness/staff/${staffId}/shifts`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError("Could not load shifts");
          setData(null);
          return;
        }
        setData(await res.json());
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load shifts");
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, staffId]);

  if (!expanded) return null;

  return (
    <div
      className={`mt-3 rounded-lg border border-slate-200 bg-slate-50/80 ${compact ? "p-2" : "p-3"}`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className={`font-medium text-slate-800 ${compact ? "text-xs" : "text-sm"}`}>
          Last 7 days (rolling)
          {data && (
            <span className="ml-1 font-normal text-slate-500">
              {data.weekStart} → {data.weekEnd}
            </span>
          )}
        </p>
        {data && (
          <p className={`text-slate-600 ${compact ? "text-xs" : "text-sm"}`}>
            <span className="font-semibold text-slate-800">{data.totalHours}hr</span> scheduled
            {data.overtimeHours > 0 && (
              <span className="ml-1 text-rose-600">(+{data.overtimeHours}hr overtime)</span>
            )}
          </p>
        )}
      </div>

      {loading && (
        <p className={`text-slate-500 ${compact ? "text-xs" : "text-sm"}`}>Loading shifts…</p>
      )}
      {error && (
        <p className={`text-rose-600 ${compact ? "text-xs" : "text-sm"}`}>{error}</p>
      )}
      {!loading && !error && data && data.shifts.length === 0 && (
        <p className={`text-slate-500 ${compact ? "text-xs" : "text-sm"}`}>
          No shifts in the last 7 days — overtime may come from wellness check-ins or manual records.
        </p>
      )}
      {!loading && !error && data && data.shifts.length > 0 && (
        <div className="overflow-x-auto">
          <table className={`w-full ${compact ? "text-xs" : "text-sm"}`}>
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="pb-1 pr-3 font-medium">Date</th>
                <th className="pb-1 pr-3 font-medium">Shift</th>
                <th className="pb-1 pr-3 font-medium">Dept</th>
                <th className="pb-1 pr-3 font-medium">Hrs</th>
                <th className="pb-1 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.shifts.map((shift) => (
                <tr key={shift.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-3 text-slate-800">
                    {shift.date
                      ? new Date(`${shift.date}T12:00:00`).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </td>
                  <td className="py-1.5 pr-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${shiftBadgeClass(shift.shift)}`}
                    >
                      {shift.shift}
                    </span>
                    {shift.swapRequested && (
                      <span className="ml-1 text-xs text-amber-600">swap</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-slate-600">{shift.dept || "—"}</td>
                  <td className="py-1.5 pr-3 text-slate-600">{shift.hours}</td>
                  <td className="py-1.5">
                    {shift.date && (
                      <Link
                        href={scheduleStaffPath(staffId, staffName, shift.date)}
                        className="font-medium text-teal-600 hover:text-teal-700"
                      >
                        Edit
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.shifts.length > 0 && (
        <div className="mt-2">
          <Link
            href={scheduleStaffPath(staffId, staffName)}
            className={`font-medium text-teal-600 hover:text-teal-700 ${compact ? "text-xs" : "text-sm"}`}
          >
            Open full schedule →
          </Link>
        </div>
      )}
    </div>
  );
}
