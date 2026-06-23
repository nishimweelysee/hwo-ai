package com.hwo.service;

import com.hwo.entity.Department;
import com.hwo.entity.WellnessRecord;
import com.hwo.repository.DepartmentRepository;
import com.hwo.repository.StaffRepository;
import com.hwo.repository.WellnessRecordRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class DashboardService {

    private final DepartmentRepository departmentRepository;
    private final StaffRepository staffRepository;
    private final WellnessRecordRepository wellnessRecordRepository;
    private final SchedulingService schedulingService;
    private final PredictionService predictionService;
    private final WellnessService wellnessService;
    private final WorkloadChartService workloadChartService;
    private final SettingsService settingsService;

    public DashboardService(DepartmentRepository departmentRepository,
                            StaffRepository staffRepository,
                            WellnessRecordRepository wellnessRecordRepository,
                            SchedulingService schedulingService,
                            PredictionService predictionService,
                            WellnessService wellnessService,
                            WorkloadChartService workloadChartService,
                            SettingsService settingsService) {
        this.departmentRepository = departmentRepository;
        this.staffRepository = staffRepository;
        this.wellnessRecordRepository = wellnessRecordRepository;
        this.schedulingService = schedulingService;
        this.predictionService = predictionService;
        this.wellnessService = wellnessService;
        this.workloadChartService = workloadChartService;
        this.settingsService = settingsService;
    }

    /** Single optimized payload for the dashboard page (one HTTP round-trip). */
    public Map<String, Object> getOverview() {
        Map<String, Object> overview = new LinkedHashMap<>();
        List<WellnessRecord> latestWellness = wellnessRecordRepository.findLatestPerStaff();

        Map<String, Long> staffCounts = loadStaffCountsByDepartment();
        List<Map<String, Object>> departments = departmentRepository.findAllOrderByName().stream()
            .map(d -> toDepartmentRow(d, staffCounts))
            .toList();
        overview.put("departments", departments);

        Map<String, Object> charts = workloadChartService.buildCharts();
        overview.put("workloadByHour", charts.get("byHour"));
        overview.put("workloadTrend", charts.get("trend"));

        overview.put("wellness", wellnessService.getDashboardWellness());
        overview.put("summary", buildSummary(departments, latestWellness));
        overview.put("alertThreshold", settingsService.getInt("workload", "alertThreshold", 80));
        overview.put("predictionAccuracy", predictionService.getPredictionAccuracyPercent());
        overview.put("heatmap", buildHeatmap(departments));
        overview.put("analytics", buildAnalyticsLight(latestWellness));
        overview.put("generatedAt", LocalDate.now().toString());
        return overview;
    }

    public Map<String, Object> getAnalytics() {
        return buildAnalyticsLight(wellnessRecordRepository.findLatestPerStaff());
    }

    private Map<String, Object> buildAnalyticsLight(List<WellnessRecord> latestWellness) {
        Map<String, Object> analytics = new LinkedHashMap<>();
        analytics.put("overtimeTrend", buildOvertimeTrend(latestWellness));
        analytics.put("burnoutRiskDistribution", buildBurnoutDistribution(latestWellness));
        analytics.put("staffingForecast", predictionService.getStaffingForecastSnapshot());
        analytics.put("forecastMetrics", predictionService.getPredictionMetricsSnapshot());

        try {
            Map<String, Object> summary = schedulingService.scheduleSummary(LocalDate.now());
            analytics.put("schedulingSummary", summary);
            analytics.put("staffingShortages", summary.getOrDefault("recommendations", List.of()));
            analytics.put("openShifts", summary.getOrDefault("openShiftSlots", 0));
            analytics.put("coveragePercent", summary.getOrDefault("coverage", 0));
        } catch (Exception e) {
            analytics.put("staffingShortages", List.of());
            analytics.put("coveragePercent", 0);
        }

        analytics.put("generatedAt", LocalDate.now().toString());
        return analytics;
    }

    private Map<String, Long> loadStaffCountsByDepartment() {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (Object[] row : staffRepository.countStaffGroupedByDepartment()) {
            counts.put(String.valueOf(row[0]), ((Number) row[1]).longValue());
        }
        return counts;
    }

    private Map<String, Object> toDepartmentRow(Department department, Map<String, Long> staffCounts) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", department.getId());
        map.put("name", department.getName());
        map.put("staffCount", staffCounts.getOrDefault(department.getId(), 0L));
        map.put("workload", Math.round(department.getWorkload()));
        return map;
    }

    private Map<String, Object> buildSummary(List<Map<String, Object>> departments,
                                             List<WellnessRecord> latestWellness) {
        long totalStaff = staffRepository.count();
        double avgWorkload = departments.isEmpty() ? 0
            : departments.stream().mapToDouble(d -> ((Number) d.getOrDefault("workload", 0)).doubleValue()).average().orElse(0);
        int alertThreshold = settingsService.getInt("workload", "alertThreshold", 80);
        int overtimeWarningHours = settingsService.getInt("workload", "overtimeWarningHours", 10);

        long overtimeCount = latestWellness.stream().filter(w -> w.getOvertime() > overtimeWarningHours).count();
        int overtimeRate = totalStaff > 0 ? (int) Math.round((overtimeCount * 100.0) / totalStaff) : 0;
        int balanceScore = (int) Math.min(100, Math.round(100 - Math.abs(avgWorkload - alertThreshold) * 0.5));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalStaff", totalStaff);
        result.put("avgWorkload", avgWorkload);
        result.put("balanceScore", balanceScore);
        result.put("overtimeRate", overtimeRate);
        return result;
    }

    private List<Map<String, Object>> buildHeatmap(List<Map<String, Object>> departments) {
        return departments.stream().map(d -> {
            int workload = ((Number) d.getOrDefault("workload", 0)).intValue();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("department", d.get("name"));
            row.put("Day", workload);
            row.put("Evening", Math.max(0, workload - 8));
            row.put("Night", Math.max(0, workload - 15));
            return row;
        }).toList();
    }

    private List<Map<String, Object>> buildOvertimeTrend(List<WellnessRecord> records) {
        Map<String, List<Double>> byMonth = new LinkedHashMap<>();
        for (WellnessRecord r : records) {
            if (r.getDate() == null) continue;
            String month = r.getDate().toLocalDate().getMonth().toString().substring(0, 3);
            byMonth.computeIfAbsent(month, k -> new ArrayList<>()).add((double) r.getOvertime());
        }
        List<Map<String, Object>> trend = new ArrayList<>();
        for (var entry : byMonth.entrySet()) {
            double avg = entry.getValue().stream().mapToDouble(Double::doubleValue).average().orElse(0);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("month", entry.getKey());
            row.put("avgOvertime", Math.round(avg * 10) / 10.0);
            trend.add(row);
        }
        if (trend.isEmpty()) {
            trend.add(Map.of("month", "Current", "avgOvertime", 0));
        }
        return trend;
    }

    private Map<String, Object> buildBurnoutDistribution(List<WellnessRecord> records) {
        long low = records.stream().filter(r -> "low".equalsIgnoreCase(r.getRiskLevel())).count();
        long medium = records.stream().filter(r -> "medium".equalsIgnoreCase(r.getRiskLevel())).count();
        long high = records.stream().filter(r -> "high".equalsIgnoreCase(r.getRiskLevel())).count();
        return Map.of(
            "low", low,
            "medium", medium,
            "high", high,
            "total", records.size()
        );
    }
}
