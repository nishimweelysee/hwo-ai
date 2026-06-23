import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  RefreshControl,
  Pressable,
  Alert,
} from "react-native";
import * as Network from "expo-network";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth";
import { apiRequest } from "../../lib/api";
import { getPendingCount, submitSwapOrQueue } from "../../lib/offline-queue";
import { colors, shiftColor, spacing } from "../../lib/theme";
import {
  addDays,
  formatShortDate,
  formatWeekday,
  isToday,
  todayIso,
} from "../../lib/format";
import { Banner, EmptyState, ScreenContainer } from "../../components/ui";

const SCHEDULE_CACHE_KEY = "hwo_schedule_cache_v2";

interface ScheduleItem {
  id: string;
  isoDate: string;
  dateLabel: string;
  weekday: string;
  shift: string;
  status: "scheduled" | "off";
  department?: string;
}

interface SchedulesResponse {
  schedules?: {
    date: string;
    shifts: { id: string; shift: string; department?: string }[];
  }[];
  guest?: boolean;
}

type Section = { title: string; subtitle: string; isToday: boolean; data: ScheduleItem[] };

export default function ScheduleScreen() {
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const [startDate, setStartDate] = useState(todayIso());
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [guest, setGuest] = useState(false);
  const [pending, setPending] = useState(0);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    setPending(await getPendingCount());

    const { isConnected } = await Network.getNetworkStateAsync();
    setOffline(!isConnected);

    if (!isConnected) {
      try {
        const cached = await AsyncStorage.getItem(SCHEDULE_CACHE_KEY);
        if (cached) setSchedules(JSON.parse(cached) as ScheduleItem[]);
        else setSchedules([]);
      } catch {
        setSchedules([]);
      }
      setLoading(false);
      return;
    }

    try {
      const data = await apiRequest<SchedulesResponse>(
        `/api/mobile/schedules?date=${startDate}&days=7`,
        { auth: signedIn }
      );
      setGuest(Boolean(data.guest) || !signedIn);
      const mapped: ScheduleItem[] = [];
      for (const day of data.schedules || []) {
        if (day.shifts.length) {
          for (const s of day.shifts) {
            mapped.push({
              id: s.id,
              isoDate: day.date,
              dateLabel: formatShortDate(day.date),
              weekday: formatWeekday(day.date),
              shift: s.shift || "—",
              status: "scheduled",
              department: s.department,
            });
          }
        } else {
          mapped.push({
            id: `off-${day.date}`,
            isoDate: day.date,
            dateLabel: formatShortDate(day.date),
            weekday: formatWeekday(day.date),
            shift: "Off",
            status: "off",
          });
        }
      }
      setSchedules(mapped);
      if (signedIn && mapped.length) {
        await AsyncStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify(mapped));
      }
    } catch {
      setOffline(true);
      try {
        const cached = await AsyncStorage.getItem(SCHEDULE_CACHE_KEY);
        setSchedules(cached ? (JSON.parse(cached) as ScheduleItem[]) : []);
      } catch {
        setSchedules([]);
      }
    }
    setLoading(false);
  }, [signedIn, startDate]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const sections: Section[] = useMemo(() => {
    const byDate = new Map<string, ScheduleItem[]>();
    for (const item of schedules) {
      const list = byDate.get(item.isoDate) || [];
      list.push(item);
      byDate.set(item.isoDate, list);
    }
    return Array.from(byDate.entries()).map(([iso, data]) => ({
      title: isToday(iso) ? "Today" : data[0]?.weekday || "",
      subtitle: data[0]?.dateLabel || formatShortDate(iso),
      isToday: isToday(iso),
      data,
    }));
  }, [schedules]);

  const weekLabel = useMemo(() => {
    const end = addDays(startDate, 6);
    return `${formatShortDate(startDate)} – ${formatShortDate(end)}`;
  }, [startDate]);

  const requestSwap = (item: ScheduleItem) => {
    Alert.alert(
      "Request shift swap",
      `Request a swap for ${item.shift} on ${item.dateLabel}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Request",
          onPress: async () => {
            if (!signedIn) {
              Alert.alert("Sign in required", "Please sign in to request shift swaps.", [
                { text: "Cancel", style: "cancel" },
                { text: "Sign In", onPress: () => router.push("/login") },
              ]);
              return;
            }
            const { isConnected } = await Network.getNetworkStateAsync();
            try {
              const result = await submitSwapOrQueue(
                { scheduleId: item.id },
                Boolean(isConnected)
              );
              Alert.alert(
                result === "queued" ? "Saved offline" : "Submitted",
                result === "queued"
                  ? "Swap request will sync when you're back online."
                  : "Your swap request was submitted."
              );
              fetchSchedules();
            } catch (err) {
              Alert.alert(
                "Error",
                err instanceof Error ? err.message : "Could not submit swap request"
              );
            }
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer>
      {pending > 0 && (
        <Banner
          tone="warning"
          message={`${pending} pending sync item${pending === 1 ? "" : "s"}`}
        />
      )}
      {offline && (
        <Banner tone="warning" message="Offline — showing cached schedule if available" />
      )}
      {guest && !offline && (
        <Banner
          tone="info"
          message="Guest mode — sign in to see your personal schedule"
          actionLabel="Sign In"
          onAction={() => router.push("/login")}
        />
      )}

      <View style={styles.weekNav}>
        <Pressable
          style={styles.navBtn}
          onPress={() => setStartDate((d) => addDays(d, -7))}
        >
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </Pressable>
        <View style={styles.weekCenter}>
          <Text style={styles.weekLabel}>{weekLabel}</Text>
          <Pressable onPress={() => setStartDate(todayIso())}>
            <Text style={styles.todayLink}>Jump to today</Text>
          </Pressable>
        </View>
        <Pressable
          style={styles.navBtn}
          onPress={() => setStartDate((d) => addDays(d, 7))}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </Pressable>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchSchedules} />
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              title="No shifts"
              message={
                guest
                  ? "Sign in to load your personal schedule."
                  : offline
                    ? "No cached data. Connect to load your schedule."
                    : "No shifts scheduled for this week."
              }
              actionLabel={guest ? "Sign In" : undefined}
              onAction={guest ? () => router.push("/login") : undefined}
            />
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, section.isToday && styles.sectionToday]}>
            <Text style={[styles.sectionTitle, section.isToday && styles.sectionTitleToday]}>
              {section.title}
            </Text>
            <Text style={styles.sectionSub}>{section.subtitle}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const accent =
            item.status === "off" ? colors.off : shiftColor(item.shift);
          return (
            <View style={[styles.card, item.status === "off" && styles.cardOff]}>
              <View style={[styles.accent, { backgroundColor: accent }]} />
              <View style={styles.cardBody}>
                <View style={styles.cardTop}>
                  <Text style={styles.shift}>{item.shift}</Text>
                  {item.status === "scheduled" && (
                    <View style={[styles.shiftPill, { backgroundColor: accent + "22" }]}>
                      <Text style={[styles.shiftPillText, { color: accent }]}>
                        {item.shift.split(" ")[0]}
                      </Text>
                    </View>
                  )}
                </View>
                {item.department ? (
                  <View style={styles.deptRow}>
                    <Ionicons name="business-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.dept}>{item.department}</Text>
                  </View>
                ) : null}
                {item.status === "scheduled" && signedIn ? (
                  <Pressable style={styles.swapBtn} onPress={() => requestSwap(item)}>
                    <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
                    <Text style={styles.swapText}>Request swap</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        }}
        contentContainerStyle={sections.length === 0 ? styles.emptyList : undefined}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  weekCenter: { flex: 1, alignItems: "center" },
  weekLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  todayLink: { fontSize: 12, color: colors.primary, fontWeight: "600", marginTop: 2 },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  sectionToday: { backgroundColor: colors.primaryLight },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  sectionTitleToday: { color: colors.primaryDark },
  sectionSub: { fontSize: 12, color: colors.textLight },
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardOff: { opacity: 0.75 },
  accent: { width: 4 },
  cardBody: { flex: 1, padding: spacing.md },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shift: { fontSize: 16, fontWeight: "700", color: colors.text },
  shiftPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
  },
  shiftPillText: { fontSize: 11, fontWeight: "700" },
  deptRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  dept: { fontSize: 13, color: colors.textMuted },
  swapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
  },
  swapText: { fontSize: 12, fontWeight: "600", color: colors.primary },
  emptyList: { flexGrow: 1 },
});
