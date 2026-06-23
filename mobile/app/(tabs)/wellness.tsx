import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  TextInput,
  Alert,
} from "react-native";
import { router } from "expo-router";
import * as Network from "expo-network";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth";
import { apiRequest } from "../../lib/api";
import {
  getPendingCount,
  submitCheckinOrQueue,
  submitSurveyOrQueue,
} from "../../lib/offline-queue";
import { colors, spacing } from "../../lib/theme";
import {
  Banner,
  Card,
  Chip,
  EmptyState,
  PrimaryButton,
  RiskBadge,
  ScreenContainer,
  StatPill,
} from "../../components/ui";

interface WellnessData {
  staffId?: string;
  overtime?: number;
  riskLevel?: string;
  score?: number;
  message?: string;
}

interface SurveyQuestion {
  id: string;
  text: string;
  type: string;
}

type Tab = "checkin" | "survey";

const MOOD_LABELS = ["Struggling", "Low", "Okay", "Good", "Great"];

function moodIndex(score: number): number {
  if (score <= 20) return 0;
  if (score <= 40) return 1;
  if (score <= 60) return 2;
  if (score <= 80) return 3;
  return 4;
}

export default function WellnessScreen() {
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const staffLinked = Boolean(user?.staffId);
  const [tab, setTab] = useState<Tab>("checkin");
  const [data, setData] = useState<WellnessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(0);

  const [score, setScore] = useState(75);
  const [overtime, setOvertime] = useState(0);
  const [checkinDone, setCheckinDone] = useState(false);

  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [surveyDone, setSurveyDone] = useState(false);

  const refreshPending = useCallback(async () => {
    setPending(await getPendingCount());
  }, []);

  const fetchWellness = useCallback(async () => {
    if (!signedIn) {
      setLoading(false);
      return;
    }
    try {
      const json = await apiRequest<WellnessData>("/api/mobile/wellness");
      setData(json);
      if (json.score != null) setScore(json.score);
      if (json.overtime != null) setOvertime(json.overtime);
    } catch {
      setData(null);
    }
    setLoading(false);
    await refreshPending();
  }, [signedIn, refreshPending]);

  const fetchSurvey = useCallback(async () => {
    if (!signedIn) return;
    try {
      const json = await apiRequest<{ questions?: SurveyQuestion[] }>(
        "/api/mobile/survey"
      );
      setQuestions(json.questions || []);
    } catch {
      setQuestions([]);
    }
  }, [signedIn]);

  useEffect(() => {
    fetchWellness();
    fetchSurvey();
  }, [fetchWellness, fetchSurvey]);

  const handleCheckIn = async () => {
    const { isConnected } = await Network.getNetworkStateAsync();
    try {
      const result = await submitCheckinOrQueue(
        { score, overtime },
        Boolean(isConnected)
      );
      setCheckinDone(true);
      Alert.alert(
        result === "queued" ? "Saved offline" : "Check-in complete",
        result === "queued"
          ? "Your check-in will sync when you're back online."
          : "Thank you — your wellness data was recorded."
      );
      await refreshPending();
      fetchWellness();
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Could not submit check-in"
      );
    }
  };

  const handleSurveySubmit = async () => {
    const unanswered = questions.filter((q) => answers[q.id] == null);
    if (unanswered.length) {
      Alert.alert("Incomplete", "Please answer all survey questions.");
      return;
    }
    const { isConnected } = await Network.getNetworkStateAsync();
    try {
      const result = await submitSurveyOrQueue(answers, Boolean(isConnected));
      setSurveyDone(true);
      Alert.alert(
        result === "queued" ? "Saved offline" : "Survey submitted",
        "Thank you for your feedback."
      );
      await refreshPending();
      fetchWellness();
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Could not submit survey"
      );
    }
  };

  if (!signedIn) {
    return (
      <ScreenContainer>
        <EmptyState
          title="Wellness check-ins"
          message="Sign in to complete daily check-ins and staff satisfaction surveys."
          actionLabel="Sign In"
          onAction={() => router.push("/login")}
        />
      </ScreenContainer>
    );
  }

  if (!staffLinked) {
    return (
      <ScreenContainer>
        <EmptyState
          title="Profile not linked"
          message="Your account isn't linked to a workforce profile yet. Ask an admin to assign a department in User Management."
          actionLabel="View profile"
          onAction={() => router.push("/(tabs)/profile")}
        />
      </ScreenContainer>
    );
  }

  const mood = moodIndex(score);

  return (
    <ScreenContainer>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchWellness} />
        }
        contentContainerStyle={styles.scroll}
      >
        {pending > 0 && (
          <Banner
            tone="warning"
            message={`${pending} action${pending === 1 ? "" : "s"} waiting to sync`}
          />
        )}

        <View style={styles.statsRow}>
          <StatPill label="Score" value={data?.score ?? "—"} />
          <StatPill label="Overtime" value={`+${data?.overtime ?? 0}h`} />
          <View style={styles.riskStat}>
            <Text style={styles.riskStatLabel}>Risk</Text>
            <RiskBadge risk={data?.riskLevel} />
          </View>
        </View>

        <View style={styles.tabRow}>
          <Chip
            label="Daily check-in"
            active={tab === "checkin"}
            onPress={() => setTab("checkin")}
          />
          <Chip
            label="Survey"
            active={tab === "survey"}
            onPress={() => setTab("survey")}
          />
        </View>

        {tab === "checkin" ? (
          <Card>
            {checkinDone ? (
              <View style={styles.successBlock}>
                <Ionicons name="checkmark-circle" size={40} color={colors.success} />
                <Text style={styles.successTitle}>Check-in recorded</Text>
                <Text style={styles.successSub}>Thank you for checking in today.</Text>
                <PrimaryButton
                  label="Submit another"
                  variant="ghost"
                  onPress={() => setCheckinDone(false)}
                />
              </View>
            ) : (
              <>
                <Text style={styles.cardHeading}>How are you feeling today?</Text>
                <Text style={styles.moodLabel}>{MOOD_LABELS[mood]}</Text>
                <View style={styles.moodRow}>
                  {MOOD_LABELS.map((label, i) => (
                    <View
                      key={label}
                      style={[
                        styles.moodDot,
                        i <= mood && styles.moodDotActive,
                        i === mood && styles.moodDotCurrent,
                      ]}
                    />
                  ))}
                </View>
                <View style={styles.stepperRow}>
                  <Pressable
                    style={styles.stepperBtn}
                    onPress={() => setScore((s) => Math.max(0, s - 5))}
                  >
                    <Text style={styles.stepperBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.scoreDisplay}>{score}</Text>
                  <Pressable
                    style={styles.stepperBtn}
                    onPress={() => setScore((s) => Math.min(100, s + 5))}
                  >
                    <Text style={styles.stepperBtnText}>+</Text>
                  </Pressable>
                </View>
                <Text style={styles.fieldLabel}>Overtime hours this week</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={String(overtime)}
                  onChangeText={(t) => setOvertime(Math.max(0, Number(t) || 0))}
                />
                <PrimaryButton label="Submit check-in" onPress={handleCheckIn} />
              </>
            )}
          </Card>
        ) : (
          <Card>
            {surveyDone ? (
              <View style={styles.successBlock}>
                <Ionicons name="checkmark-circle" size={40} color={colors.success} />
                <Text style={styles.successTitle}>Survey complete</Text>
                <Text style={styles.successSub}>Your responses help improve team wellness.</Text>
              </View>
            ) : questions.length === 0 ? (
              <Text style={styles.emptySurvey}>No survey questions configured.</Text>
            ) : (
              <>
                {questions.map((q, idx) => (
                  <View key={q.id} style={styles.questionBlock}>
                    <Text style={styles.questionNum}>Question {idx + 1}</Text>
                    <Text style={styles.questionText}>{q.text}</Text>
                    {q.type === "scale" ? (
                      <View style={styles.scaleRow}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Chip
                            key={n}
                            label={String(n)}
                            active={answers[q.id] === n}
                            onPress={() =>
                              setAnswers((a) => ({ ...a, [q.id]: n }))
                            }
                          />
                        ))}
                      </View>
                    ) : (
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        placeholder="Enter hours"
                        value={answers[q.id] != null ? String(answers[q.id]) : ""}
                        onChangeText={(t) =>
                          setAnswers((a) => ({ ...a, [q.id]: Number(t) || 0 }))
                        }
                      />
                    )}
                  </View>
                ))}
                <PrimaryButton label="Submit survey" onPress={handleSurveySubmit} />
              </>
            )}
          </Card>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.lg,
    alignItems: "stretch",
  },
  riskStat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  riskStatLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 6 },
  tabRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  cardHeading: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  moodLabel: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  moodRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  moodDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.border,
  },
  moodDotActive: { backgroundColor: colors.primaryLight },
  moodDotCurrent: { backgroundColor: colors.primary, transform: [{ scale: 1.3 }] },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnText: { fontSize: 24, fontWeight: "600", color: colors.primary },
  scoreDisplay: {
    fontSize: 40,
    fontWeight: "800",
    color: colors.primary,
    minWidth: 72,
    textAlign: "center",
  },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.background,
    marginBottom: spacing.md,
  },
  successBlock: { alignItems: "center", paddingVertical: spacing.lg },
  successTitle: { fontSize: 18, fontWeight: "700", color: colors.text, marginTop: spacing.sm },
  successSub: { fontSize: 14, color: colors.textMuted, marginTop: 4, textAlign: "center" },
  emptySurvey: { fontSize: 14, color: colors.textMuted, textAlign: "center" },
  questionBlock: { marginBottom: spacing.lg },
  questionNum: { fontSize: 11, fontWeight: "700", color: colors.textLight, marginBottom: 4 },
  questionText: { fontSize: 14, color: colors.text, lineHeight: 20, marginBottom: spacing.sm },
  scaleRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
});
