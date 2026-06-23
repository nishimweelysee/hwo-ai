package com.hwo.controller;

import com.hwo.entity.WellnessRecord;
import com.hwo.repository.WellnessRecordRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.*;

@RestController
@RequestMapping("/api/wellness")
public class WellnessTrendController {

    private static final String[] MONTH_NAMES = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};

    private final WellnessRecordRepository wellnessRecordRepository;

    public WellnessTrendController(WellnessRecordRepository wellnessRecordRepository) {
        this.wellnessRecordRepository = wellnessRecordRepository;
    }

    @GetMapping("/trend")
    public ResponseEntity<Map<String, Object>> getTrend() {
        List<WellnessRecord> records = wellnessRecordRepository.findAll();
        Map<String, List<Double>> byMonth = new TreeMap<>();
        for (WellnessRecord r : records) {
            if (r.getScore() != null && r.getDate() != null) {
                int m = r.getDate().getMonthValue() - 1;
                String key = MONTH_NAMES[m];
                byMonth.computeIfAbsent(key, k -> new ArrayList<>()).add(r.getScore());
            }
        }

        List<Map<String, Object>> trendSeries = new ArrayList<>();
        for (Map.Entry<String, List<Double>> entry : byMonth.entrySet()) {
            double avg = entry.getValue().stream().mapToDouble(Double::doubleValue).average().orElse(0);
            trendSeries.add(Map.of("month", entry.getKey(), "score", Math.round(avg)));
        }
        if (trendSeries.isEmpty()) {
            trendSeries.add(Map.of("month", MONTH_NAMES[java.time.LocalDate.now().getMonthValue() - 1], "score", 75));
        }

        double avgScore = records.stream()
            .filter(r -> r.getScore() != null)
            .mapToDouble(WellnessRecord::getScore)
            .average().orElse(75);
        String trendLabel = avgScore >= 70 ? "improving" : avgScore >= 50 ? "stable" : "declining";

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("trend", trendSeries);
        result.put("trendLabel", trendLabel);
        result.put("avgScore", Math.round(avgScore * 10) / 10.0);
        return ResponseEntity.ok(result);
    }
}
