import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth";
import { apiRequest } from "../../lib/api";
import { getPendingCount } from "../../lib/offline-queue";
import { colors, greetingName, shiftColor, spacing } from "../../lib/theme";
import { formatShortDate, formatWeekday, isToday, todayIso } from "../../lib/format";
import {
  Banner,
  Card,
  EmptyState,
  PrimaryButton,
  RiskBadge,
  ScreenContainer,
  StatPill,
} from "../../components/ui";

type WellnessSummary = {
  score?: number;
  riskLevel?: string;
  overtime?: number;
  alerts?: number;
};

type ScheduleDay = {
  date: string;
  shifts: { id: string; shift: string; department?: string }[];
};

type AlertItem = { id: string; type: string; message: string; severity?: string };

export default function HomeScreen() {
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(0);
  const [wellness, setWellness] = useState<WellnessSummary | null>(null);
  const [upcoming, setUpcoming] = useState<
    { id: string; date: string; shift: string; department?: string }[]
  >([]);
  const [alertCount, setAlertCount] = useState(0);
  const [staffLinked, setStaffLinked] = useState(true);

  const load = useCallback(async () => {
    setPending(await getPendingCount());
    if (!signedIn) {
      setLoading(false);
      return;
    }

    try {
      const [w, s, a] = await Promise.all([
        apiRequest<WellnessSummary>("/api/mobile/wellness"),
        apiRequest<{ schedules?: ScheduleDay[]; guest?: boolean }>(
          `/api/mobile/schedules?date=${todayIso()}&days=14`
        ),
        apiRequest<{ alerts?: AlertItem[] }>("/api/mobile/alerts"),
      ]);

      setStaffLinked(Boolean(user?.staffId));
      setWellness(w);
      setAlertCount(a.alerts?.length ?? 0);

      const items: typeof upcoming = [];
      for (const day of s.schedules || []) {
        for (const shift of day.shifts) {
          items.push({
            id: shift.id,
            date: day.date,
            shift: shift.shift,
            department: shift.department,
          });
        }
      }
      setUpcoming(items.slice(0, 4));
    } catch {
      setWellness(null);
      setUpcoming([]);
    }
    setLoading(false);
  }, [signedIn, user?.staffId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!signedIn) {
    return (
      <ScreenContainer>
        <EmptyState
          title="Welcome to HWO Mobile"
          message="Sign in to see your schedule, wellness score, and personalized alerts."
          actionLabel="Sign In"
          onAction={() => router.push("/login")}
        />
      </ScreenContainer>
    );
  }

  const nextShift = upcoming[0];

  return (
    <ScreenContainer>
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.hero}>
          <Text style={styles.greeting}>{greetingName(user?.name)}</Text>
          <Text style={styles.role}>{user?.role || "Staff"} · HWO Mobile</Text>
          {!staffLinked && (
            <View style={styles.linkWarning}>
              <Ionicons name="warning-outline" size={16} color={colors.warning} />
              <Text style={styles.linkWarningText}>
                Account not linked to workforce profile — schedule and check-ins may be limited.
              </Text>
            </View>
          )}
        </View>

        {pending > 0 && (
          <Banner
            tone="warning"
            message={`${pending} action${pending === 1 ? "" : "s"} waiting to sync when online`}
          />
        )}

        <View style={styles.statsRow}>
          <StatPill
            label="Wellness"
            value={wellness?.score ?? "—"}
            accent={colors.primary}
          />
          <StatPill
            label="Overtime"
            value={`+${wellness?.overtime ?? 0}h`}
            accent={wellness && (wellness.overtime ?? 0) > 8 ? colors.warning : undefined}
          />
          <StatPill label="Alerts" value={alertCount} accent={alertCount > 0 ? colors.error : undefined} />
        </View>

        {wellness?.riskLevel && (
          <Card style={styles.riskCard}>
            <View style={styles.riskRow}>
              <Text style={styles.riskLabel}>Current risk level</Text>
              <RiskBadge risk={wellness.riskLevel} />
            </View>
          </Card>
        )}

        <Text style={styles.sectionLabel}>Quick actions</Text>
        <View style={styles.actionsRow}>
          <Pressable style={styles.actionTile} onPress={() => router.push("/(tabs)/wellness")}>
            <View style={[styles.actionIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="heart-outline" size={22} color={colors.primary} />
            </View>
            <Text style={styles.actionLabel}>Check-in</Text>
          </Pressable>
          <Pressable style={styles.actionTile} onPress={() => router.push("/(tabs)/schedule")}>
            <View style={[styles.actionIcon, { backgroundColor: colors.infoBg }]}>
              <Ionicons name="calendar-outline" size={22} color={colors.info} />
            </View>
            <Text style={styles.actionLabel}>Schedule</Text>
          </Pressable>
          <Pressable style={styles.actionTile} onPress={() => router.push("/(tabs)/alerts")}>
            <View style={[styles.actionIcon, { backgroundColor: colors.warningBg }]}>
              <Ionicons name="notifications-outline" size={22} color={colors.warning} />
            </View>
            <Text style={styles.actionLabel}>Alerts</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>Upcoming shifts</Text>
        {nextShift ? (
          <Card>
            <View style={styles.nextShiftHeader}>
              <View>
                <Text style={styles.nextLabel}>Next shift</Text>
                <Text style={styles.nextShift}>{nextShift.shift}</Text>
                <Text style={styles.nextMeta}>
                  {isToday(nextShift.date) ? "Today" : formatWeekday(nextShift.date)},{" "}
                  {formatShortDate(nextShift.date)}
                  {nextShift.department ? ` · ${nextShift.department}` : ""}
                </Text>
              </View>
              <View
                style={[
                  styles.shiftDot,
                  { backgroundColor: shiftColor(nextShift.shift) },
                ]}
              />
            </View>
            <PrimaryButton
              label="View full schedule"
              variant="secondary"
              onPress={() => router.push("/(tabs)/schedule")}
            />
          </Card>
        ) : (
          <Card>
            <Text style={styles.noShifts}>No upcoming shifts in the next 14 days.</Text>
            <PrimaryButton
              label="Open schedule"
              variant="ghost"
              onPress={() => router.push("/(tabs)/schedule")}
            />
          </Card>
        )}

        {upcoming.length > 1 && (
          <View style={styles.moreShifts}>
            {upcoming.slice(1).map((item) => (
              <View key={item.id} style={styles.miniShift}>
                <View
                  style={[styles.miniDot, { backgroundColor: shiftColor(item.shift) }]}
                />
                <View style={styles.miniBody}>
                  <Text style={styles.miniShiftName}>{item.shift}</Text>
                  <Text style={styles.miniDate}>
                    {formatShortDate(item.date)}
                    {item.department ? ` · ${item.department}` : ""}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl },
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  greeting: { fontSize: 22, fontWeight: "700", color: "#fff" },
  role: { fontSize: 14, color: "rgba(255,255,255,0.85)", marginTop: 4 },
  linkWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: "rgba(255,255,255,0.15)",
    padding: spacing.md,
    borderRadius: 10,
  },
  linkWarningText: { flex: 1, fontSize: 12, color: "#fff", lineHeight: 18 },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: -spacing.xl,
  },
  riskCard: { marginTop: spacing.sm },
  riskRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  riskLabel: { fontSize: 14, color: colors.textMuted, fontWeight: "500" },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  actionsRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  actionTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    alignItems: "center",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  actionLabel: { fontSize: 12, fontWeight: "600", color: colors.text },
  nextShiftHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  nextLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  nextShift: { fontSize: 22, fontWeight: "700", color: colors.text, marginTop: 2 },
  nextMeta: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  shiftDot: { width: 12, height: 12, borderRadius: 6, marginTop: 8 },
  noShifts: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.sm },
  moreShifts: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: "hidden",
  },
  miniShift: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  miniDot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.md },
  miniBody: { flex: 1 },
  miniShiftName: { fontSize: 14, fontWeight: "600", color: colors.text },
  miniDate: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
