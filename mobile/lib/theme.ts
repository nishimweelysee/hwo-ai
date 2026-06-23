export const colors = {
  primary: "#0d9488",
  primaryDark: "#0f766e",
  primaryLight: "#ccfbf1",
  background: "#f1f5f9",
  surface: "#ffffff",
  text: "#0f172a",
  textMuted: "#64748b",
  textLight: "#94a3b8",
  border: "#e2e8f0",
  warning: "#f59e0b",
  warningBg: "#fef3c7",
  warningText: "#92400e",
  error: "#dc2626",
  errorBg: "#fef2f2",
  info: "#0369a1",
  infoBg: "#e0f2fe",
  success: "#059669",
  successBg: "#ecfdf5",
  shiftDay: "#f59e0b",
  shiftEvening: "#7c3aed",
  shiftNight: "#3730a3",
  off: "#94a3b8",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
};

export const shadows = {
  card: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
};

export function shiftColor(shift: string): string {
  const s = shift.toLowerCase();
  if (s.includes("night")) return colors.shiftNight;
  if (s.includes("evening")) return colors.shiftEvening;
  if (s.includes("day")) return colors.shiftDay;
  return colors.primary;
}

export function riskColor(risk?: string): { bg: string; text: string } {
  switch (risk?.toLowerCase()) {
    case "high":
      return { bg: colors.errorBg, text: colors.error };
    case "medium":
      return { bg: colors.warningBg, text: colors.warning };
    default:
      return { bg: colors.successBg, text: colors.success };
  }
}

export function greetingName(name?: string): string {
  const hour = new Date().getHours();
  const time =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${time}, ${first}` : time;
}
