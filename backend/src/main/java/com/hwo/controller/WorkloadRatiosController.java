package com.hwo.controller;

import com.hwo.entity.Department;
import com.hwo.entity.WorkloadRecord;
import com.hwo.repository.DepartmentRepository;
import com.hwo.service.SettingsService;
import com.hwo.service.WorkloadQueryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/workload")
public class WorkloadRatiosController {

    private final DepartmentRepository departmentRepository;
    private final WorkloadQueryService workloadQueryService;
    private final SettingsService settingsService;

    public WorkloadRatiosController(DepartmentRepository departmentRepository,
                                    WorkloadQueryService workloadQueryService,
                                    SettingsService settingsService) {
        this.departmentRepository = departmentRepository;
        this.workloadQueryService = workloadQueryService;
        this.settingsService = settingsService;
    }

    @GetMapping("/ratios")
    public ResponseEntity<Map<String, Object>> getRatios() {
        List<Department> departments = departmentRepository.findAll();
        List<WorkloadRecord> records = workloadQueryService.findAllOrdered();
        double ratioTarget = settingsService.getDouble("workload", "nursePatientRatioTarget");
        String targetLabel = "1:" + String.format("%.1f", ratioTarget);
        Map<String, List<WorkloadRecord>> byDept = records.stream().collect(Collectors.groupingBy(WorkloadRecord::getDepartmentId));
        List<Map<String, Object>> byDepartment = new ArrayList<>();
        int totalStaff = 0;
        double totalPatients = 0;
        int totalRecords = 0;
        for (Department d : departments) {
            List<WorkloadRecord> deptRecords = byDept.getOrDefault(d.getId(), List.of());
            double avgPatients = deptRecords.stream().filter(r -> r.getPatientVolume() != null).mapToInt(WorkloadRecord::getPatientVolume).average().orElse(0);
            int staffCount = d.getStaffCount();
            totalStaff += staffCount;
            totalPatients += deptRecords.stream().filter(r -> r.getPatientVolume() != null).mapToInt(WorkloadRecord::getPatientVolume).sum();
            totalRecords += deptRecords.size();
            double ratio = staffCount > 0 ? avgPatients / staffCount : 0;
            Map<String, Object> m = new HashMap<>();
            m.put("department", d.getName());
            m.put("staffCount", staffCount);
            m.put("avgPatientVolume", Math.round(avgPatients));
            m.put("staffToPatientRatio", "1:" + String.format("%.1f", ratio));
            m.put("target", targetLabel);
            m.put("status", ratio <= ratioTarget + 1 ? "within" : "exceeded");
            byDepartment.add(m);
        }
        double overallRatio = totalStaff > 0 && totalRecords > 0 ? (totalPatients / totalRecords) / totalStaff : 0;
        Map<String, Object> result = new HashMap<>();
        result.put("byDepartment", byDepartment);
        result.put("overall", Map.of("staffCount", totalStaff, "ratio", "1:" + String.format("%.1f", overallRatio), "target", targetLabel));
        return ResponseEntity.ok(result);
    }
}
