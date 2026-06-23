import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth";
import { API_BASE } from "../../lib/api";
import { getPendingCount, flushOfflineQueue } from "../../lib/offline-queue";
import { registerPushToken } from "../../lib/push";
import { colors, spacing } from "../../lib/theme";
import { Banner, Card, PrimaryButton, ScreenContainer } from "../../components/ui";

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const signedIn = Boolean(user);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshPending = useCallback(async () => {
    setPending(await getPendingCount());
  }, []);

  useEffect(() => {
    refreshPending();
  }, [refreshPending]);

  const handleSignOut = async () => {
    await signOut();
    router.replace("/");
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await flushOfflineQueue();
      if (result.processed > 0) {
        await registerPushToken();
      }
    } finally {
      await refreshPending();
      setSyncing(false);
    }
  };

  if (!signedIn) {
    return (
      <ScreenContainer>
        <View style={styles.guest}>
          <Ionicons name="person-circle-outline" size={64} color={colors.textLight} />
          <Text style={styles.guestTitle}>Your profile</Text>
          <Text style={styles.guestText}>
            Sign in to view account details, sync offline actions, and manage notifications.
          </Text>
          <PrimaryButton label="Sign In" onPress={() => router.push("/login")} />
        </View>
      </ScreenContainer>
    );
  }

  const staffLinked = Boolean(user?.staffId);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.name || user?.email || "?").charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.name}>{user?.name || "Staff member"}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>{user?.role || "Staff"}</Text>
          </View>
        </View>

        {pending > 0 && (
          <Banner
            tone="warning"
            message={`${pending} offline item${pending === 1 ? "" : "s"} pending sync`}
            actionLabel="Sync now"
            onAction={handleSync}
          />
        )}

        <Card>
          <Text style={styles.cardTitle}>Workforce link</Text>
          <View style={styles.row}>
            <Ionicons
              name={staffLinked ? "link" : "unlink-outline"}
              size={20}
              color={staffLinked ? colors.success : colors.warning}
            />
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>
                {staffLinked ? "Linked to scheduling profile" : "Not linked"}
              </Text>
              <Text style={styles.rowHint}>
                {staffLinked
                  ? "Schedule, wellness, and alerts are personalized to your staff record."
                  : "Ask an admin to link your account in User Management with a department."}
              </Text>
            </View>
          </View>
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Notifications</Text>
          <Pressable style={styles.row} onPress={() => registerPushToken()}>
            <Ionicons name="notifications-outline" size={20} color={colors.primary} />
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>Refresh push token</Text>
              <Text style={styles.rowHint}>
                Re-register this device for wellness and schedule alerts.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
          </Pressable>
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Connection</Text>
          <View style={styles.row}>
            <Ionicons name="server-outline" size={20} color={colors.textMuted} />
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>Backend URL</Text>
              <Text style={styles.mono}>{API_BASE}</Text>
            </View>
          </View>
        </Card>

        <View style={styles.actions}>
          {pending > 0 && (
            <PrimaryButton
              label={syncing ? "Syncing…" : "Sync offline queue"}
              onPress={handleSync}
              loading={syncing}
              variant="secondary"
            />
          )}
          <PrimaryButton label="Sign out" onPress={handleSignOut} variant="ghost" />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl },
  guest: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xxl,
  },
  guestTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  guestText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  avatarSection: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  avatarText: { fontSize: 28, fontWeight: "700", color: "#fff" },
  name: { fontSize: 20, fontWeight: "700", color: colors.text },
  email: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  rolePill: {
    marginTop: spacing.sm,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
  },
  roleText: { fontSize: 12, fontWeight: "600", color: colors.primaryDark },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: "600", color: colors.text },
  rowHint: { fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 18 },
  mono: { fontSize: 11, color: colors.textMuted, marginTop: 4, fontFamily: "Menlo" },
  actions: { paddingHorizontal: spacing.lg, gap: spacing.sm, marginTop: spacing.md },
});
