package com.hwo.controller;

import com.hwo.repository.DepartmentRepository;
import com.hwo.repository.StaffRepository;
import com.hwo.repository.WorkloadRecordRepository;
import com.hwo.repository.WellnessRecordRepository;
import com.hwo.service.SettingsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/workload")
public class WorkloadSummaryController {

    private final DepartmentRepository departmentRepository;
    private final StaffRepository staffRepository;
    private final WorkloadRecordRepository workloadRecordRepository;
    private final WellnessRecordRepository wellnessRecordRepository;
    private final SettingsService settingsService;

    public WorkloadSummaryController(DepartmentRepository departmentRepository,
                                    StaffRepository staffRepository,
                                    WorkloadRecordRepository workloadRecordRepository,
                                    WellnessRecordRepository wellnessRecordRepository,
                                    SettingsService settingsService) {
        this.departmentRepository = departmentRepository;
        this.staffRepository = staffRepository;
        this.workloadRecordRepository = workloadRecordRepository;
        this.wellnessRecordRepository = wellnessRecordRepository;
        this.settingsService = settingsService;
    }

    @GetMapping("/summary")
    public ResponseEntity<Map<String, Object>> getSummary() {
        var departments = departmentRepository.findAll();
        var wellness = wellnessRecordRepository.findLatestPerStaff();

        long totalStaff = staffRepository.count();
        double avgWorkload = departments.isEmpty() ? 0
            : departments.stream().mapToDouble(d -> d.getWorkload()).average().orElse(0);
        int alertThreshold = settingsService.getInt("workload", "alertThreshold");
        int overtimeWarningHours = settingsService.getInt("workload", "overtimeWarningHours");
        long overtimeCount = wellness.stream().filter(w -> w.getOvertime() > overtimeWarningHours).count();
        int overtimeRate = totalStaff > 0 ? (int) Math.round((overtimeCount * 100.0) / totalStaff) : 0;
        int balanceScore = (int) Math.min(100, Math.round(100 - Math.abs(avgWorkload - alertThreshold) * 0.5));

        double avgPatient = workloadRecordRepository.findAllByOrderByDateAsc().stream()
            .filter(r -> r.getPatientVolume() != null)
            .mapToInt(r -> r.getPatientVolume())
            .average().orElse(0);
        String ratio = totalStaff > 0 && avgPatient > 0
            ? "1:" + String.format("%.1f", avgPatient / totalStaff)
            : "—";

        Map<String, Object> result = new HashMap<>();
        result.put("overallRatio", ratio);
        result.put("balanceScore", balanceScore);
        result.put("overtimeRate", overtimeRate);
        result.put("totalStaff", totalStaff);
        result.put("avgWorkload", avgWorkload);
        return ResponseEntity.ok(result);
    }
}
