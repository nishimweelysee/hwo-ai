"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { parseApiError, writableSettingsPayload } from "@/lib/settings-config";
import { usePermissions } from "@/hooks/use-permissions";
import { usePagination } from "@/hooks/use-pagination";
import { Pagination } from "@/components/pagination";
import { SearchableSelect } from "@/components/searchable-select";
import { staffToSearchableOptions, filterStaffPreferences, buildSearchText } from "@/lib/searchable-options";
import { fetchStaffOptionsPage } from "@/lib/staff-options";
import { ListSearchBar } from "@/components/list-search-bar";
import { useAuth } from "@/lib/auth-context";
import {
  Calendar,
  UserPlus,
  AlertCircle,
  Clock,
  CalendarOff,
  Heart,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Sparkles,
  RefreshCw,
  TrendingUp,
  HelpCircle,
  ArrowRight,
} from "lucide-react";

type ScheduleSlot = {
  id: string;
  staffId?: string;
  staff: string;
  role: string;
  shift: string;
  dept: string;
  departmentId?: string;
  date?: string;
  status?: string;
  swapRequested: boolean;
  canSwap: boolean;
  needsAssignment?: boolean;
};

type LeaveItem = {
  id: string;
  staffId?: string;
  staff: { id?: string; name: string };
  startDate: string;
  endDate: string;
  type: string;
  status: string;
};

type OnCallItem = {
  id: string;
  staffId?: string;
  staff: { id?: string; name: string };
  date: string;
  startTime: string;
  endTime: string;
  status?: string;
};

type StaffOption = {
  id: string;
  name: string;
  email?: string;
  role?: string;
  departmentId?: string;
  department?: string;
};

const LEAVE_TYPES = ["Annual", "Sick", "Personal", "Unpaid"];
const EMPTY_SHIFT_FORM = { staffId: "", shift: "", date: "", departmentId: "" };

type OpenShiftSlot = {
  id: string;
  shift: string;
  status: string;
  date: string;
  departmentId?: string;
  department?: string;
  surge?: boolean;
  forecastReason?: string;
  required?: number;
  baseRequired?: number;
  filled?: number;
  vacant?: number;
  forecastMultiplier?: number;
};

type AssigneeSuggestion = {
  staffId: string;
  name: string;
  role?: string;
  department?: string;
  score: number;
  reasons: string[];
  recommended?: boolean;
  certifications?: string[];
  skillGaps?: string[];
  aiRanked?: boolean;
};

type DepartmentForecast = {
  departmentId: string;
  department: string;
  baselineLoad: number;
  predictedLoad: number;
  dailyPredictedLoad?: number;
  trend: string;
  multiplier: number;
  baseMinStaff: number;
  effectiveMinStaff: number;
  surge: boolean;
  reason: string;
  forecastSource?: string;
  requiredCerts?: string[];
  certCoverage?: number;
};

type WhatIfScenario = {
  departmentId?: string;
  department?: string;
  shift?: string;
  count?: number;
  requiredMin?: number;
  filledBefore?: number;
  filledAfter?: number;
  vacantSlots?: number;
  gapBefore?: number;
  gapAfter?: number;
  closesGap?: boolean;
  meetsTarget?: boolean;
  forecastMultiplier?: number;
  predictedLoad?: number;
  forecastReason?: string;
  surge?: boolean;
};

type WhatIfResult = {
  currentCoverage: number;
  projectedCoverage: number;
  coverageDelta: number;
  message: string;
  recommendation?: string;
  purpose?: string;
  currentScheduled: number;
  projectedScheduled: number;
  targetShifts: number;
  scenarios?: WhatIfScenario[];
  additions?: WhatIfScenario[];
};

type ModelHealth = {
  aiServiceHealthy?: boolean;
  systemModelActive?: boolean;
  globalModelActive?: boolean;
  activeModelName?: string;
  activeModelVersion?: string;
  schedulingAiActive?: boolean;
  globalModelType?: string;
  modelComplexity?: string;
};

export default function SchedulingPage() {
  const { token, loading: authLoading } = useAuth();
  const { manageSettings } = usePermissions();
  const searchParams = useSearchParams();
  const [staffFilterId, setStaffFilterId] = useState<string | null>(null);
  const [staffFilterName, setStaffFilterName] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [staffOptionsLoading, setStaffOptionsLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [leave, setLeave] = useState<LeaveItem[]>([]);
  const [onCall, setOnCall] = useState<OnCallItem[]>([]);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<{ type: string; staff: string; detail: string }[]>([]);
  const [constraints, setConstraints] = useState<{
    maxHoursPerWeek: number;
    restBetweenShifts: number;
    respectPreferences: boolean;
    skillMixRequired: boolean;
    [key: string]: unknown;
  } | null>(null);
  const [constraintsLoading, setConstraintsLoading] = useState(true);
  const [shiftTypes, setShiftTypes] = useState<string[]>([]);
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().split("T")[0]);
  const [summary, setSummary] = useState({
    coverage: 0,
    openShifts: 0,
    swapRequests: 0,
    targetShifts: 0,
    scheduled: 0,
    openShiftSlots: [] as OpenShiftSlot[],
    recommendations: [] as { department: string; action: string; priority: string; detail?: string; ai?: boolean }[],
    forecastByDepartment: [] as DepartmentForecast[],
    aiAssisted: false,
    modelHealth: null as ModelHealth | null,
  });
  const [assigneeSuggestions, setAssigneeSuggestions] = useState<AssigneeSuggestion[]>([]);
  const [swapPartners, setSwapPartners] = useState<Record<string, AssigneeSuggestion[]>>({});
  const [loadingSwapFor, setLoadingSwapFor] = useState<string | null>(null);
  const [whatIfForm, setWhatIfForm] = useState({ departmentId: "", shift: "Evening", count: 2 });
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResult | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [loadingWhatIf, setLoadingWhatIf] = useState(false);
  const [autoScheduling, setAutoScheduling] = useState(false);
  const [lastAutoSchedule, setLastAutoSchedule] = useState<{
    assigned?: number;
    skipped?: number;
    coverageBefore?: number;
    coverageAfter?: number;
    openShiftsBefore?: number;
    openShiftsAfter?: number;
    aiAssisted?: boolean;
    message?: string;
    skippedReasons?: string[];
    assignments?: { staffName?: string; shift?: string; department?: string; aiRanked?: boolean }[];
  } | null>(null);
  const [preferences, setPreferences] = useState<
    { staffId: string; staffName: string; preferredShifts: string[]; avoidDates: string[] }[]
  >([]);
  const [editingPref, setEditingPref] = useState<string | null>(null);
  const [prefSearch, setPrefSearch] = useState("");
  const [leaveSearch, setLeaveSearch] = useState("");
  const [onCallSearch, setOnCallSearch] = useState("");
  const [prefForm, setPrefForm] = useState({ preferredShifts: [] as string[], avoidDates: "" });
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [savingConstraints, setSavingConstraints] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [showShiftForm, setShowShiftForm] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [shiftForm, setShiftForm] = useState(EMPTY_SHIFT_FORM);

  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);
  const [leaveForm, setLeaveForm] = useState({
    staffId: "",
    type: "Annual",
    startDate: "",
    endDate: "",
  });

  const [showOnCallForm, setShowOnCallForm] = useState(false);
  const [editingOnCallId, setEditingOnCallId] = useState<string | null>(null);
  const [onCallForm, setOnCallForm] = useState({
    staffId: "",
    date: "",
    startTime: "18:00",
    endTime: "08:00",
  });

  const loadSchedulingMeta = useCallback(async () => {
    setConstraintsLoading(true);
    try {
      const metaRes = await apiFetch("/api/scheduling/meta");
      if (!metaRes.ok) {
        setSaveMessage({ type: "error", text: await parseApiError(metaRes, "Failed to load scheduling settings") });
        return;
      }
      const meta = await metaRes.json();
      if (meta.constraints) setConstraints(meta.constraints);
      if (Array.isArray(meta.preferences)) setPreferences(meta.preferences);
      if (Array.isArray(meta.shiftTypes) && meta.shiftTypes.length) setShiftTypes(meta.shiftTypes);
      else if (meta.constraints?.shiftTypes?.length) setShiftTypes(meta.constraints.shiftTypes);
      if (Array.isArray(meta.departments)) {
        setDepartments(
          meta.departments.map((d: { id: string; name: string }) => ({ id: d.id, name: d.name }))
        );
      }
    } catch {
      setSaveMessage({ type: "error", text: "Failed to load scheduling constraints — check that the backend is running" });
    } finally {
      setConstraintsLoading(false);
    }
  }, []);

  const loadStaffOptions = useCallback(async (departmentId?: string, search?: string) => {
    setStaffOptionsLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "10" });
      if (departmentId) params.set("departmentId", departmentId);
      if (search?.trim()) params.set("search", search.trim());
      const res = await apiFetch(`/api/staff/options?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.options)) {
          setStaff(
            data.options.map(
              (s: { id: string; name: string; email?: string; role?: string; departmentId?: string; department?: string }) => ({
                id: s.id,
                name: s.name,
                email: s.email,
                role: s.role,
                departmentId: s.departmentId,
                department: s.department,
              })
            )
          );
        }
      }
    } catch {
      /* dropdown can retry when form reopens */
    } finally {
      setStaffOptionsLoading(false);
    }
  }, []);

  const loadShiftStaffOptions = useCallback(
    (args: { search: string; page: number; pageSize: number }) =>
      fetchStaffOptionsPage({ ...args, departmentId: shiftForm.departmentId || undefined }),
    [shiftForm.departmentId]
  );

  const loadAllStaffOptions = useCallback(
    (args: { search: string; page: number; pageSize: number }) => fetchStaffOptionsPage(args),
    []
  );

  const loadData = useCallback(async (date: string) => {
    setOverviewLoading(true);
    setLoadError(null);
    setSwapPartners({});
    try {
      const overviewRes = await apiFetch(`/api/scheduling/overview?date=${date}`);
      if (!overviewRes.ok) {
        setLoadError(await parseApiError(overviewRes, "Failed to load scheduling data"));
        return;
      }
      const data = await overviewRes.json();

      if (Array.isArray(data.schedules)) {
        setSlots(
          data.schedules.map(
            (s: {
              id: string;
              staffId?: string;
              staff: string;
              role?: string;
              shift: string;
              dept?: string;
              departmentId?: string;
              date?: string;
              status?: string;
              swapRequested?: boolean;
              canSwap?: boolean;
              needsAssignment?: boolean;
            }) => ({
              id: s.id,
              staffId: s.staffId,
              staff: s.staff,
              role: s.role || "",
              shift: s.shift,
              dept: s.dept || "",
              departmentId: s.departmentId,
              date: s.date,
              status: s.status || "scheduled",
              swapRequested: s.swapRequested ?? false,
              canSwap: s.canSwap !== false,
              needsAssignment: s.needsAssignment ?? s.status === "open",
            })
          )
        );
      } else {
        setSlots([]);
      }

      if (Array.isArray(data.leave)) setLeave(data.leave);
      if (Array.isArray(data.onCall)) setOnCall(data.onCall);
      if (Array.isArray(data.conflicts)) setConflicts(data.conflicts);
      else setConflicts([]);

      const summaryData = data.summary;
      if (summaryData) {
        setSummary({
          coverage: summaryData.coverage ?? 0,
          openShifts: summaryData.openShifts ?? 0,
          swapRequests: summaryData.swapRequests ?? 0,
          targetShifts: summaryData.targetShifts ?? 0,
          scheduled: summaryData.scheduled ?? 0,
          openShiftSlots: Array.isArray(summaryData.openShiftSlots) ? summaryData.openShiftSlots : [],
          recommendations: Array.isArray(summaryData.recommendations) ? summaryData.recommendations : [],
          forecastByDepartment: Array.isArray(summaryData.forecastByDepartment) ? summaryData.forecastByDepartment : [],
          aiAssisted: summaryData.aiAssisted ?? false,
          modelHealth: summaryData.modelHealth ?? null,
        });
      }
    } catch {
      setLoadError("Failed to load scheduling data — restart the backend and sign in again");
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !token) return;
    loadSchedulingMeta();
  }, [authLoading, token, loadSchedulingMeta]);

  useEffect(() => {
    if (!showShiftForm && !showLeaveForm && !showOnCallForm) return;
    const deptId = showShiftForm && shiftForm.departmentId ? shiftForm.departmentId : undefined;
    void loadStaffOptions(deptId);
  }, [showShiftForm, showLeaveForm, showOnCallForm, shiftForm.departmentId, loadStaffOptions]);

  useEffect(() => {
    const id = searchParams.get("staffId");
    const name = searchParams.get("staffName");
    const date = searchParams.get("date");
    setStaffFilterId(id);
    setStaffFilterName(name);
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setScheduleDate(date);
    }
  }, [searchParams]);

  useEffect(() => {
    if (authLoading || !token) return;
    setWhatIfResult(null);
    loadData(scheduleDate);
  }, [scheduleDate, loadData, authLoading, token]);

  const loadAssigneeSuggestions = useCallback(async () => {
    if (!showShiftForm || !shiftForm.shift) {
      setAssigneeSuggestions([]);
      return;
    }
    setLoadingSuggestions(true);
    try {
      const params = new URLSearchParams({
        date: shiftForm.date || scheduleDate,
        shift: shiftForm.shift,
      });
      if (shiftForm.departmentId) params.set("departmentId", shiftForm.departmentId);
      const editing = editingShiftId ? slots.find((s) => s.id === editingShiftId) : null;
      if (editing?.staffId) params.set("excludeStaffId", editing.staffId);
      const res = await apiFetch(`/api/scheduling/ai/suggestions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAssigneeSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      } else {
        setAssigneeSuggestions([]);
      }
    } catch {
      setAssigneeSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [showShiftForm, shiftForm, scheduleDate, editingShiftId, slots]);

  useEffect(() => {
    loadAssigneeSuggestions();
  }, [loadAssigneeSuggestions]);

  const loadSwapPartners = useCallback(
    async (scheduleId: string) => {
      setLoadingSwapFor(scheduleId);
      try {
        const res = await apiFetch(`/api/scheduling/ai/swap-partners/${scheduleId}`);
        if (res.ok) {
          const data = await res.json();
          setSwapPartners((prev) => ({
            ...prev,
            [scheduleId]: Array.isArray(data.partners) ? data.partners : [],
          }));
        } else {
          setSwapPartners((prev) => ({ ...prev, [scheduleId]: [] }));
        }
      } catch {
        setSwapPartners((prev) => ({ ...prev, [scheduleId]: [] }));
      } finally {
        setLoadingSwapFor((current) => (current === scheduleId ? null : current));
      }
    },
    []
  );

  const applyWhatIfFromOpenSlot = (slot: OpenShiftSlot) => {
    if (!slot.departmentId) return;
    const gap = Math.max(1, (slot.required ?? 1) - (slot.filled ?? 0) - (slot.vacant ?? 0));
    setWhatIfForm({
      departmentId: slot.departmentId,
      shift: slot.shift,
      count: gap,
    });
    setWhatIfResult(null);
  };

  const whatIfQuickPicks = useMemo(() => {
    const seen = new Set<string>();
    const picks: { key: string; label: string; slot: OpenShiftSlot; gap: number }[] = [];
    for (const slot of summary.openShiftSlots) {
      if (!slot.departmentId) continue;
      const key = `${slot.departmentId}:${slot.shift}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const gap = Math.max(1, (slot.required ?? 1) - (slot.filled ?? 0) - (slot.vacant ?? 0));
      picks.push({
        key,
        label: `${slot.department ?? "Dept"} · ${slot.shift} (+${gap})`,
        slot,
        gap,
      });
      if (picks.length >= 6) break;
    }
    return picks;
  }, [summary.openShiftSlots]);

  const primaryWhatIfScenario = whatIfResult?.scenarios?.[0] ?? whatIfResult?.additions?.[0];

  const runWhatIf = async () => {
    if (!whatIfForm.departmentId) {
      notify("error", "Select a department for what-if analysis");
      return;
    }
    setLoadingWhatIf(true);
    setWhatIfResult(null);
    try {
      const res = await apiFetch("/api/scheduling/ai/what-if", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: scheduleDate,
          additions: [
            {
              departmentId: whatIfForm.departmentId,
              shift: whatIfForm.shift,
              count: whatIfForm.count,
            },
          ],
        }),
      });
      if (!res.ok) {
        notify("error", await parseApiError(res, "What-if analysis failed"));
        return;
      }
      setWhatIfResult(await res.json());
    } catch {
      notify("error", "What-if analysis failed");
    } finally {
      setLoadingWhatIf(false);
    }
  };

  const runAutoSchedule = async () => {
    setAutoScheduling(true);
    setSaveMessage(null);
    setLastAutoSchedule(null);
    try {
      const res = await apiFetch("/api/scheduling/ai/auto-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: scheduleDate }),
      });
      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        notify("error", await parseApiError(res, "Auto-schedule failed"));
        return;
      }
      if (!res.ok) {
        notify("error", String(data.error ?? (await parseApiError(res, "Auto-schedule failed"))));
        return;
      }
      setLastAutoSchedule(data as typeof lastAutoSchedule);
      await loadData(scheduleDate);
      const assigned = Number(data.assigned ?? 0);
      const msg = String(data.message ?? "");
      if (assigned > 0) {
        notify("success", msg || `Assigned ${assigned} shift(s)`);
      } else {
        notify("error", msg || "No shifts could be auto-assigned for this date");
      }
    } catch {
      notify("error", "Auto-schedule failed — check that the backend is running");
    } finally {
      setAutoScheduling(false);
    }
  };

  const assignSwapPartner = async (scheduleId: string, staffId: string) => {
    setBusy(`assign-${scheduleId}`);
    setSaveMessage(null);
    try {
      const res = await apiFetch(`/api/schedules/${scheduleId}/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", staffId }),
      });
      if (!res.ok) {
        notify("error", await parseApiError(res, "Failed to assign swap partner"));
        return;
      }
      const data = await res.json();
      await loadData(scheduleDate);
      notify("success", data.message || "Swap partner assigned");
    } catch {
      notify("error", "Failed to assign swap partner");
    } finally {
      setBusy(null);
    }
  };

  const notify = (type: "success" | "error", text: string) => {
    setSaveMessage({ type, text });
  };

  const handleSwap = async (scheduleId: string) => {
    setSwapping(scheduleId);
    setSaveMessage(null);
    try {
      const res = await apiFetch("/api/schedules/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId }),
      });
      if (!res.ok) {
        notify("error", await parseApiError(res, "Swap request failed"));
        return;
      }
      await loadData(scheduleDate);
      notify("success", "Swap requested");
    } catch {
      notify("error", "Swap request failed — check that the backend is running");
    } finally {
      setSwapping(null);
    }
  };

  const handleResolveSwap = async (scheduleId: string, action: "approve" | "reject") => {
    setBusy(`swap-${scheduleId}`);
    setSaveMessage(null);
    try {
      const res = await apiFetch(`/api/schedules/${scheduleId}/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        notify("error", await parseApiError(res, `Failed to ${action} swap`));
        return;
      }
      const data = await res.json();
      await loadData(scheduleDate);
      if (action === "approve") {
        notify(
          "success",
          data.message || "Swap approved — shift is open. Assign a replacement in the table."
        );
      } else {
        notify("success", "Swap rejected — original assignment unchanged");
      }
    } catch {
      notify("error", "Swap action failed");
    } finally {
      setBusy(null);
    }
  };

  const departmentOptions =
    summary.forecastByDepartment.length > 0
      ? summary.forecastByDepartment.map((f) => ({ id: f.departmentId, name: f.department }))
      : departments.length > 0
        ? departments
        : Array.from(new Set(staff.map((s) => s.departmentId).filter(Boolean))).map((id) => ({
            id: id!,
            name: id!,
          }));

  const surgeDepartments = summary.forecastByDepartment.filter((f) => f.surge);

  const staffForShiftForm = shiftForm.departmentId
    ? staff.filter((s) => s.departmentId === shiftForm.departmentId)
    : staff;

  const allStaffOptions = useMemo(() => staffToSearchableOptions(staff), [staff]);
  const shiftStaffOptions = useMemo(
    () => staffToSearchableOptions(staffForShiftForm),
    [staffForShiftForm]
  );

  const openSlotsByDepartment = summary.openShiftSlots.reduce<Record<string, OpenShiftSlot[]>>((acc, slot) => {
    const dept = slot.department || "Unassigned";
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(slot);
    return acc;
  }, {});

  const filteredPreferences = useMemo(
    () => filterStaffPreferences(preferences, prefSearch),
    [preferences, prefSearch]
  );

  const filteredLeave = useMemo(() => {
    const q = leaveSearch.trim().toLowerCase();
    if (!q) return leave;
    return leave.filter((l) => {
      const haystack = buildSearchText([l.staff?.name, l.staffId, l.staff?.id, l.type, l.status, l.startDate, l.endDate]);
      return q.split(/\s+/).every((token) => haystack.includes(token));
    });
  }, [leave, leaveSearch]);

  const filteredOnCall = useMemo(() => {
    const q = onCallSearch.trim().toLowerCase();
    if (!q) return onCall;
    return onCall.filter((o) => {
      const haystack = buildSearchText([o.staff?.name, o.staffId, o.staff?.id, o.date, o.startTime, o.endTime, o.status]);
      return q.split(/\s+/).every((token) => haystack.includes(token));
    });
  }, [onCall, onCallSearch]);

  const filteredSlots = useMemo(() => {
    if (!staffFilterId) return slots;
    const staffName =
      staffFilterName ||
      staff.find((s) => s.id === staffFilterId)?.name ||
      "";
    return slots.filter(
      (s) =>
        s.staffId === staffFilterId ||
        (staffName && s.staff.toLowerCase() === staffName.toLowerCase())
    );
  }, [slots, staffFilterId, staffFilterName, staff]);

  const slotsPagination = usePagination(filteredSlots, 15, `${scheduleDate}-${staffFilterId ?? ""}`);
  const leavePagination = usePagination(filteredLeave, 10, leaveSearch);
  const onCallPagination = usePagination(filteredOnCall, 10, `${scheduleDate}-${onCallSearch}`);
  const preferencesPagination = usePagination(filteredPreferences, 10, prefSearch);

  const openCreateShift = () => {
    setEditingShiftId(null);
    setShiftForm({
      staffId: staff[0]?.id || "",
      shift: shiftTypes[0] || "Day",
      date: scheduleDate,
      departmentId: "",
    });
    setShowShiftForm(true);
  };

  const openShiftSlot = (slot: OpenShiftSlot) => {
    const deptStaff = staff.filter((s) => s.departmentId === slot.departmentId);
    setEditingShiftId(null);
    setShiftForm({
      staffId: deptStaff[0]?.id || "",
      shift: slot.shift,
      date: scheduleDate,
      departmentId: slot.departmentId || "",
    });
    setShowShiftForm(true);
  };

  const openAssignShift = (slot: ScheduleSlot) => {
    const deptStaff = slot.departmentId
      ? staff.filter((s) => s.departmentId === slot.departmentId)
      : staff;
    setEditingShiftId(slot.id);
    setShiftForm({
      staffId: deptStaff[0]?.id || "",
      shift: slot.shift,
      date: slot.date || scheduleDate,
      departmentId: slot.departmentId || "",
    });
    setShowShiftForm(true);
  };

  const openEditShift = (slot: ScheduleSlot) => {
    setEditingShiftId(slot.id);
    setShiftForm({
      staffId: slot.staffId || staff.find((s) => s.name === slot.staff)?.id || "",
      shift: slot.shift,
      date: slot.date || scheduleDate,
      departmentId: slot.departmentId || "",
    });
    setShowShiftForm(true);
  };

  const saveShift = async () => {
    if (!shiftForm.staffId || !shiftForm.shift) {
      notify("error", "Staff and shift are required");
      return;
    }
    setBusy("shift-save");
    setSaveMessage(null);
    try {
      const payload = {
        staffId: shiftForm.staffId,
        shift: shiftForm.shift,
        date: shiftForm.date || scheduleDate,
      };
      const res = editingShiftId
        ? await apiFetch(`/api/schedules/${editingShiftId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await apiFetch("/api/schedules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        notify("error", await parseApiError(res, "Failed to save shift"));
        return;
      }
      setShowShiftForm(false);
      await loadData(scheduleDate);
      const wasOpen = slots.find((s) => s.id === editingShiftId)?.needsAssignment;
      notify(
        "success",
        editingShiftId
          ? wasOpen
            ? "Replacement assigned to open shift"
            : "Shift updated"
          : "Shift created"
      );
    } catch {
      notify("error", "Failed to save shift");
    } finally {
      setBusy(null);
    }
  };

  const deleteShift = async (id: string) => {
    if (!confirm("Delete this shift assignment?")) return;
    setBusy(`delete-shift-${id}`);
    setSaveMessage(null);
    try {
      const res = await apiFetch(`/api/schedules/${id}`, { method: "DELETE" });
      if (!res.ok) {
        notify("error", await parseApiError(res, "Failed to delete shift"));
        return;
      }
      await loadData(scheduleDate);
      notify("success", "Shift deleted");
    } catch {
      notify("error", "Failed to delete shift");
    } finally {
      setBusy(null);
    }
  };

  const openCreateLeave = () => {
    setEditingLeaveId(null);
    setLeaveForm({
      staffId: staff[0]?.id || "",
      type: "Annual",
      startDate: scheduleDate,
      endDate: scheduleDate,
    });
    setShowLeaveForm(true);
  };

  const openEditLeave = (item: LeaveItem) => {
    setEditingLeaveId(item.id);
    setLeaveForm({
      staffId: item.staffId || item.staff?.id || "",
      type: item.type,
      startDate: item.startDate?.substring(0, 10) || "",
      endDate: item.endDate?.substring(0, 10) || "",
    });
    setShowLeaveForm(true);
  };

  const saveLeave = async () => {
    if (!leaveForm.staffId || !leaveForm.startDate || !leaveForm.endDate) {
      notify("error", "Staff and dates are required");
      return;
    }
    setBusy("leave-save");
    setSaveMessage(null);
    try {
      const payload = {
        staffId: leaveForm.staffId,
        type: leaveForm.type,
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate,
      };
      const res = editingLeaveId
        ? await apiFetch(`/api/leave/${editingLeaveId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await apiFetch("/api/leave", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        notify("error", await parseApiError(res, "Failed to save leave request"));
        return;
      }
      setShowLeaveForm(false);
      await loadData(scheduleDate);
      notify("success", editingLeaveId ? "Leave updated" : "Leave request submitted");
    } catch {
      notify("error", "Failed to save leave request");
    } finally {
      setBusy(null);
    }
  };

  const updateLeaveStatus = async (id: string, status: "approved" | "rejected") => {
    setBusy(`leave-${id}`);
    setSaveMessage(null);
    try {
      const res = await apiFetch(`/api/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        notify("error", await parseApiError(res, "Failed to update leave status"));
        return;
      }
      await loadData(scheduleDate);
      notify("success", `Leave ${status}`);
    } catch {
      notify("error", "Failed to update leave status");
    } finally {
      setBusy(null);
    }
  };

  const deleteLeave = async (id: string) => {
    if (!confirm("Delete this leave request?")) return;
    setBusy(`delete-leave-${id}`);
    try {
      const res = await apiFetch(`/api/leave/${id}`, { method: "DELETE" });
      if (!res.ok) {
        notify("error", await parseApiError(res, "Failed to delete leave"));
        return;
      }
      await loadData(scheduleDate);
      notify("success", "Leave request deleted");
    } catch {
      notify("error", "Failed to delete leave");
    } finally {
      setBusy(null);
    }
  };

  const openCreateOnCall = () => {
    setEditingOnCallId(null);
    setOnCallForm({
      staffId: staff[0]?.id || "",
      date: scheduleDate,
      startTime: "18:00",
      endTime: "08:00",
    });
    setShowOnCallForm(true);
  };

  const openEditOnCall = (item: OnCallItem) => {
    setEditingOnCallId(item.id);
    setOnCallForm({
      staffId: item.staffId || item.staff?.id || "",
      date: item.date?.substring(0, 10) || scheduleDate,
      startTime: item.startTime,
      endTime: item.endTime,
    });
    setShowOnCallForm(true);
  };

  const saveOnCall = async () => {
    if (!onCallForm.staffId || !onCallForm.date || !onCallForm.startTime || !onCallForm.endTime) {
      notify("error", "All on-call fields are required");
      return;
    }
    setBusy("oncall-save");
    setSaveMessage(null);
    try {
      const payload = { ...onCallForm };
      const res = editingOnCallId
        ? await apiFetch(`/api/on-call/${editingOnCallId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await apiFetch("/api/on-call", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        notify("error", await parseApiError(res, "Failed to save on-call assignment"));
        return;
      }
      setShowOnCallForm(false);
      await loadData(scheduleDate);
      notify("success", editingOnCallId ? "On-call updated" : "On-call assigned");
    } catch {
      notify("error", "Failed to save on-call assignment");
    } finally {
      setBusy(null);
    }
  };

  const deleteOnCall = async (id: string) => {
    if (!confirm("Remove this on-call assignment?")) return;
    setBusy(`delete-oncall-${id}`);
    try {
      const res = await apiFetch(`/api/on-call/${id}`, { method: "DELETE" });
      if (!res.ok) {
        notify("error", await parseApiError(res, "Failed to delete on-call"));
        return;
      }
      await loadData(scheduleDate);
      notify("success", "On-call assignment removed");
    } catch {
      notify("error", "Failed to delete on-call");
    } finally {
      setBusy(null);
    }
  };

  const shiftBadgeClass = (shift: string) => {
    if (shift === "Day") return "bg-amber-100 text-amber-700";
    if (shift === "Evening") return "bg-orange-100 text-orange-700";
    if (shift === "Night") return "bg-slate-700 text-slate-100";
    return "bg-slate-200 text-slate-700";
  };

  const statusBadgeClass = (status: string) => {
    if (status === "published") return "bg-emerald-100 text-emerald-700";
    if (status === "open") return "bg-sky-100 text-sky-700";
    if (status === "swap_pending") return "bg-amber-100 text-amber-700";
    return "bg-slate-100 text-slate-600";
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Optimization & Scheduling</h2>
          <p className="text-slate-600">AI-powered staff allocation and shift management</p>
          {summary.modelHealth && (
            <p className="mt-1 text-xs text-slate-500">
              ML status:{" "}
              {summary.aiAssisted
                ? summary.modelHealth.activeModelName
                  ? `System model ${summary.modelHealth.activeModelName} active${summary.modelHealth.globalModelType ? ` (${summary.modelHealth.globalModelType})` : ""}`
                  : `Unified system model active${summary.modelHealth.globalModelType ? ` (${summary.modelHealth.globalModelType})` : ""}`
                : "Heuristic mode — start AI service and train the system model"}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            void loadData(scheduleDate);
            void loadSchedulingMeta();
          }}
          disabled={overviewLoading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${overviewLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loadError && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{loadError}</p>
      )}

      {lastAutoSchedule && lastAutoSchedule.assigned !== undefined && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-900">
          <p className="font-medium">
            Auto-schedule: {lastAutoSchedule.assigned} assigned
            {(lastAutoSchedule.skipped ?? 0) > 0 ? `, ${lastAutoSchedule.skipped} skipped` : ""}
            {lastAutoSchedule.aiAssisted ? " · AI-ranked" : " · rule-based ranking"}
          </p>
          <p className="mt-1 text-xs text-indigo-800">
            Coverage {lastAutoSchedule.coverageBefore}% → {lastAutoSchedule.coverageAfter}% · Open shifts{" "}
            {lastAutoSchedule.openShiftsBefore} → {lastAutoSchedule.openShiftsAfter}
          </p>
          {lastAutoSchedule.message && (
            <p className="mt-1 text-xs text-indigo-800">{lastAutoSchedule.message}</p>
          )}
          {(lastAutoSchedule.skippedReasons?.length ?? 0) > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs text-indigo-700">
              {lastAutoSchedule.skippedReasons!.slice(0, 5).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {saveMessage && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            saveMessage.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {saveMessage.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-teal-100 p-2">
              <Calendar className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Schedule Coverage</p>
              <p className="text-2xl font-bold text-slate-800">{summary.coverage}%</p>
              <p className="mt-0.5 text-xs text-slate-400">Shifts filled vs target</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${summary.openShifts > 0 ? "bg-amber-100" : "bg-emerald-100"}`}>
              <UserPlus className={`h-5 w-5 ${summary.openShifts > 0 ? "text-amber-600" : "text-emerald-600"}`} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Open Shifts</p>
              <p className={`text-2xl font-bold ${summary.openShifts > 0 ? "text-amber-700" : "text-slate-800"}`}>{summary.openShifts}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {summary.scheduled} of {summary.targetShifts || 0} targets filled
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${summary.swapRequests > 0 ? "bg-rose-100" : "bg-slate-100"}`}>
              <AlertCircle className={`h-5 w-5 ${summary.swapRequests > 0 ? "text-rose-600" : "text-slate-500"}`} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Swap Requests</p>
              <p className={`text-2xl font-bold ${summary.swapRequests > 0 ? "text-rose-700" : "text-slate-800"}`}>{summary.swapRequests}</p>
              <p className="mt-0.5 text-xs text-slate-400">Pending staff requests</p>
            </div>
          </div>
        </div>
      </div>

      {summary.aiAssisted && surgeDepartments.length > 0 && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-violet-900">
            <TrendingUp className="h-4 w-4" /> Forecast-driven staffing targets
          </h3>
          <p className="mb-3 text-sm text-violet-800">
            AI workload forecast raised minimum staffing for high-demand departments today.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {surgeDepartments.map((f) => (
              <div key={f.departmentId} className="rounded-lg border border-violet-200 bg-white p-3 text-sm">
                <p className="font-medium text-slate-800">{f.department}</p>
                <p className="text-xs text-violet-700">
                  {f.baseMinStaff} → {f.effectiveMinStaff} per shift ({Math.round(f.multiplier * 100)}%)
                  {f.forecastSource === "ridge-daily" && " · ML daily forecast"}
                </p>
                <p className="text-xs text-slate-500">
                  Predicted load: {f.dailyPredictedLoad ?? f.predictedLoad}%
                  {f.requiredCerts && f.requiredCerts.length > 0 && (
                    <> · Certs: {f.requiredCerts.join(", ")} ({f.certCoverage ?? 0}% coverage)</>
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-600">{f.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-slate-800">
              <Sparkles className="h-4 w-4 text-indigo-600" /> What-if scheduling
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Preview staffing impact before you change the live schedule — no assignments are saved until you act.
            </p>
          </div>
        </div>

        <div className="mb-5 rounded-lg border border-indigo-100 bg-white/80 p-4">
          <p className="flex items-start gap-2 text-sm font-medium text-indigo-900">
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
            What this helps you decide
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
            <li className="flex gap-2">
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-400" />
              Whether adding staff to a department and shift closes the forecast-adjusted gap for that day
            </li>
            <li className="flex gap-2">
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-400" />
              How hospital-wide coverage % changes before approving overtime, agency cover, or redeployments
            </li>
            <li className="flex gap-2">
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-400" />
              Which surge departments benefit most when patient-load forecasts raise minimum staffing
            </li>
          </ul>
        </div>

        {whatIfQuickPicks.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Quick scenarios from open gaps
            </p>
            <div className="flex flex-wrap gap-2">
              {whatIfQuickPicks.map((pick) => (
                <button
                  key={pick.key}
                  type="button"
                  onClick={() => applyWhatIfFromOpenSlot(pick.slot)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    whatIfForm.departmentId === pick.slot.departmentId && whatIfForm.shift === pick.slot.shift
                      ? "border-indigo-400 bg-indigo-100 text-indigo-800"
                      : "border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50"
                  }`}
                >
                  {pick.label}
                  {pick.slot.surge && (
                    <span className="ml-1 text-violet-600">· surge</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-slate-500">Department</label>
            <select
              value={whatIfForm.departmentId}
              onChange={(e) => {
                setWhatIfForm((f) => ({ ...f, departmentId: e.target.value }));
                setWhatIfResult(null);
              }}
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Select department</option>
              {departmentOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Shift</label>
            <select
              value={whatIfForm.shift}
              onChange={(e) => {
                setWhatIfForm((f) => ({ ...f, shift: e.target.value }));
                setWhatIfResult(null);
              }}
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {(shiftTypes.length ? shiftTypes : ["Day", "Evening", "Night"]).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Staff to add</label>
            <input
              type="number"
              min={1}
              max={20}
              value={whatIfForm.count}
              onChange={(e) => {
                setWhatIfForm((f) => ({ ...f, count: parseInt(e.target.value) || 1 }));
                setWhatIfResult(null);
              }}
              className="mt-1 block w-20 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={runWhatIf}
            disabled={loadingWhatIf || !whatIfForm.departmentId}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loadingWhatIf ? "Calculating…" : "Run scenario"}
          </button>
        </div>

        {whatIfResult && (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Hospital coverage</p>
                <p className="mt-1 text-2xl font-semibold text-slate-800">
                  {whatIfResult.currentCoverage}%
                  <span className="mx-2 text-lg font-normal text-slate-400">→</span>
                  <span className={whatIfResult.projectedCoverage >= whatIfResult.currentCoverage ? "text-emerald-700" : "text-slate-800"}>
                    {whatIfResult.projectedCoverage}%
                  </span>
                </p>
                {whatIfResult.coverageDelta !== 0 && (
                  <p className={`mt-1 text-xs font-medium ${whatIfResult.coverageDelta > 0 ? "text-emerald-700" : "text-amber-700"}`}>
                    {whatIfResult.coverageDelta > 0 ? "+" : ""}
                    {whatIfResult.coverageDelta}% vs selected day&apos;s plan
                  </p>
                )}
                <div className="mt-3 space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Before</span>
                    <span>{whatIfResult.currentScheduled} assigned</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-400"
                      style={{ width: `${Math.min(100, whatIfResult.currentCoverage)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>After scenario</span>
                    <span>{whatIfResult.projectedScheduled} of {whatIfResult.targetShifts} targets</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${Math.min(100, whatIfResult.projectedCoverage)}%` }}
                    />
                  </div>
                </div>
              </div>

              {primaryWhatIfScenario && (
                <div className="rounded-lg border border-indigo-200 bg-white p-4 sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">Department shift impact</p>
                  <p className="mt-1 font-semibold text-slate-800">
                    {primaryWhatIfScenario.department} · {primaryWhatIfScenario.shift}
                    {primaryWhatIfScenario.surge && (
                      <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                        Surge forecast
                      </span>
                    )}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-slate-500">Target (forecast-adjusted)</p>
                      <p className="text-lg font-semibold text-slate-800">{primaryWhatIfScenario.requiredMin ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Filled before → after</p>
                      <p className="text-lg font-semibold text-slate-800">
                        {primaryWhatIfScenario.filledBefore ?? "—"}
                        <span className="mx-1 text-slate-400">→</span>
                        {primaryWhatIfScenario.filledAfter ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Gap remaining</p>
                      <p className={`text-lg font-semibold ${(primaryWhatIfScenario.gapAfter ?? 0) === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                        {(primaryWhatIfScenario.gapAfter ?? 0) === 0 ? "Closed" : primaryWhatIfScenario.gapAfter}
                      </p>
                    </div>
                  </div>
                  {(primaryWhatIfScenario.predictedLoad != null || primaryWhatIfScenario.forecastReason) && (
                    <p className="mt-2 text-xs text-slate-500">
                      {primaryWhatIfScenario.predictedLoad != null && (
                        <>Predicted load: {primaryWhatIfScenario.predictedLoad}%</>
                      )}
                      {primaryWhatIfScenario.forecastReason && (
                        <> · {primaryWhatIfScenario.forecastReason}</>
                      )}
                    </p>
                  )}
                  {primaryWhatIfScenario.closesGap && (
                    <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
                      <TrendingUp className="h-3.5 w-3.5" /> This scenario closes the shift gap
                    </p>
                  )}
                  {primaryWhatIfScenario.meetsTarget === false && (primaryWhatIfScenario.gapAfter ?? 0) > 0 && (
                    <p className="mt-2 text-xs text-amber-800">
                      Still short by {primaryWhatIfScenario.gapAfter} — try increasing count or use Auto-fill below.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-indigo-200 bg-white p-4 text-sm">
              <p className="font-medium text-indigo-900">{whatIfResult.message}</p>
              {whatIfResult.recommendation && (
                <p className="mt-2 text-slate-700">{whatIfResult.recommendation}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {conflicts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="mb-2 font-semibold text-amber-800">Schedule Conflict Detection</h3>
          <ul className="space-y-1 text-sm text-amber-700">
            {conflicts.map((c, i) => (
              <li key={i}>
                <span className="font-medium">{c.staff}</span> ({c.type}): {c.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(summary.openShiftSlots?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-slate-800">Open shift slots by department</h3>
              <p className="text-sm text-slate-600">
                Each department needs staff per shift type (Day, Evening, Night) from Configuration.
                Click a slot to assign someone from that department.
              </p>
            </div>
            <button
              onClick={runAutoSchedule}
              disabled={autoScheduling}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {autoScheduling ? "Scheduling…" : "Auto-fill with AI"}
            </button>
            <button
              onClick={openCreateShift}
              className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-100"
            >
              <Plus className="h-4 w-4" /> Fill a slot
            </button>
          </div>
          <div className="space-y-4">
            {Object.entries(openSlotsByDepartment).map(([department, deptSlots]) => (
              <div key={department}>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  {department}
                  {deptSlots.some((s) => s.surge) && (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                      Surge target
                    </span>
                  )}
                </h4>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {deptSlots.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => openShiftSlot(slot)}
                      className="flex flex-col gap-1 rounded-lg border border-emerald-200 bg-white p-3 text-left text-sm hover:border-teal-300 hover:bg-teal-50"
                    >
                      <div className="flex items-center justify-between">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${shiftBadgeClass(slot.shift)}`}>
                          {slot.shift}
                        </span>
                        <span className="text-xs font-medium text-emerald-700">Unfilled →</span>
                      </div>
                      {slot.surge && slot.forecastReason && (
                        <span className="text-xs text-violet-600">{slot.forecastReason}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {staffFilterId && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>
              Showing shifts for{" "}
              <span className="font-semibold">
                {staffFilterName || staff.find((s) => s.id === staffFilterId)?.name || "selected staff"}
              </span>
              . Change the date above to review other days this week — wellness overtime is based on the last 7 days of scheduled shifts.
            </p>
            <Link
              href="/scheduling"
              className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
            >
              Clear staff filter
            </Link>
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-800">
            Schedule for{" "}
            {new Date(scheduleDate + "T12:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              onClick={runAutoSchedule}
              disabled={autoScheduling}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {autoScheduling ? "Scheduling…" : "Auto-schedule with AI"}
            </button>
            <button
              onClick={openCreateShift}
              className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-100"
            >
              <Plus className="h-4 w-4" /> Add shift
            </button>
            <button
              onClick={async () => {
                setSaveMessage(null);
                try {
                  const res = await apiFetch("/api/schedules/publish", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ date: scheduleDate }),
                  });
                  if (!res.ok) {
                    notify("error", await parseApiError(res, "Publish failed"));
                    return;
                  }
                  const data = await res.json();
                  await loadData(scheduleDate);
                  notify("success", data.message || "Schedule published.");
                } catch {
                  notify("error", "Publish failed");
                }
              }}
              className="rounded-lg bg-teal-500 px-3 py-2 text-sm font-medium text-white hover:bg-teal-600"
            >
              Publish & notify
            </button>
          </div>
        </div>

        {showShiftForm && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h4 className="mb-3 text-sm font-semibold text-slate-700">
              {editingShiftId && slots.find((s) => s.id === editingShiftId)?.needsAssignment
                ? "Assign replacement"
                : editingShiftId
                ? "Edit shift"
                : "New shift assignment"}
            </h4>
            <div className="grid gap-3 sm:grid-cols-3">
              {shiftForm.departmentId && (
                <p className="sm:col-span-3 text-xs text-slate-600">
                  Assigning staff from:{" "}
                  <strong>
                    {summary.openShiftSlots.find((s) => s.departmentId === shiftForm.departmentId)?.department ||
                      slots.find((s) => s.departmentId === shiftForm.departmentId)?.dept ||
                      "selected department"}
                  </strong>
                </p>
              )}
              <SearchableSelect
                inline
                value={shiftForm.staffId}
                loadOptions={loadShiftStaffOptions}
                pageSize={10}
                onChange={(staffId) => setShiftForm((f) => ({ ...f, staffId }))}
                placeholder="Select staff"
              />
              <select
                value={shiftForm.shift}
                onChange={(e) => setShiftForm((f) => ({ ...f, shift: e.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {(shiftTypes.length ? shiftTypes : ["Day", "Evening", "Night"]).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={shiftForm.date}
                onChange={(e) => setShiftForm((f) => ({ ...f, date: e.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            {(assigneeSuggestions.length > 0 || loadingSuggestions) && (
              <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
                <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-indigo-800">
                  <Sparkles className="h-3 w-3" /> AI-suggested assignees
                </p>
                {loadingSuggestions ? (
                  <p className="text-xs text-slate-500">Ranking staff by department, preferences, wellness, and rest rules…</p>
                ) : (
                  <div className="space-y-2">
                    {assigneeSuggestions.map((s) => (
                      <button
                        key={s.staffId}
                        type="button"
                        onClick={() => setShiftForm((f) => ({ ...f, staffId: s.staffId }))}
                        className={`flex w-full items-start justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                          shiftForm.staffId === s.staffId
                            ? "border-indigo-400 bg-white"
                            : "border-slate-200 bg-white hover:border-indigo-200"
                        }`}
                      >
                        <div>
                          <span className="font-medium text-slate-800">{s.name}</span>
                          {s.role && <span className="ml-2 text-xs text-slate-500">{s.role}</span>}
                          {s.aiRanked && (
                            <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">
                              AI ranked
                            </span>
                          )}
                          <p className="text-xs text-slate-500">{s.reasons?.slice(0, 2).join(" • ")}</p>
                          {s.certifications && s.certifications.length > 0 && (
                            <p className="text-xs text-emerald-700">Certs: {s.certifications.join(", ")}</p>
                          )}
                          {s.skillGaps && s.skillGaps.length > 0 && (
                            <p className="text-xs text-amber-700">Missing: {s.skillGaps.join(", ")}</p>
                          )}
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            s.recommended ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {s.score}%
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button
                onClick={saveShift}
                disabled={busy === "shift-save"}
                className="rounded-lg bg-teal-500 px-3 py-1.5 text-sm text-white hover:bg-teal-600 disabled:opacity-50"
              >
                {busy === "shift-save" ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setShowShiftForm(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="pb-3 text-left text-sm font-medium text-slate-600">Staff</th>
                <th className="pb-3 text-left text-sm font-medium text-slate-600">Role</th>
                <th className="pb-3 text-left text-sm font-medium text-slate-600">Shift</th>
                <th className="pb-3 text-left text-sm font-medium text-slate-600">Department</th>
                <th className="pb-3 text-left text-sm font-medium text-slate-600">Status</th>
                <th className="pb-3 text-left text-sm font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {slotsPagination.totalItems === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-slate-500">
                    {staffFilterId
                      ? "No shifts for this staff member on this date. Try another day in the date picker."
                      : 'No shifts scheduled for this date. Click "Add shift" to create one.'}
                  </td>
                </tr>
              ) : (
                slotsPagination.paginatedItems.map((slot) => (
                  <tr
                    key={slot.id}
                    className={`border-b border-slate-100 ${slot.needsAssignment ? "bg-sky-50/60" : ""}`}
                  >
                    <td className="py-3 font-medium text-slate-800">
                      {slot.needsAssignment ? (
                        <span className="italic text-sky-700">Unfilled — assign replacement</span>
                      ) : (
                        slot.staff
                      )}
                    </td>
                    <td className="py-3 text-slate-600">{slot.needsAssignment ? "—" : slot.role}</td>
                    <td className="py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${shiftBadgeClass(slot.shift)}`}>
                        {slot.shift}
                      </span>
                    </td>
                    <td className="py-3 text-slate-600">
                      {slot.needsAssignment ? (slot.dept || "—") : slot.dept}
                    </td>
                    <td className="py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(slot.status || "scheduled")}`}>
                        {slot.swapRequested ? "swap pending" : slot.status || "scheduled"}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {slot.needsAssignment ? (
                          <>
                            <button
                              onClick={() => openAssignShift(slot)}
                              className="rounded bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-700"
                            >
                              Assign staff
                            </button>
                            {swapPartners[slot.id] === undefined && (
                              <button
                                type="button"
                                onClick={() => loadSwapPartners(slot.id)}
                                disabled={loadingSwapFor === slot.id}
                                className="inline-flex items-center gap-0.5 rounded px-2 py-1 text-xs text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50 disabled:opacity-50"
                              >
                                <Sparkles className="h-3 w-3" />
                                {loadingSwapFor === slot.id ? "Loading…" : "Suggest"}
                              </button>
                            )}
                            {(swapPartners[slot.id]?.length ?? 0) > 0 && (
                              <div className="w-full basis-full mt-1 rounded border border-indigo-100 bg-indigo-50/50 p-2">
                                <p className="mb-1 text-xs font-medium text-indigo-800">
                                  <Sparkles className="inline h-3 w-3" /> Suggested replacements
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {swapPartners[slot.id].map((p) => (
                                    <button
                                      key={p.staffId}
                                      type="button"
                                      onClick={() => assignSwapPartner(slot.id, p.staffId)}
                                      disabled={busy === `assign-${slot.id}`}
                                      className="rounded bg-white px-2 py-1 text-xs text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100 disabled:opacity-50"
                                      title={p.reasons?.join(", ")}
                                    >
                                      {p.name} ({p.score}%)
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        ) : slot.swapRequested ? (
                          <>
                            <button
                              onClick={() => handleResolveSwap(slot.id, "approve")}
                              disabled={!!busy}
                              className="inline-flex items-center gap-0.5 text-xs text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                            >
                              <Check className="h-3 w-3" /> Approve (vacate)
                            </button>
                            <button
                              onClick={() => handleResolveSwap(slot.id, "reject")}
                              disabled={!!busy}
                              className="inline-flex items-center gap-0.5 text-xs text-rose-600 hover:text-rose-700 disabled:opacity-50"
                            >
                              <X className="h-3 w-3" /> Reject
                            </button>
                            {swapPartners[slot.id] === undefined && (
                              <button
                                type="button"
                                onClick={() => loadSwapPartners(slot.id)}
                                disabled={loadingSwapFor === slot.id}
                                className="inline-flex items-center gap-0.5 rounded px-2 py-1 text-xs text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50 disabled:opacity-50"
                              >
                                <Sparkles className="h-3 w-3" />
                                {loadingSwapFor === slot.id ? "Loading…" : "Suggest partners"}
                              </button>
                            )}
                            {(swapPartners[slot.id]?.length ?? 0) > 0 && (
                              <div className="w-full basis-full mt-1 rounded border border-indigo-100 bg-indigo-50/50 p-2">
                                <p className="mb-1 text-xs font-medium text-indigo-800">
                                  <Sparkles className="inline h-3 w-3" /> Suggested swap partners
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {swapPartners[slot.id].map((p) => (
                                    <button
                                      key={p.staffId}
                                      type="button"
                                      onClick={() => assignSwapPartner(slot.id, p.staffId)}
                                      disabled={busy === `assign-${slot.id}`}
                                      className="rounded bg-white px-2 py-1 text-xs text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100 disabled:opacity-50"
                                      title={p.reasons?.join(", ")}
                                    >
                                      {p.name} ({p.score}%)
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        ) : slot.canSwap ? (
                          <button
                            onClick={() => handleSwap(slot.id)}
                            disabled={!!swapping}
                            className="text-sm text-teal-600 hover:text-teal-700 disabled:opacity-50"
                          >
                            {swapping === slot.id ? "Requesting…" : "Request swap"}
                          </button>
                        ) : null}
                        <button
                          onClick={() => openEditShift(slot)}
                          className="text-slate-400 hover:text-teal-600"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteShift(slot.id)}
                          disabled={busy === `delete-shift-${slot.id}`}
                          className="text-slate-400 hover:text-rose-600 disabled:opacity-50"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          className="mt-4"
          page={slotsPagination.page}
          pageSize={slotsPagination.pageSize}
          totalItems={slotsPagination.totalItems}
          totalPages={slotsPagination.totalPages}
          onPageChange={slotsPagination.setPage}
          onPageSizeChange={slotsPagination.setPageSize}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-semibold text-slate-800">Staff Allocation Recommendations</h3>
          <div className="space-y-3">
            {summary.recommendations.length === 0 ? (
              <p className="text-sm text-slate-500">No allocation recommendations for this date.</p>
            ) : (
              summary.recommendations.map((rec, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                  <div>
                    <p className="flex items-center gap-1 font-medium text-slate-800">
                      {rec.ai && <Sparkles className="h-3 w-3 text-violet-600" />}
                      {rec.department}
                    </p>
                    <p className="text-sm text-slate-500">
                      {rec.detail || `Recommended action: ${rec.action}`}
                    </p>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      rec.priority === "high" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {rec.action}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 font-semibold text-slate-800">
              <Heart className="h-5 w-5" /> Staff Preference Management
            </h3>
            <ListSearchBar value={prefSearch} onChange={setPrefSearch} placeholder="Search staff, shifts, dates…" className="sm:max-w-xs" />
          </div>
          <div className="space-y-2">
            {preferencesPagination.totalItems === 0 ? (
              <p className="text-sm text-slate-500">
                No preferences loaded. Staff can set preferred shifts and avoid dates.
              </p>
            ) : (
              preferencesPagination.paginatedItems.map((p) => (
                <div key={p.staffId} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">{p.staffName}</span>
                    {manageSettings &&
                      (editingPref === p.staffId ? (
                        <button onClick={() => setEditingPref(null)} className="text-xs text-slate-500">
                          Cancel
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingPref(p.staffId);
                            setPrefForm({
                              preferredShifts: p.preferredShifts,
                              avoidDates: (p.avoidDates || []).join(", "),
                            });
                          }}
                          className="text-xs text-teal-600 hover:text-teal-700"
                        >
                          Edit
                        </button>
                      ))}
                  </div>
                  {editingPref === p.staffId && manageSettings ? (
                    <div className="mt-2 space-y-2">
                      <div>
                        <label className="text-xs text-slate-500">Preferred shifts</label>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {(shiftTypes.length ? shiftTypes : ["Day", "Evening", "Night"]).map((s) => (
                            <label key={s} className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={prefForm.preferredShifts.includes(s)}
                                onChange={(e) =>
                                  setPrefForm((f) => ({
                                    ...f,
                                    preferredShifts: e.target.checked
                                      ? [...f.preferredShifts, s]
                                      : f.preferredShifts.filter((x) => x !== s),
                                  }))
                                }
                                className="rounded"
                              />
                              <span className="text-sm">{s}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Avoid dates (comma-separated)</label>
                        <input
                          type="text"
                          value={prefForm.avoidDates}
                          onChange={(e) => setPrefForm((f) => ({ ...f, avoidDates: e.target.value }))}
                          placeholder="2025-03-15, 2025-03-20"
                          className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                        />
                      </div>
                      <button
                        onClick={async () => {
                          setSaveMessage(null);
                          const res = await apiFetch("/api/scheduling/preferences", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              staffId: p.staffId,
                              preferredShifts: prefForm.preferredShifts,
                              avoidDates: prefForm.avoidDates.split(",").map((d) => d.trim()).filter(Boolean),
                            }),
                          });
                          if (!res.ok) {
                            notify("error", await parseApiError(res, "Failed to save preferences"));
                            return;
                          }
                          const avoidDates = prefForm.avoidDates.split(",").map((d) => d.trim()).filter(Boolean);
                          setPreferences((prev) =>
                            prev.map((x) =>
                              x.staffId === p.staffId
                                ? { ...x, preferredShifts: prefForm.preferredShifts, avoidDates }
                                : x
                            )
                          );
                          setEditingPref(null);
                          notify("success", `Preferences saved for ${p.staffName}`);
                        }}
                        className="rounded bg-teal-500 px-2 py-1 text-xs text-white hover:bg-teal-600"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-slate-500">
                      Prefers: {p.preferredShifts?.join(", ") || "—"} • Avoid:{" "}
                      {p.avoidDates?.length ? p.avoidDates.join(", ") : "None"}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
          <Pagination
            className="mt-4"
            page={preferencesPagination.page}
            pageSize={preferencesPagination.pageSize}
            totalItems={preferencesPagination.totalItems}
            totalPages={preferencesPagination.totalPages}
            onPageChange={preferencesPagination.setPage}
            onPageSizeChange={preferencesPagination.setPageSize}
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h3 className="mb-4 font-semibold text-slate-800">Scheduling Constraint Configurator</h3>
          <div className="space-y-3 text-sm">
            {constraintsLoading ? (
              <p className="text-slate-500">Loading constraints from Configuration…</p>
            ) : !constraints ? (
              <p className="text-rose-600">Could not load scheduling constraints.</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span>Max hours per week</span>
                  <input
                    type="number"
                    value={constraints.maxHoursPerWeek}
                    onChange={(e) =>
                      setConstraints((c) =>
                        c ? { ...c, maxHoursPerWeek: parseInt(e.target.value) || c.maxHoursPerWeek } : c
                      )
                    }
                    disabled={!manageSettings}
                    className="w-20 rounded border border-slate-200 px-2 py-1 text-right disabled:bg-slate-50"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span>Rest between shifts (hrs)</span>
                  <input
                    type="number"
                    value={constraints.restBetweenShifts}
                    onChange={(e) =>
                      setConstraints((c) =>
                        c ? { ...c, restBetweenShifts: parseInt(e.target.value) || c.restBetweenShifts } : c
                      )
                    }
                    disabled={!manageSettings}
                    className="w-20 rounded border border-slate-200 px-2 py-1 text-right disabled:bg-slate-50"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={constraints.respectPreferences}
                    onChange={(e) =>
                      setConstraints((c) => (c ? { ...c, respectPreferences: e.target.checked } : c))
                    }
                    disabled={!manageSettings}
                    className="rounded"
                  />
                  <span>Respect staff preferences</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={constraints.skillMixRequired}
                    onChange={(e) =>
                      setConstraints((c) => (c ? { ...c, skillMixRequired: e.target.checked } : c))
                    }
                    disabled={!manageSettings}
                    className="rounded"
                  />
                  <span>Skill mix requirements</span>
                </div>
              </>
            )}
            {manageSettings ? (
              <button
                onClick={async () => {
                  if (!constraints) return;
                  setSavingConstraints(true);
                  setSaveMessage(null);
                  const payload = writableSettingsPayload("scheduling", constraints as Record<string, unknown>);
                  try {
                    const res = await apiFetch("/api/scheduling/constraints", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload),
                    });
                    if (!res.ok) {
                      notify("error", await parseApiError(res, "Failed to save constraints"));
                      return;
                    }
                    const data = await res.json();
                    if (data.constraints) setConstraints(data.constraints);
                    notify("success", "Scheduling constraints saved to Configuration");
                  } catch {
                    notify("error", "Failed to save constraints — check that the backend is running");
                  } finally {
                    setSavingConstraints(false);
                  }
                }}
                disabled={!constraints || savingConstraints}
                className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-600 disabled:opacity-50"
              >
                {savingConstraints ? "Saving…" : "Save constraints"}
              </button>
            ) : (
              <p className="text-xs text-slate-500">Settings permission required to edit constraints.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                <CalendarOff className="h-5 w-5" /> Leave requests
              </h3>
              <button
                onClick={openCreateLeave}
                className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-100"
              >
                <Plus className="h-3 w-3" /> Request leave
              </button>
            </div>
            <ListSearchBar value={leaveSearch} onChange={setLeaveSearch} placeholder="Search staff, type, dates, status…" className="sm:max-w-xs" />
          </div>

          {showLeaveForm && (
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h4 className="mb-2 text-xs font-semibold text-slate-700">
                {editingLeaveId ? "Edit leave" : "New leave request"}
              </h4>
              <div className="grid gap-2 sm:grid-cols-2">
                <SearchableSelect
                  inline
                  value={leaveForm.staffId}
                  loadOptions={loadAllStaffOptions}
                  pageSize={10}
                  onChange={(staffId) => setLeaveForm((f) => ({ ...f, staffId }))}
                  placeholder="Select staff"
                />
                <select
                  value={leaveForm.type}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, type: e.target.value }))}
                  className="rounded border border-slate-200 px-2 py-1.5 text-sm"
                >
                  {LEAVE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={leaveForm.startDate}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="rounded border border-slate-200 px-2 py-1.5 text-sm"
                />
                <input
                  type="date"
                  value={leaveForm.endDate}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="rounded border border-slate-200 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={saveLeave}
                  disabled={busy === "leave-save"}
                  className="rounded bg-teal-500 px-2 py-1 text-xs text-white hover:bg-teal-600 disabled:opacity-50"
                >
                  {busy === "leave-save" ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setShowLeaveForm(false)}
                  className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {leavePagination.totalItems === 0 ? (
              <p className="text-sm text-slate-500">No leave requests</p>
            ) : (
              leavePagination.paginatedItems.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-2 text-sm">
                  <div>
                    <span className="font-medium">{l.staff?.name}</span>
                    <span className="text-slate-500">
                      {" "}
                      • {l.type} • {l.startDate} – {l.endDate}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        l.status === "approved"
                          ? "bg-emerald-100 text-emerald-700"
                          : l.status === "rejected"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {l.status}
                    </span>
                    {l.status === "pending" && (
                      <>
                        <button
                          onClick={() => updateLeaveStatus(l.id, "approved")}
                          disabled={!!busy}
                          className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                          title="Approve"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => updateLeaveStatus(l.id, "rejected")}
                          disabled={!!busy}
                          className="text-rose-600 hover:text-rose-700 disabled:opacity-50"
                          title="Reject"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    <button onClick={() => openEditLeave(l)} className="text-slate-400 hover:text-teal-600" title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteLeave(l.id)}
                      disabled={busy === `delete-leave-${l.id}`}
                      className="text-slate-400 hover:text-rose-600 disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <Pagination
            className="mt-4"
            page={leavePagination.page}
            pageSize={leavePagination.pageSize}
            totalItems={leavePagination.totalItems}
            totalPages={leavePagination.totalPages}
            onPageChange={leavePagination.setPage}
            onPageSizeChange={leavePagination.setPageSize}
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                <Clock className="h-5 w-5" /> On-call schedule
              </h3>
              <button
                onClick={openCreateOnCall}
                className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-100"
              >
                <Plus className="h-3 w-3" /> Assign on-call
              </button>
            </div>
            <ListSearchBar value={onCallSearch} onChange={setOnCallSearch} placeholder="Search staff, time, status…" className="sm:max-w-xs" />
          </div>

          {showOnCallForm && (
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h4 className="mb-2 text-xs font-semibold text-slate-700">
                {editingOnCallId ? "Edit on-call" : "New on-call assignment"}
              </h4>
              <div className="grid gap-2 sm:grid-cols-2">
                <SearchableSelect
                  inline
                  value={onCallForm.staffId}
                  loadOptions={loadAllStaffOptions}
                  pageSize={10}
                  onChange={(staffId) => setOnCallForm((f) => ({ ...f, staffId }))}
                  placeholder="Select staff"
                />
                <input
                  type="date"
                  value={onCallForm.date}
                  onChange={(e) => setOnCallForm((f) => ({ ...f, date: e.target.value }))}
                  className="rounded border border-slate-200 px-2 py-1.5 text-sm"
                />
                <input
                  type="time"
                  value={onCallForm.startTime}
                  onChange={(e) => setOnCallForm((f) => ({ ...f, startTime: e.target.value }))}
                  className="rounded border border-slate-200 px-2 py-1.5 text-sm"
                />
                <input
                  type="time"
                  value={onCallForm.endTime}
                  onChange={(e) => setOnCallForm((f) => ({ ...f, endTime: e.target.value }))}
                  className="rounded border border-slate-200 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={saveOnCall}
                  disabled={busy === "oncall-save"}
                  className="rounded bg-teal-500 px-2 py-1 text-xs text-white hover:bg-teal-600 disabled:opacity-50"
                >
                  {busy === "oncall-save" ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setShowOnCallForm(false)}
                  className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {onCallPagination.totalItems === 0 ? (
              <p className="text-sm text-slate-500">No on-call assignments for this date</p>
            ) : (
              onCallPagination.paginatedItems.map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-2 text-sm">
                  <span className="font-medium">{o.staff?.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">
                      {o.startTime} – {o.endTime}
                    </span>
                    <button onClick={() => openEditOnCall(o)} className="text-slate-400 hover:text-teal-600" title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteOnCall(o.id)}
                      disabled={busy === `delete-oncall-${o.id}`}
                      className="text-slate-400 hover:text-rose-600 disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <Pagination
            className="mt-4"
            page={onCallPagination.page}
            pageSize={onCallPagination.pageSize}
            totalItems={onCallPagination.totalItems}
            totalPages={onCallPagination.totalPages}
            onPageChange={onCallPagination.setPage}
            onPageSizeChange={onCallPagination.setPageSize}
          />
        </div>
      </div>
    </div>
  );
}
