/** Deep link to Scheduling with a staff member pre-selected for review. */
export function scheduleStaffPath(staffId: string, staffName?: string, date?: string): string {
  const params = new URLSearchParams({ staffId });
  if (staffName?.trim()) {
    params.set("staffName", staffName.trim());
  }
  if (date?.trim()) {
    params.set("date", date.trim());
  }
  return `/scheduling?${params.toString()}`;
}

export type StaffWeekShift = {
  id: string;
  date: string;
  shift: string;
  dept?: string;
  departmentId?: string;
  status?: string;
  hours: number;
  swapRequested?: boolean;
};

export type StaffWeekShiftsSummary = {
  staffId: string;
  staffName?: string;
  weekStart: string;
  weekEnd: string;
  totalHours: number;
  standardHours: number;
  overtimeHours: number;
  shiftCount: number;
  shifts: StaffWeekShift[];
};
