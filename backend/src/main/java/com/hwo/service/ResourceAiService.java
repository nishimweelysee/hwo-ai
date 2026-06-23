package com.hwo.service;

import com.hwo.entity.Resource;
import com.hwo.entity.ResourceStockMovement;
import com.hwo.repository.ResourceStockMovementRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class ResourceAiService {

    private final AiServiceClient aiServiceClient;
    private final ResourceStockMovementRepository movementRepository;
    private final SettingsService settingsService;

    public ResourceAiService(AiServiceClient aiServiceClient,
                             ResourceStockMovementRepository movementRepository,
                             SettingsService settingsService) {
        this.aiServiceClient = aiServiceClient;
        this.movementRepository = movementRepository;
        this.settingsService = settingsService;
    }

    public boolean isActive() {
        return aiServiceClient.isHealthy();
    }

    public Map<String, Object> getAiHealth() {
        Map<String, Object> health = new LinkedHashMap<>();
        health.put("aiServiceHealthy", aiServiceClient.isHealthy());
        health.put("inventoryAiActive", aiServiceClient.isHealthy());
        health.put("leadTimeDays", leadTimeDays());
        health.put("autoProcurementEnabled", settingsService.getBoolean("inventory", "autoProcurementEnabled", true));
        return health;
    }

    public Map<String, Object> predictDemand(Resource resource) {
        Map<String, Object> payload = movementPayload(resource);
        if (!aiServiceClient.isHealthy()) {
            return fallbackDemand(resource);
        }
        try {
            Map<String, Object> result = aiServiceClient.predictInventoryDemand(payload);
            result.put("aiPowered", true);
            result.put("resourceId", resource.getId());
            return result;
        } catch (Exception e) {
            Map<String, Object> fallback = fallbackDemand(resource);
            fallback.put("aiError", e.getMessage());
            return fallback;
        }
    }

    public List<Map<String, Object>> optimizeReorders(List<Resource> resources, Map<String, String> deptNames) {
        if (resources.isEmpty()) return List.of();
        List<Map<String, Object>> items = new ArrayList<>();
        for (Resource r : resources) {
            Map<String, Object> item = itemPayload(r, deptNames);
            if (aiServiceClient.isHealthy()) {
                try {
                    Map<String, Object> demand = aiServiceClient.predictInventoryDemand(movementPayload(r));
                    item.put("weekly_demand", demand.get("weekly_demand"));
                    item.put("days_until_stockout", demand.get("days_until_stockout"));
                } catch (Exception ignored) {
                    item.put("weekly_demand", estimateWeeklyDemand(r));
                }
            } else {
                item.put("weekly_demand", estimateWeeklyDemand(r));
            }
            items.add(item);
        }

        if (!aiServiceClient.isHealthy()) {
            return fallbackReorderSuggestions(resources, deptNames, items);
        }
        try {
            Map<String, Object> response = aiServiceClient.optimizeInventoryReorders(Map.of(
                "items", items,
                "lead_time_days", leadTimeDays()
            ));
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> suggestions = (List<Map<String, Object>>) response.getOrDefault("suggestions", List.of());
            return enrichAiSuggestions(suggestions, resources, deptNames);
        } catch (Exception e) {
            List<Map<String, Object>> fallback = fallbackReorderSuggestions(resources, deptNames, items);
            fallback.forEach(s -> s.put("aiError", e.getMessage()));
            return fallback;
        }
    }

    public Map<String, Object> analyzePortfolio(List<Resource> resources) {
        if (!aiServiceClient.isHealthy() || resources.isEmpty()) {
            Map<String, Object> fallback = new LinkedHashMap<>();
            fallback.put("at_risk_count", resources.stream().filter(this::heuristicCritical).count());
            fallback.put("forecast_weekly_spend", 0);
            fallback.put("avg_confidence", 0.0);
            fallback.put("top_risks", List.of());
            fallback.put("source", "heuristic");
            fallback.put("aiPowered", false);
            return fallback;
        }
        try {
            List<Map<String, Object>> items = resources.stream()
                .map(r -> {
                    Map<String, Object> item = movementPayload(r);
                    item.put("resource_id", r.getId());
                    item.put("name", r.getName());
                    item.put("reorder_level", r.getReorderLevel() > 0 ? r.getReorderLevel() : defaultReorderLevel());
                    item.put("available", r.getAvailable());
                    item.put("unit_cost", r.getUnitCost());
                    item.put("critical", heuristicCritical(r));
                    return item;
                })
                .collect(Collectors.toList());
            Map<String, Object> result = aiServiceClient.analyzeInventoryPortfolio(Map.of(
                "items", items,
                "lead_time_days", leadTimeDays()
            ));
            result.put("aiPowered", true);
            return result;
        } catch (Exception e) {
            Map<String, Object> fallback = new LinkedHashMap<>();
            fallback.put("at_risk_count", 0);
            fallback.put("forecast_weekly_spend", 0);
            fallback.put("avg_confidence", 0.0);
            fallback.put("top_risks", List.of());
            fallback.put("source", "heuristic");
            fallback.put("aiPowered", false);
            fallback.put("aiError", e.getMessage());
            return fallback;
        }
    }

    public List<Map<String, Object>> rankProcurement(List<Map<String, Object>> procurement) {
        if (!aiServiceClient.isHealthy() || procurement.isEmpty()) {
            return procurement;
        }
        try {
            List<Map<String, Object>> requests = procurement.stream()
                .map(p -> Map.<String, Object>of(
                    "id", p.get("id"),
                    "priority", p.getOrDefault("priority", "medium"),
                    "status", p.getOrDefault("status", "pending"),
                    "quantity", p.getOrDefault("quantity", 1),
                    "estimated_total", p.getOrDefault("estimatedTotal", 0)
                ))
                .collect(Collectors.toList());
            Map<String, Object> response = aiServiceClient.rankInventoryProcurement(Map.of("requests", requests));
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> rankings = (List<Map<String, Object>>) response.getOrDefault("rankings", List.of());
            Map<String, Integer> rankById = rankings.stream()
                .collect(Collectors.toMap(
                    r -> String.valueOf(r.get("id")),
                    r -> ((Number) r.getOrDefault("rank", 999)).intValue(),
                    (a, b) -> a
                ));
            List<Map<String, Object>> ranked = new ArrayList<>(procurement);
            ranked.sort((a, b) -> Integer.compare(
                rankById.getOrDefault(String.valueOf(a.get("id")), 999),
                rankById.getOrDefault(String.valueOf(b.get("id")), 999)
            ));
            for (Map<String, Object> row : ranked) {
                String id = String.valueOf(row.get("id"));
                rankings.stream()
                    .filter(r -> id.equals(String.valueOf(r.get("id"))))
                    .findFirst()
                    .ifPresent(r -> {
                        row.put("aiRank", r.get("rank"));
                        row.put("aiRankScore", r.get("score"));
                        row.put("aiRankReason", r.get("rank_reason"));
                    });
            }
            return ranked;
        } catch (Exception e) {
            return procurement;
        }
    }

    private List<Map<String, Object>> enrichAiSuggestions(
            List<Map<String, Object>> suggestions,
            List<Resource> resources,
            Map<String, String> deptNames) {
        Map<String, Resource> byId = resources.stream().collect(Collectors.toMap(Resource::getId, r -> r, (a, b) -> a));
        List<Map<String, Object>> enriched = new ArrayList<>();
        for (Map<String, Object> s : suggestions) {
            String resourceId = String.valueOf(s.getOrDefault("resource_id", ""));
            Resource r = byId.get(resourceId);
            if (r == null) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("resourceId", resourceId);
            row.put("name", r.getName());
            row.put("departmentId", r.getDepartmentId());
            row.put("department", deptNames.getOrDefault(r.getDepartmentId(), ""));
            row.put("freeStock", freeStock(r));
            row.put("reorderLevel", r.getReorderLevel() > 0 ? r.getReorderLevel() : defaultReorderLevel());
            row.put("suggestedQuantity", s.getOrDefault("suggested_quantity", s.get("suggestedQuantity")));
            row.put("priority", s.get("priority"));
            row.put("priorityScore", s.get("priority_score"));
            row.put("weeklyDemand", s.get("weekly_demand"));
            row.put("daysOfCover", s.get("days_of_cover"));
            row.put("unitCost", r.getUnitCost());
            row.put("supplier", r.getSupplier());
            row.put("estimatedCost", s.get("estimated_cost"));
            row.put("rationale", s.get("rationale"));
            row.put("source", s.getOrDefault("source", "inventory-ai"));
            row.put("aiPowered", true);
            enriched.add(row);
        }
        return enriched;
    }

    private List<Map<String, Object>> fallbackReorderSuggestions(
            List<Resource> resources,
            Map<String, String> deptNames,
            List<Map<String, Object>> items) {
        List<Map<String, Object>> suggestions = new ArrayList<>();
        for (Resource r : resources) {
            if (!heuristicNeedsReorder(r)) continue;
            int reorder = r.getReorderLevel() > 0 ? r.getReorderLevel() : defaultReorderLevel();
            int suggested = Math.max(reorder, reorder * 2 - freeStock(r));
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("resourceId", r.getId());
            row.put("name", r.getName());
            row.put("departmentId", r.getDepartmentId());
            row.put("department", deptNames.getOrDefault(r.getDepartmentId(), ""));
            row.put("freeStock", freeStock(r));
            row.put("reorderLevel", reorder);
            row.put("suggestedQuantity", suggested);
            row.put("priority", heuristicCritical(r) ? "urgent" : "medium");
            row.put("priorityScore", heuristicCritical(r) ? 0.8 : 0.5);
            row.put("weeklyDemand", estimateWeeklyDemand(r));
            row.put("unitCost", r.getUnitCost());
            row.put("supplier", r.getSupplier());
            row.put("estimatedCost", (long) suggested * Math.max(0, r.getUnitCost()));
            row.put("rationale", "Rule-based fallback reorder suggestion");
            row.put("source", "heuristic");
            row.put("aiPowered", false);
            suggestions.add(row);
        }
        return suggestions;
    }

    private Map<String, Object> movementPayload(Resource resource) {
        List<ResourceStockMovement> movements = movementRepository.findByResourceIdOrderByCreatedAtDesc(resource.getId());
        List<Map<String, Object>> movementDtos = movements.stream().limit(120).map(m -> {
            Map<String, Object> dto = new LinkedHashMap<>();
            dto.put("type", m.getType());
            dto.put("quantity", m.getQuantity());
            dto.put("created_at", m.getCreatedAt() != null ? m.getCreatedAt().toString() : null);
            return dto;
        }).collect(Collectors.toList());

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("movements", movementDtos);
        payload.put("free_stock", freeStock(resource));
        payload.put("in_use", resource.getInUse());
        payload.put("lead_time_days", leadTimeDays());
        payload.put("horizon_weeks", 4);
        return payload;
    }

    private Map<String, Object> itemPayload(Resource r, Map<String, String> deptNames) {
        Map<String, Object> item = movementPayload(r);
        item.put("resource_id", r.getId());
        item.put("name", r.getName());
        item.put("department", deptNames.getOrDefault(r.getDepartmentId(), ""));
        item.put("reorder_level", r.getReorderLevel() > 0 ? r.getReorderLevel() : defaultReorderLevel());
        item.put("available", r.getAvailable());
        item.put("unit_cost", r.getUnitCost());
        item.put("critical", heuristicCritical(r));
        return item;
    }

    private Map<String, Object> fallbackDemand(Resource resource) {
        double weekly = estimateWeeklyDemand(resource);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("weekly_demand", weekly);
        result.put("daily_demand", Math.round(weekly / 7.0 * 100.0) / 100.0);
        result.put("confidence", 0.45);
        result.put("trend", "stable");
        result.put("days_until_stockout", weekly > 0 ? (int) (freeStock(resource) / (weekly / 7.0)) : null);
        result.put("source", "heuristic");
        result.put("aiPowered", false);
        result.put("resourceId", resource.getId());
        return result;
    }

    private double estimateWeeklyDemand(Resource r) {
        int base = Math.max(1, r.getReorderLevel() > 0 ? r.getReorderLevel() : defaultReorderLevel());
        double util = r.getAvailable() > 0 ? (r.getInUse() * 1.0 / r.getAvailable()) : 0;
        return Math.max(0.5, base * (0.3 + util * 0.7));
    }

    private boolean heuristicCritical(Resource r) {
        double threshold = settingsService.getInt("inventory", "criticalUtilizationPercent", 90) / 100.0;
        return r.getAvailable() > 0 && (r.getInUse() * 1.0 / r.getAvailable()) >= threshold;
    }

    private boolean heuristicNeedsReorder(Resource r) {
        int reorder = r.getReorderLevel() > 0 ? r.getReorderLevel() : defaultReorderLevel();
        return reorder > 0 && freeStock(r) <= reorder;
    }

    private int defaultReorderLevel() {
        return Math.max(0, settingsService.getInt("inventory", "defaultReorderLevel", 5));
    }

    private int leadTimeDays() {
        return Math.max(1, settingsService.getInt("inventory", "procurementLeadTimeDays", 7));
    }

    private int freeStock(Resource r) {
        return Math.max(0, r.getAvailable() - r.getInUse());
    }
}
