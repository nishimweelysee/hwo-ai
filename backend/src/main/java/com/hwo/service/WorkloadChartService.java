package com.hwo.service;

import com.hwo.entity.WorkloadRecord;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class WorkloadChartService {

    private static final String[] MONTH_NAMES = {
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    };
    private static final List<String> HOURS = List.of("00", "04", "08", "12", "16", "20");

    private final WorkloadQueryService workloadQueryService;

    public WorkloadChartService(WorkloadQueryService workloadQueryService) {
        this.workloadQueryService = workloadQueryService;
    }

    public Map<String, Object> buildCharts() {
        List<WorkloadRecord> records = workloadQueryService.findAllOrdered();
        Map<String, Object> charts = new LinkedHashMap<>();
        charts.put("byHour", buildByHour(records));
        charts.put("trend", buildTrend(records));
        return charts;
    }

    public List<Map<String, Object>> buildByHour(List<WorkloadRecord> records) {
        Map<String, List<Double>> byHour = new HashMap<>();
        for (WorkloadRecord r : records) {
            String h = r.getHour() != null ? String.format("%02d", r.getHour()) : "12";
            byHour.computeIfAbsent(h, k -> new ArrayList<>()).add(r.getWorkload());
        }
        Set<String> allHours = new TreeSet<>(byHour.keySet());
        allHours.addAll(HOURS);
        return allHours.stream()
            .map(hour -> {
                Map<String, Object> m = new HashMap<>();
                m.put("hour", hour);
                List<Double> vals = byHour.get(hour);
                m.put("workload", vals != null && !vals.isEmpty()
                    ? Math.round(vals.stream().mapToDouble(Double::doubleValue).average().orElse(0))
                    : 0);
                return m;
            })
            .collect(Collectors.toList());
    }

    public List<Map<String, Object>> buildTrend(List<WorkloadRecord> records) {
        Map<String, List<Double>> byMonth = new HashMap<>();
        for (WorkloadRecord r : records) {
            if (r.getDate() == null) continue;
            int y = r.getDate().getYear();
            int m = r.getDate().getMonthValue() - 1;
            String key = y + "-" + m;
            byMonth.computeIfAbsent(key, k -> new ArrayList<>()).add(r.getWorkload());
        }
        List<Map<String, Object>> data = byMonth.entrySet().stream()
            .sorted(Map.Entry.comparingByKey())
            .skip(Math.max(0, byMonth.size() - 8))
            .map(e -> {
                String[] parts = e.getKey().split("-");
                int monthIdx = Integer.parseInt(parts[1]);
                double avg = e.getValue().stream().mapToDouble(Double::doubleValue).average().orElse(0);
                Map<String, Object> row = new HashMap<>();
                row.put("month", MONTH_NAMES[monthIdx]);
                row.put("actual", Math.round(avg));
                row.put("predicted", Math.round(avg));
                return row;
            })
            .collect(Collectors.toList());
        if (data.isEmpty()) {
            LocalDate now = LocalDate.now();
            for (int i = 6; i >= 0; i--) {
                LocalDate d = now.minusMonths(i);
                Map<String, Object> row = new HashMap<>();
                row.put("month", MONTH_NAMES[d.getMonthValue() - 1]);
                row.put("actual", 0);
                row.put("predicted", 0);
                data.add(row);
            }
        }
        return data;
    }
}
