"use client";

import { useEffect, useState } from "react";
import { Smartphone, Calendar, Bell, WifiOff } from "lucide-react";
import { apiFetch } from "@/lib/api";

type MobileSchedule = { date: string; shifts: { id: string; shift: string; department: string }[] };
type MobileAlert = { staff: string; department: string; risk: string; overtime: number };

export default function MobilePage() {
  const [schedules, setSchedules] = useState<MobileSchedule[]>([]);
  const [alerts, setAlerts] = useState<MobileAlert[]>([]);
  const [todayShift, setTodayShift] = useState<{ shift: string; department: string } | null>(null);

  useEffect(() => {
    apiFetch("/api/mobile/schedules?days=3")
      .then((r) => r.ok ? r.json() : { schedules: [] })
      .then((d: { schedules: MobileSchedule[] }) => {
        setSchedules(d.schedules || []);
        const today = d.schedules?.[0];
        if (today?.shifts?.length) {
          setTodayShift({ shift: today.shifts[0].shift, department: today.shifts[0].department });
        }
      });
    apiFetch("/api/mobile/alerts")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setAlerts(Array.isArray(data) ? data : []));
  }, []);

  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Mobile Application</h2>
        <p className="text-slate-600">Mobile-optimized access for healthcare staff</p>
      </div>

      <div className="flex flex-col items-center gap-8 lg:flex-row">
        <div className="flex h-[500px] w-72 flex-col rounded-3xl border-8 border-slate-800 bg-slate-100 p-4 shadow-xl">
          <div className="mb-4 h-6 rounded-full bg-slate-800" />
          <div className="flex-1 overflow-hidden rounded-2xl bg-white">
            <div className="border-b border-slate-200 p-4">
              <p className="font-semibold text-slate-800">My Schedule</p>
              <p className="text-sm text-slate-500">{today}</p>
            </div>
            <div className="space-y-2 p-4">
              {todayShift ? (
                <div className="rounded-lg bg-teal-50 p-3">
                  <p className="font-medium text-slate-800">{todayShift.shift} Shift</p>
                  <p className="text-sm text-slate-600">{todayShift.department}</p>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="font-medium text-slate-800">No shift today</p>
                </div>
              )}
              {schedules.slice(1, 3).map((day) => (
                <div key={day.date} className="rounded-lg border border-slate-200 p-3">
                  <p className="font-medium text-slate-800">
                    {day.shifts.length ? day.shifts[0].shift : "Off"}
                  </p>
                  <p className="text-sm text-slate-600">{day.date}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 font-semibold text-slate-800">Real-time Alerts ({alerts.length})</h3>
            {alerts.length === 0 ? (
              <p className="text-sm text-slate-500">No active alerts</p>
            ) : (
              <div className="space-y-2">
                {alerts.slice(0, 4).map((a, i) => (
                  <div key={i} className="flex justify-between rounded-lg border border-slate-200 p-3 text-sm">
                    <span className="font-medium text-slate-800">{a.staff}</span>
                    <span className={`rounded px-2 py-0.5 text-xs ${a.risk === "high" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                      {a.risk} risk
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 font-semibold text-slate-800">Mobile Features</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                { icon: Calendar, label: "Shift schedule view" },
                { icon: Bell, label: "Real-time alerts" },
                { icon: WifiOff, label: "Offline mode" },
                { icon: Smartphone, label: "Quick check-in/out" },
              ].map((f, i) => {
                const Icon = f.icon;
                return (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                    <Icon className="h-5 w-5 text-teal-500" />
                    <span className="text-sm font-medium text-slate-700">{f.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
