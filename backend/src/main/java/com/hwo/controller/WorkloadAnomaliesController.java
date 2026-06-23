package com.hwo.controller;

import com.hwo.entity.WorkloadRecord;
import com.hwo.repository.WorkloadRecordRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/workload")
public class WorkloadAnomaliesController {

    private final WorkloadRecordRepository workloadRecordRepository;

    public WorkloadAnomaliesController(WorkloadRecordRepository workloadRecordRepository) {
        this.workloadRecordRepository = workloadRecordRepository;
    }

    @GetMapping("/anomalies")
    public ResponseEntity<Map<String, Object>> getAnomalies() {
        List<WorkloadRecord> records = workloadRecordRepository.findAllWithDepartment();
        if (records.size() < 3) {
            return ResponseEntity.ok(Map.of("anomalies", List.of()));
        }
        final double mean = records.stream().mapToDouble(WorkloadRecord::getWorkload).average().orElse(0);
        double variance = records.stream().mapToDouble(r -> Math.pow(r.getWorkload() - mean, 2)).average().orElse(0);
        final double std = Math.max(Math.sqrt(variance), 1.0);
        final double threshold = 2 * std;
        List<Map<String, Object>> anomalies = records.stream()
            .filter(r -> Math.abs(r.getWorkload() - mean) > threshold)
            .limit(20)
            .map(r -> {
                Map<String, Object> m = new HashMap<>();
                m.put("date", r.getDate().toLocalDate().toString());
                m.put("department", r.getDepartment() != null ? r.getDepartment().getName() : "");
                m.put("workload", r.getWorkload());
                m.put("deviation", Math.round((Math.abs(r.getWorkload() - mean) / std) * 100) / 100.0);
                return m;
            })
            .collect(Collectors.toList());
        return ResponseEntity.ok(Map.of("anomalies", anomalies));
    }
}
