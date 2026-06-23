package com.hwo.service;

import com.hwo.entity.Department;
import com.hwo.entity.Schedule;
import com.hwo.entity.Staff;
import com.hwo.entity.WellnessIntervention;
import com.hwo.entity.WellnessRecord;
import com.hwo.repository.DepartmentRepository;
import com.hwo.repository.ScheduleRepository;
import com.hwo.repository.WellnessInterventionRepository;
import com.hwo.repository.WellnessRecordRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class WellnessAiService {

    private final AiServiceClient aiServiceClient;
    private final WellnessRecordRepository wellnessRecordRepository;
    private final WellnessInterventionRepository wellnessInterventionRepository;
    private final DepartmentRepository departmentRepository;
    private final ScheduleRepository scheduleRepository;
    private final SettingsService settingsService;

    public WellnessAiService(AiServiceClient aiServiceClient,
                             WellnessRecordRepository wellnessRecordRepository,
                             WellnessInterventionRepository wellnessInterventionRepository,
                             DepartmentRepository departmentRepository,
                             ScheduleRepository scheduleRepository,
                             SettingsService settingsService) {
        this.aiServiceClient = aiServiceClient;
        this.wellnessRecordRepository = wellnessRecordRepository;
        this.wellnessInterventionRepository = wellnessInterventionRepository;
        this.departmentRepository = departmentRepository;
        this.scheduleRepository = scheduleRepository;
        this.settingsService = settingsService;
    }

    public boolean isActive() {
        return aiServiceClient.isHealthy();
    }

    public Map<String, Object> predictRiskForStaff(Staff staff, WellnessRecord record) {
        Map<String, Object> payload = buildRiskPayload(staff, record);
        if (!aiServiceClient.isHealthy()) {
            return fallbackRisk(payload);
        }
        try {
            Map<String, Object> result = aiServiceClient.predictWellnessRisk(payload);
            result.put("aiPowered", true);
            return result;
        } catch (Exception e) {
            Map<String, Object> fallback = fallbackRisk(payload);
            fallback.put("aiPowered", false);
            fallback.put("aiError", e.getMessage());
            return fallback;
        }
    }

    public Map<String, Object> recommendInterventionsForStaff(Staff staff, WellnessRecord record,
                                                            Map<String, Object> riskPrediction) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("risk_level", riskPrediction.getOrDefault("risk_level", record.getRiskLevel()));
        payload.put("overtime", record.getOvertime());
        payload.put("wellness_score", record.getScore() != null ? record.getScore() : 75);
        payload.put("active_interventions", countActiveInterventions(staff.getId()));
        payload.put("department", departmentName(staff.getDepartmentId()));

        if (!aiServiceClient.isHealthy()) {
            return Map.of(
                "recommendations", List.of(),
                "top_pick", "Wellness check-in",
                "source", "heuristic",
                "aiPowered", false
            );
        }
        try {
            Map<String, Object> result = aiServiceClient.recommendWellnessInterventions(payload);
            result.put("aiPowered", true);
            return result;
        } catch (Exception e) {
            return Map.of(
                "recommendations", List.of(),
                "top_pick", "Wellness check-in",
                "source", "heuristic",
                "aiPowered", false,
                "aiError", e.getMessage()
            );
        }
    }

    public Map<String, Object> analyzeFeedback(String message, Integer rating) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("message", message != null ? message : "");
        if (rating != null) payload.put("rating", rating);

        if (!aiServiceClient.isHealthy()) {
            return Map.of(
                "sentiment", "neutral",
                "urgency", "low",
                "themes", List.of("general"),
                "sentiment_score", 0.0,
                "source", "heuristic",
                "aiPowered", false
            );
        }
        try {
            Map<String, Object> result = aiServiceClient.analyzeWellnessFeedback(payload);
            result.put("aiPowered", true);
            return result;
        } catch (Exception e) {
            return Map.of(
                "sentiment", "neutral",
                "urgency", "low",
                "themes", List.of("general"),
                "sentiment_score", 0.0,
                "source", "heuristic",
                "aiPowered", false,
                "aiError", e.getMessage()
            );
        }
    }

    public Map<String, Object> getModelInfo() {
        if (!aiServiceClient.isHealthy()) {
            return Map.of(
                "model_name", "HWO Burnout Risk Classifier",
                "aiPowered", false,
                "source", "heuristic-fallback"
            );
        }
        try {
            Map<String, Object> info = aiServiceClient.getWellnessModelInfo();
            info.put("aiPowered", true);
            return info;
        } catch (Exception e) {
            return Map.of("aiPowered", false, "error", e.getMessage());
        }
    }

    public Map<String, Object> enrichAlert(Staff staff, WellnessRecord record) {
        Map<String, Object> risk = predictRiskForStaff(staff, record);
        Map<String, Object> interventions = recommendInterventionsForStaff(staff, record, risk);
        Map<String, Object> enriched = new LinkedHashMap<>();
        enriched.put("aiRisk", risk.get("risk_level"));
        enriched.put("aiRiskProbability", risk.get("risk_probability"));
        enriched.put("aiPredictedScore", risk.get("predicted_score"));
        enriched.put("aiConfidence", risk.get("confidence"));
        enriched.put("aiTopFactors", risk.getOrDefault("top_factors", List.of()));
        enriched.put("aiFeatureContributions", risk.getOrDefault("feature_contributions", List.of()));
        enriched.put("aiExplainability", risk.getOrDefault("explainability", Map.of()));
        enriched.put("aiWhyFlagged", extractWhyFlagged(risk));
        enriched.put("aiRecommendedIntervention", interventions.get("top_pick"));
        enriched.put("aiInterventionRankings", interventions.getOrDefault("recommendations", List.of()));
        enriched.put("aiSource", risk.get("source"));
        return enriched;
    }

    @SuppressWarnings("unchecked")
    private String extractWhyFlagged(Map<String, Object> risk) {
        Object exp = risk.get("explainability");
        if (exp instanceof Map<?, ?> map && map.get("why_flagged") != null) {
            return String.valueOf(map.get("why_flagged"));
        }
        return "";
    }

    private Map<String, Object> buildRiskPayload(Staff staff, WellnessRecord record) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("overtime", record.getOvertime());
        payload.put("wellness_score", record.getScore() != null ? record.getScore() : 75);
        payload.put("weekly_hours", 40 + record.getOvertime());
        payload.put("score_trend", scoreTrend(staff.getId()));
        payload.put("prior_risk", record.getRiskLevel() != null ? record.getRiskLevel() : "low");
        payload.put("overtime_warning", settingsService.getInt("workload", "overtimeWarningHours", 10));
        payload.put("active_interventions", countActiveInterventions(staff.getId()));
        payload.put("consecutive_night_shifts", consecutiveNightShifts(staff.getId()));
        payload.put("shift_pattern_irregularity", shiftIrregularity(staff.getId()));
        return payload;
    }

    private int consecutiveNightShifts(String staffId) {
        LocalDate end = LocalDate.now();
        LocalDate start = end.minusDays(14);
        List<Schedule> schedules = scheduleRepository.findByStaffIdAndDateBetween(
            staffId, start.atStartOfDay(), end.plusDays(1).atStartOfDay());
        int maxRun = 0;
        int run = 0;
        LocalDate cursor = start;
        while (!cursor.isAfter(end)) {
            LocalDate day = cursor;
            boolean night = schedules.stream().anyMatch(s ->
                s.getDate() != null && s.getDate().toLocalDate().equals(day)
                    && s.getShift() != null && s.getShift().toLowerCase().contains("night"));
            if (night) {
                run++;
                maxRun = Math.max(maxRun, run);
            } else {
                run = 0;
            }
            cursor = cursor.plusDays(1);
        }
        return maxRun;
    }

    private double shiftIrregularity(String staffId) {
        LocalDate end = LocalDate.now();
        LocalDate start = end.minusDays(13);
        List<Schedule> schedules = scheduleRepository.findByStaffIdAndDateBetween(
            staffId, start.atStartOfDay(), end.plusDays(1).atStartOfDay());
        if (schedules.size() < 3) return 0.0;
        long distinctShifts = schedules.stream()
            .map(s -> s.getShift() != null ? s.getShift().toLowerCase() : "unknown")
            .distinct()
            .count();
        double daysWithShifts = schedules.stream()
            .filter(s -> s.getDate() != null)
            .map(s -> s.getDate().toLocalDate())
            .distinct()
            .count();
        if (daysWithShifts == 0) return 0.0;
        return Math.min(1.0, (distinctShifts / 3.0) * (14.0 / daysWithShifts) * 0.35);
    }

    private double scoreTrend(String staffId) {
        List<WellnessRecord> records = wellnessRecordRepository.findByStaffIdOrderByDateDesc(staffId);
        if (records.size() < 2) return 0;
        Double latest = records.get(0).getScore();
        Double prior = records.get(1).getScore();
        if (latest == null || prior == null) return 0;
        return latest - prior;
    }

    private int countActiveInterventions(String staffId) {
        return (int) wellnessInterventionRepository.findByStaffIdOrderByRecommendedAtDesc(staffId).stream()
            .filter(i -> i.getStatus() == null || "active".equalsIgnoreCase(i.getStatus()))
            .count();
    }

    private String departmentName(String departmentId) {
        if (departmentId == null) return "";
        return departmentRepository.findById(departmentId).map(Department::getName).orElse("");
    }

    private Map<String, Object> fallbackRisk(Map<String, Object> payload) {
        double overtime = asDouble(payload.get("overtime"));
        double warning = asDouble(payload.get("overtime_warning"));
        double score = asDouble(payload.get("wellness_score"));
        String risk;
        double prob;
        if (overtime >= warning + 2 || score < 55) {
            risk = "high";
            prob = 0.75;
        } else if (overtime >= warning || score < 68) {
            risk = "medium";
            prob = 0.48;
        } else {
            risk = "low";
            prob = 0.18;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("risk_level", risk);
        result.put("risk_probability", prob);
        result.put("predicted_score", Math.max(0, Math.min(100, score)));
        result.put("confidence", 0.5);
        result.put("top_factors", List.of(Map.of("factor", "Rule-based fallback", "weight", 1.0)));
        result.put("source", "heuristic");
        result.put("aiPowered", false);
        return result;
    }

    private double asDouble(Object value) {
        if (value instanceof Number number) return number.doubleValue();
        return 0;
    }
}
