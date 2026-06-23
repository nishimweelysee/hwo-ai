import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth";
import { apiRequest } from "../../lib/api";
import { registerPushToken } from "../../lib/push";
import { colors, spacing } from "../../lib/theme";
import { Chip, EmptyState, RiskBadge, ScreenContainer } from "../../components/ui";

interface AlertItem {
  id: string;
  type: string;
  message: string;
  severity?: "high" | "medium" | "low" | string;
}

type Filter = "all" | "wellness" | "schedule";

function alertIcon(type: string): keyof typeof Ionicons.glyphMap {
  return type === "schedule" ? "calendar" : "heart";
}

export default function AlertsScreen() {
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const fetchAlerts = useCallback(async () => {
    if (!signedIn) {
      setAlerts([]);
      setLoading(false);
      return;
    }

    try {
      const json = await apiRequest<{ alerts?: AlertItem[] }>("/api/mobile/alerts");
      setAlerts(json.alerts || []);
    } catch {
      setAlerts([]);
    }
    setLoading(false);
  }, [signedIn]);

  useEffect(() => {
    fetchAlerts();
    if (signedIn) registerPushToken();
  }, [fetchAlerts, signedIn]);

  const filtered = useMemo(() => {
    if (filter === "all") return alerts;
    return alerts.filter((a) => a.type === filter);
  }, [alerts, filter]);

  const counts = useMemo(
    () => ({
      all: alerts.length,
      wellness: alerts.filter((a) => a.type === "wellness").length,
      schedule: alerts.filter((a) => a.type === "schedule").length,
    }),
    [alerts]
  );

  if (!signedIn) {
    return (
      <ScreenContainer>
        <EmptyState
          title="Your alerts"
          message="Sign in to receive personalized workload and schedule notifications."
          actionLabel="Sign In"
          onAction={() => router.push("/login")}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.filters}>
        {(
          [
            { id: "all" as const, label: "All" },
            { id: "wellness" as const, label: "Wellness" },
            { id: "schedule" as const, label: "Schedule" },
          ] as const
        ).map((f) => (
          <Chip
            key={f.id}
            label={`${f.label}${counts[f.id] ? ` (${counts[f.id]})` : ""}`}
            active={filter === f.id}
            onPress={() => setFilter(f.id)}
          />
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={filtered.length === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              title="All clear"
              message={
                filter === "all"
                  ? "No alerts right now. Pull down to refresh."
                  : `No ${filter} alerts at the moment.`
              }
            />
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchAlerts} />
        }
        renderItem={({ item }) => {
          const severity = item.severity?.toLowerCase();
          const borderColor =
            severity === "high"
              ? colors.error
              : severity === "medium"
                ? colors.warning
                : colors.primary;
          const iconColor =
            item.type === "schedule" ? colors.info : colors.primary;

          return (
            <View style={[styles.card, { borderLeftColor: borderColor }]}>
              <View style={[styles.iconWrap, { backgroundColor: iconColor + "18" }]}>
                <Ionicons name={alertIcon(item.type)} size={20} color={iconColor} />
              </View>
              <View style={styles.cardBody}>
                <View style={styles.cardTop}>
                  <Text style={styles.type}>
                    {item.type === "schedule" ? "Schedule" : "Wellness"}
                  </Text>
                  {severity && severity !== "low" && <RiskBadge risk={severity} />}
                </View>
                <Text style={styles.message}>{item.message}</Text>
              </View>
            </View>
          );
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    flexWrap: "wrap",
  },
  list: { paddingBottom: spacing.xxl },
  emptyList: { flexGrow: 1 },
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    borderLeftWidth: 4,
    gap: spacing.md,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { flex: 1 },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  type: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  message: { fontSize: 14, color: colors.text, lineHeight: 20 },
});
