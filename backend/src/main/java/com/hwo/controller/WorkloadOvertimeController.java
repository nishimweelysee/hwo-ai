package com.hwo.controller;

import com.hwo.entity.WellnessRecord;
import com.hwo.repository.WellnessRecordRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/workload")
public class WorkloadOvertimeController {

    private final WellnessRecordRepository wellnessRecordRepository;

    public WorkloadOvertimeController(WellnessRecordRepository wellnessRecordRepository) {
        this.wellnessRecordRepository = wellnessRecordRepository;
    }

    @GetMapping("/overtime")
    public ResponseEntity<List<Map<String, Object>>> getOvertime() {
        List<WellnessRecord> records = wellnessRecordRepository.findAllWithStaffAndDepartment();
        Map<String, List<WellnessRecord>> byDept = new HashMap<>();
        for (WellnessRecord r : records) {
            String dept = "Unknown";
            if (r.getStaff() != null && r.getStaff().getDepartment() != null) {
                dept = r.getStaff().getDepartment().getName();
            }
            byDept.computeIfAbsent(dept, k -> new ArrayList<>()).add(r);
        }
        List<Map<String, Object>> data = byDept.entrySet().stream()
            .map(e -> {
                double overtime = e.getValue().stream().mapToDouble(WellnessRecord::getOvertime).sum();
                long undertime = e.getValue().stream().filter(w -> w.getScore() != null && w.getScore() < 50).count();
                Map<String, Object> m = new HashMap<>();
                m.put("department", e.getKey());
                m.put("overtime", Math.round(overtime * 10) / 10.0);
                m.put("undertime", undertime);
                m.put("staffCount", e.getValue().size());
                return m;
            })
            .collect(Collectors.toList());
        return ResponseEntity.ok(data);
    }
}
