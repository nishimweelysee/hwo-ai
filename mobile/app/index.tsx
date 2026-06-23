import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Redirect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth";
import { colors, spacing } from "../lib/theme";

const FEATURES = [
  { icon: "calendar-outline" as const, text: "View your personal shift schedule" },
  { icon: "heart-outline" as const, text: "Daily wellness check-ins & surveys" },
  { icon: "swap-horizontal-outline" as const, text: "Request shift swaps on the go" },
  { icon: "notifications-outline" as const, text: "Workload and schedule alerts" },
];

export default function WelcomeScreen() {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (user) {
    return <Redirect href="/(tabs)/home" />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.logoCircle}>
          <Ionicons name="medical" size={36} color="#fff" />
        </View>
        <Text style={styles.title}>Health Workforce{"\n"}Optimizer</Text>
        <Text style={styles.subtitle}>Mobile for healthcare staff</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.featuresTitle}>What you can do</Text>
        {FEATURES.map((f) => (
          <View key={f.text} style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Ionicons name={f.icon} size={18} color={colors.primary} />
            </View>
            <Text style={styles.featureText}>{f.text}</Text>
          </View>
        ))}

        <Pressable style={styles.button} onPress={() => router.push("/login")}>
          <Text style={styles.buttonText}>Sign In</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.buttonSecondary]}
          onPress={() => router.push("/(tabs)/home")}
        >
          <Text style={styles.buttonSecondaryText}>Browse as guest</Text>
        </Pressable>
        <Text style={styles.hint}>
          Staff: use your workforce email · default password often{" "}
          <Text style={styles.hintBold}>staff123</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  container: { flex: 1, backgroundColor: colors.background },
  hero: {
    backgroundColor: colors.primary,
    paddingTop: 72,
    paddingBottom: 40,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 15,
    color: "rgba(255,255,255,0.9)",
    marginTop: spacing.sm,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  featuresTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  buttonSecondary: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: colors.primary,
    marginTop: spacing.sm,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  buttonSecondaryText: { color: colors.primary, fontSize: 16, fontWeight: "700" },
  hint: {
    fontSize: 12,
    color: colors.textLight,
    textAlign: "center",
    marginTop: spacing.lg,
    lineHeight: 18,
  },
  hintBold: { fontWeight: "700", color: colors.textMuted },
});
