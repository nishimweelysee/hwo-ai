package com.hwo.controller;

import com.hwo.entity.Department;
import com.hwo.repository.DepartmentRepository;
import com.hwo.repository.StaffRepository;
import com.hwo.service.SettingsService;
import com.hwo.service.CurrentUserService;
import com.hwo.web.PermissionResponses;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/departments")
public class DepartmentController {

    private final DepartmentRepository departmentRepository;
    private final StaffRepository staffRepository;
    private final SettingsService settingsService;
    private final CurrentUserService currentUserService;

    public DepartmentController(DepartmentRepository departmentRepository, StaffRepository staffRepository,
                                SettingsService settingsService, CurrentUserService currentUserService) {
        this.departmentRepository = departmentRepository;
        this.staffRepository = staffRepository;
        this.settingsService = settingsService;
        this.currentUserService = currentUserService;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getDepartments() {
        Map<String, Long> staffCounts = staffRepository.countStaffGroupedByDepartment().stream()
            .collect(Collectors.toMap(
                row -> String.valueOf(row[0]),
                row -> ((Number) row[1]).longValue()
            ));
        return ResponseEntity.ok(departmentRepository.findAllOrderByName().stream()
            .map(department -> toMap(department, staffCounts))
            .collect(Collectors.toList()));
    }

    @PostMapping
    public ResponseEntity<?> createDepartment(@RequestBody Map<String, ?> body) {
        if (!currentUserService.canManageSettings()) {
            return PermissionResponses.settingsRequired();
        }
        String name = stringValue(body.get("name"));
        if (name == null || name.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Department name is required"));
        }
        if (departmentRepository.findAllOrderByName().stream().anyMatch(d -> name.equalsIgnoreCase(d.getName()))) {
            return ResponseEntity.badRequest().body(Map.of("error", "Department name already exists"));
        }

        Department department = new Department();
        department.setId(UUID.randomUUID().toString());
        department.setName(name.trim());
        department.setCode(resolveCode(body, name));
        department.setDescription(stringValue(body.get("description")));
        department.setActive(body.get("active") == null || Boolean.parseBoolean(String.valueOf(body.get("active"))));
        department.setWorkload(numberValue(body.get("targetWorkload"), settingsService.getInt("workload", "alertThreshold")));
        department.setStaffCount(0);
        departmentRepository.save(department);
        Map<String, Long> staffCounts = Map.of(department.getId(), 0L);
        return ResponseEntity.ok(toMap(department, staffCounts));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> updateDepartment(@PathVariable String id, @RequestBody Map<String, ?> body) {
        if (!currentUserService.canManageSettings()) {
            return PermissionResponses.settingsRequired();
        }
        return departmentRepository.findById(id)
            .map(department -> {
                if (body.containsKey("name")) {
                    String name = stringValue(body.get("name"));
                    if (name == null || name.isBlank()) {
                        return ResponseEntity.badRequest().body(Map.of("error", "Department name is required"));
                    }
                    department.setName(name.trim());
                }
                if (body.containsKey("code")) {
                    department.setCode(stringValue(body.get("code")));
                }
                if (body.containsKey("description")) {
                    department.setDescription(stringValue(body.get("description")));
                }
                if (body.containsKey("active")) {
                    department.setActive(Boolean.parseBoolean(String.valueOf(body.get("active"))));
                }
                if (body.containsKey("targetWorkload")) {
                    department.setWorkload(numberValue(body.get("targetWorkload"), department.getWorkload()));
                }
                departmentRepository.save(department);
                Map<String, Long> staffCounts = Map.of(
                    department.getId(),
                    staffRepository.countByDepartmentId(department.getId())
                );
                return ResponseEntity.ok(toMap(department, staffCounts));
            })
            .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteDepartment(@PathVariable String id) {
        if (!currentUserService.canManageSettings()) {
            return PermissionResponses.settingsRequired();
        }
        return departmentRepository.findById(id)
            .map(department -> {
                long assignedStaff = staffRepository.countByDepartmentId(id);
                if (assignedStaff > 0) {
                    return ResponseEntity.badRequest().body(Map.of(
                        "error", "Cannot delete department with assigned staff",
                        "staffCount", assignedStaff
                    ));
                }
                departmentRepository.delete(department);
                return ResponseEntity.ok(Map.of("success", true));
            })
            .orElse(ResponseEntity.notFound().build());
    }

    private Map<String, Object> toMap(Department department, Map<String, Long> staffCounts) {
        long actualStaff = staffCounts.getOrDefault(department.getId(), 0L);
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", department.getId());
        map.put("name", department.getName());
        map.put("code", department.getCode() != null ? department.getCode() : "");
        map.put("description", department.getDescription() != null ? department.getDescription() : "");
        map.put("active", department.isActive());
        map.put("staffCount", actualStaff);
        map.put("targetWorkload", department.getWorkload());
        map.put("workload", department.getWorkload());
        return map;
    }

    private String resolveCode(Map<String, ?> body, String name) {
        String code = stringValue(body.get("code"));
        if (code != null && !code.isBlank()) {
            return code.trim().toUpperCase();
        }
        String normalized = name.replaceAll("[^A-Za-z0-9]", "");
        if (normalized.isEmpty()) {
            return "DEPT";
        }
        return normalized.toUpperCase().substring(0, Math.min(6, normalized.length()));
    }

    private String stringValue(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private double numberValue(Object value, double fallback) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value != null) {
            try {
                return Double.parseDouble(String.valueOf(value));
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }
}
