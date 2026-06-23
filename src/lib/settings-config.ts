/** Keys persisted per settings section — must match backend defaultSections writable fields. */
export const WRITABLE_SETTING_KEYS: Record<string, string[]> = {
  organization: ["name", "timezone", "fiscalYearStart", "locale"],
  scheduling: [
    "maxHoursPerWeek",
    "restBetweenShifts",
    "respectPreferences",
    "skillMixRequired",
    "targetShiftsPerDay",
    "minStaffPerShift",
    "shiftTypes",
    "departmentSkillRequirements",
    "shiftSkillRequirements",
  ],
  workload: [
    "nursePatientRatioTarget",
    "alertThreshold",
    "overtimeWarningHours",
    "peakHourStart",
    "peakHourEnd",
  ],
  inventory: [
    "criticalUtilizationPercent",
    "defaultReorderLevel",
    "autoProcurementEnabled",
    "lowStockNotifications",
    "procurementLeadTimeDays",
    "bedKpiTypes",
    "bedKpiSkuPrefixes",
    "bedKpiNameKeywords",
  ],
  skills: ["expiryWarningDays", "autoTrainingAlerts", "certCatalog", "trainingPrograms"],
  wellness: ["interventionTypes", "surveyQuestions", "shiftHours"],
  ai: ["forecastHorizonDays", "autoRetrainEnabled", "autoRetrainDayOfWeek", "minTrainingRecords", "modelComplexity"],
  integrations: ["hisUrl", "hrUrl", "syncFrequency", "syncTimeUtc", "hisEnabled", "hrEnabled"],
  notifications: ["emailAlerts", "scheduleChanges", "wellnessAlerts", "complianceReminders"],
  data: ["retentionYears", "anonymization", "backupFrequency", "encryption"],
  userRoles: ["defaultRole", "items"],
  permissions: ["roleMenus", "roleActions"],
};

export function writableSettingsPayload(
  section: string,
  sectionData: Record<string, unknown> | undefined
): Record<string, unknown> {
  const keys = WRITABLE_SETTING_KEYS[section] ?? [];
  const source = sectionData ?? {};
  const payload: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      payload[key] = source[key];
    }
  }
  return payload;
}

export { parseApiError } from "@/lib/api";

export const TIMEZONE_OPTIONS = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "Europe/London",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

export const LOCALE_OPTIONS = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "fr-FR", label: "French" },
  { value: "es-ES", label: "Spanish" },
  { value: "de-DE", label: "German" },
];

export const SYNC_FREQUENCY_OPTIONS = ["hourly", "daily", "weekly"];

export const BACKUP_FREQUENCY_OPTIONS = ["hourly", "daily", "weekly"];

export const RETRAIN_DAY_OPTIONS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
