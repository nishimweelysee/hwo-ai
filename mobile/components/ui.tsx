import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  type ViewStyle,
} from "react-native";
import type { ReactNode } from "react";
import { colors, radii, spacing, shadows, riskColor } from "../lib/theme";

export function ScreenContainer({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function Banner({
  tone = "warning",
  message,
  actionLabel,
  onAction,
}: {
  tone?: "warning" | "info" | "success";
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const toneStyle =
    tone === "info"
      ? styles.bannerInfo
      : tone === "success"
        ? styles.bannerSuccess
        : styles.bannerWarning;
  const textStyle =
    tone === "info"
      ? styles.bannerInfoText
      : tone === "success"
        ? styles.bannerSuccessText
        : styles.bannerWarningText;

  return (
    <View style={[styles.banner, toneStyle]}>
      <Text style={[styles.bannerText, textStyle]}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.bannerAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const btnStyle =
    variant === "secondary"
      ? styles.btnSecondary
      : variant === "ghost"
        ? styles.btnGhost
        : styles.btnPrimary;
  const textStyle =
    variant === "secondary"
      ? styles.btnSecondaryText
      : variant === "ghost"
        ? styles.btnGhostText
        : styles.btnPrimaryText;

  return (
    <Pressable
      style={[styles.btn, btnStyle, (disabled || loading) && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#fff" : colors.primary} />
      ) : (
        <Text style={textStyle}>{label}</Text>
      )}
    </Pressable>
  );
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {actionLabel && onAction ? (
        <PrimaryButton label={actionLabel} onPress={onAction} />
      ) : null}
    </View>
  );
}

export function StatPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent ? { color: accent } : undefined]}>
        {value}
      </Text>
    </View>
  );
}

export function RiskBadge({ risk }: { risk?: string }) {
  const { bg, text } = riskColor(risk);
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: text }]}>
        {(risk || "low").toUpperCase()}
      </Text>
    </View>
  );
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionTitleText}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  bannerWarning: { backgroundColor: colors.warningBg },
  bannerInfo: { backgroundColor: colors.infoBg },
  bannerSuccess: { backgroundColor: colors.successBg },
  bannerText: { flex: 1, fontSize: 12, lineHeight: 18 },
  bannerWarningText: { color: colors.warningText },
  bannerInfoText: { color: colors.info },
  bannerSuccessText: { color: colors.success },
  bannerAction: { fontSize: 12, fontWeight: "700", color: colors.primary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  btn: {
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  btnGhost: { backgroundColor: "transparent" },
  btnDisabled: { opacity: 0.55 },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  btnSecondaryText: { color: colors.primary, fontSize: 16, fontWeight: "600" },
  btnGhostText: { color: colors.primary, fontSize: 14, fontWeight: "600" },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xxl,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  emptyMessage: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  statPill: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: "center",
    ...shadows.card,
  },
  statLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "500" },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.primary,
    marginTop: spacing.xs,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  badgeText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  sectionTitle: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  sectionTitleText: { fontSize: 17, fontWeight: "700", color: colors.text },
  sectionSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  chipTextActive: { color: "#fff" },
});
