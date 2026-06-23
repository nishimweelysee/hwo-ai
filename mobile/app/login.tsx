import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_BASE, apiRequest, checkBackendHealth } from "../lib/api";
import { saveSession } from "../lib/session";
import { useAuth } from "../lib/auth";
import { registerPushToken } from "../lib/push";
import { flushOfflineQueue } from "../lib/offline-queue";
import { colors, spacing } from "../lib/theme";
import { PrimaryButton } from "../components/ui";

interface LoginResponse {
  token?: string;
  user?: {
    id?: string;
    email?: string;
    name?: string;
    staffId?: string;
    role?: string;
  };
  error?: string;
}

export default function LoginScreen() {
  const { refreshSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing fields", "Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      const healthy = await checkBackendHealth();
      if (!healthy) {
        Alert.alert(
          "Cannot reach backend",
          `Could not connect to ${API_BASE}.\n\nOn a physical device, set EXPO_PUBLIC_BACKEND_URL in .env to your computer's LAN IP (e.g. http://192.168.1.10:8080).`
        );
        setLoading(false);
        return;
      }

      const data = await apiRequest<LoginResponse>("/api/auth/mobile-login", {
        auth: false,
        method: "POST",
        body: { email: email.trim(), password },
      });

      if (data.token) {
        const u = data.user ?? { email, name: email };
        await saveSession(data.token, {
          id: u.id,
          email: u.email ?? email.trim(),
          name: u.name,
          staffId: u.staffId,
          role: u.role,
        });
        await refreshSession();
        await registerPushToken();
        await flushOfflineQueue();
        router.replace("/(tabs)/home");
      } else {
        Alert.alert("Sign in failed", data.error || "Invalid email or password.");
      }
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Could not connect to backend"
      );
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.iconWrap}>
            <Ionicons name="lock-closed" size={28} color={colors.primary} />
          </View>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in with your HWO staff account</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@hospital.org"
            placeholderTextColor={colors.textLight}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Password"
              placeholderTextColor={colors.textLight}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <Pressable
              style={styles.eyeBtn}
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={8}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={22}
                color={colors.textMuted}
              />
            </Pressable>
          </View>

          <PrimaryButton
            label="Sign In"
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
          />

          <View style={styles.tipBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.info} />
            <Text style={styles.tipText}>
              Workforce staff: use the email from Staff Management. Seeded accounts often use
              password <Text style={styles.tipBold}>staff123</Text>.
            </Text>
          </View>

          <Text style={styles.backend}>Backend: {API_BASE}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, padding: spacing.xl },
  header: { marginBottom: spacing.xl, marginTop: spacing.md },
  back: { marginBottom: spacing.lg },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: { fontSize: 26, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 15, color: colors.textMuted, marginTop: spacing.xs },
  form: { gap: spacing.sm },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: colors.text,
  },
  passwordRow: { position: "relative" },
  passwordInput: { paddingRight: 48 },
  eyeBtn: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  tipBox: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.infoBg,
    padding: spacing.md,
    borderRadius: 12,
    marginTop: spacing.lg,
    alignItems: "flex-start",
  },
  tipText: { flex: 1, fontSize: 12, color: colors.info, lineHeight: 18 },
  tipBold: { fontWeight: "700" },
  backend: {
    fontSize: 11,
    color: colors.textLight,
    textAlign: "center",
    marginTop: spacing.lg,
  },
});
