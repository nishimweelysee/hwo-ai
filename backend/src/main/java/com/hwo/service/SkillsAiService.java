package com.hwo.service;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class SkillsAiService {

    private final AiServiceClient aiServiceClient;
    private final SettingsService settingsService;

    public SkillsAiService(AiServiceClient aiServiceClient, SettingsService settingsService) {
        this.aiServiceClient = aiServiceClient;
        this.settingsService = settingsService;
    }

    public boolean isActive() {
        return aiServiceClient.isHealthy()
            && settingsService.getBoolean("skills", "autoTrainingAlerts", true);
    }

    public Map<String, Object> getAiHealth() {
        Map<String, Object> health = new LinkedHashMap<>();
        health.put("aiServiceHealthy", aiServiceClient.isHealthy());
        health.put("skillsAiActive", isActive());
        health.put("expiryWarningDays", settingsService.getInt("skills", "expiryWarningDays", 30));
        health.put("autoTrainingAlerts", settingsService.getBoolean("skills", "autoTrainingAlerts", true));
        return health;
    }

    public List<Map<String, Object>> prioritizeTraining(List<Map<String, Object>> trainingNeeds,
                                                        List<Map<String, Object>> skillGaps) {
        List<Map<String, Object>> items = new ArrayList<>();
        items.addAll(trainingNeeds);
        for (Map<String, Object> gap : skillGaps) {
            if (trainingNeeds.stream().anyMatch(t ->
                String.valueOf(t.get("certification")).equalsIgnoreCase(String.valueOf(gap.get("certification"))))) {
                continue;
            }
            items.add(gap);
        }
        if (!isActive() || items.isEmpty()) {
            return fallbackPriorities(items);
        }
        try {
            Map<String, Object> response = aiServiceClient.prioritizeSkillsTraining(Map.of("items", items));
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> rankings = (List<Map<String, Object>>) response.getOrDefault("rankings", List.of());
            for (Map<String, Object> row : rankings) {
                row.put("aiPowered", true);
            }
            return rankings;
        } catch (Exception e) {
            List<Map<String, Object>> fallback = fallbackPriorities(items);
            fallback.forEach(r -> r.put("aiError", e.getMessage()));
            return fallback;
        }
    }

    public Map<String, Object> analyzeGaps(List<Map<String, Object>> departmentCoverage) {
        if (departmentCoverage.isEmpty()) {
            return heuristicGapAnalysis(departmentCoverage);
        }
        if (!isActive()) {
            return heuristicGapAnalysis(departmentCoverage);
        }
        try {
            Map<String, Object> result = aiServiceClient.analyzeSkillsGaps(Map.of("departments", departmentCoverage));
            result.put("aiPowered", true);
            return result;
        } catch (Exception e) {
            Map<String, Object> fallback = heuristicGapAnalysis(departmentCoverage);
            fallback.put("aiError", e.getMessage());
            return fallback;
        }
    }

    private Map<String, Object> heuristicGapAnalysis(List<Map<String, Object>> departmentCoverage) {
        List<Map<String, Object>> gaps = new ArrayList<>();
        double totalCoverage = 0;
        int atRisk = 0;
        int count = 0;
        for (Map<String, Object> dept : departmentCoverage) {
            double coverage = dept.get("coveragePercent") instanceof Number n
                ? n.doubleValue()
                : 100.0;
            totalCoverage += coverage;
            count++;
            if (coverage < 80) atRisk++;
            @SuppressWarnings("unchecked")
            List<String> required = dept.get("requiredCerts") instanceof List<?> list
                ? list.stream().map(String::valueOf).toList()
                : List.of();
            int staffTotal = dept.get("staffTotal") instanceof Number n ? n.intValue() : 0;
            int qualified = dept.get("qualifiedStaff") instanceof Number n ? n.intValue() : 0;
            int missing = Math.max(0, staffTotal - qualified);
            if (missing > 0 && !required.isEmpty()) {
                for (String cert : required) {
                    Map<String, Object> gap = new LinkedHashMap<>();
                    gap.put("department", dept.get("department"));
                    gap.put("certification", cert);
                    gap.put("missing_count", missing);
                    gap.put("coverage_percent", coverage);
                    gaps.add(gap);
                }
            }
        }
        Map<String, Object> fallback = new LinkedHashMap<>();
        fallback.put("gaps", gaps.stream().limit(20).toList());
        fallback.put("avg_coverage", count > 0 ? Math.round((totalCoverage / count) * 10) / 10.0 : 0.0);
        fallback.put("at_risk_departments", atRisk);
        fallback.put("source", "heuristic");
        fallback.put("aiPowered", false);
        return fallback;
    }

    public Map<String, Object> recommendDevelopment(Map<String, Object> staffProfile) {
        if (!isActive()) {
            Map<String, Object> fallback = new LinkedHashMap<>();
            fallback.put("recommendations", List.of(Map.of(
                "program", "Continuing Education Credits",
                "reason", "Maintain active certifications",
                "priority", "medium"
            )));
            fallback.put("top_pick", "Continuing Education Credits");
            fallback.put("source", "heuristic");
            fallback.put("aiPowered", false);
            return fallback;
        }
        try {
            Map<String, Object> result = aiServiceClient.recommendSkillsDevelopment(staffProfile);
            result.put("aiPowered", true);
            return result;
        } catch (Exception e) {
            Map<String, Object> fallback = new LinkedHashMap<>();
            fallback.put("recommendations", List.of());
            fallback.put("top_pick", null);
            fallback.put("source", "heuristic");
            fallback.put("aiPowered", false);
            fallback.put("aiError", e.getMessage());
            return fallback;
        }
    }

    private List<Map<String, Object>> fallbackPriorities(List<Map<String, Object>> items) {
        List<Map<String, Object>> ranked = new ArrayList<>();
        int rank = 1;
        for (Map<String, Object> item : items) {
            Map<String, Object> row = new LinkedHashMap<>(item);
            int staffCount = item.get("staffCount") instanceof Number n ? n.intValue() : 1;
            String gapType = String.valueOf(item.getOrDefault("gapType", "renewal"));
            String priority = "requirement".equals(gapType) && staffCount >= 3 ? "high"
                : staffCount >= 2 ? "medium" : "low";
            row.put("priority", priority);
            row.put("priority_score", "high".equals(priority) ? 0.7 : 0.5);
            row.put("rank", rank++);
            row.put("rationale", item.getOrDefault("description", "Rule-based training priority"));
            row.put("source", "heuristic");
            row.put("aiPowered", false);
            ranked.add(row);
        }
        return ranked;
    }
}
