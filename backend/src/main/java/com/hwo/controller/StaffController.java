package com.hwo.controller;

import com.hwo.entity.Department;
import com.hwo.entity.Staff;
import com.hwo.entity.User;
import com.hwo.entity.WellnessRecord;
import com.hwo.repository.DepartmentRepository;
import com.hwo.repository.StaffRepository;
import com.hwo.repository.UserRepository;
import com.hwo.repository.WellnessRecordRepository;
import com.hwo.service.StaffRoleService;
import com.hwo.service.WellnessService;
import com.hwo.service.CurrentUserService;
import com.hwo.web.PermissionResponses;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api")
public class StaffController {

    private final StaffRepository staffRepository;
    private final StaffRoleService staffRoleService;
    private final DepartmentRepository departmentRepository;
    private final WellnessRecordRepository wellnessRecordRepository;
    private final UserRepository userRepository;
    private final WellnessService wellnessService;
    private final CurrentUserService currentUserService;

    public StaffController(StaffRepository staffRepository,
                           StaffRoleService staffRoleService,
                           DepartmentRepository departmentRepository,
                           WellnessRecordRepository wellnessRecordRepository,
                           UserRepository userRepository,
                           WellnessService wellnessService,
                           CurrentUserService currentUserService) {
        this.staffRepository = staffRepository;
        this.staffRoleService = staffRoleService;
        this.departmentRepository = departmentRepository;
        this.wellnessRecordRepository = wellnessRecordRepository;
        this.userRepository = userRepository;
        this.wellnessService = wellnessService;
        this.currentUserService = currentUserService;
    }

    @GetMapping("/staff")
    public ResponseEntity<?> getStaff(
            @RequestParam(required = false) String departmentId,
            @RequestParam(required = false) Boolean wellness) {
        List<Staff> staff = departmentId != null
            ? staffRepository.findByDepartmentId(departmentId)
            : staffRepository.findAll();

        if (Boolean.TRUE.equals(wellness)) {
            return ResponseEntity.ok(staff.stream()
                .map(this::toWellnessStaffDto)
                .collect(Collectors.toList()));
        }
        Map<String, String> departmentNames = departmentRepository.findAllOrderByName().stream()
            .collect(Collectors.toMap(Department::getId, Department::getName, (a, b) -> a));
        return ResponseEntity.ok(staff.stream()
            .map(s -> toStaffDto(s, departmentNames))
            .collect(Collectors.toList()));
    }

    @GetMapping("/staff/options")
    public ResponseEntity<Map<String, Object>> staffOptions(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String departmentId,
            @RequestParam(defaultValue = "200") int limit) {
        int capped = Math.min(Math.max(limit, 1), 500);
        String q = search != null ? search.trim() : "";
        Map<String, String> departmentNames = departmentRepository.findAllOrderByName().stream()
            .collect(Collectors.toMap(Department::getId, Department::getName, (a, b) -> a));
        List<Map<String, Object>> options = staffRepository
            .searchOptions(
                departmentId != null && !departmentId.isBlank() ? departmentId : null,
                q.isEmpty() ? null : q,
                org.springframework.data.domain.PageRequest.of(0, capped)
            )
            .stream()
            .map(s -> toStaffDto(s, departmentNames))
            .collect(Collectors.toList());
        return ResponseEntity.ok(Map.of(
            "options", options,
            "limit", capped,
            "truncated", options.size() >= capped
        ));
    }

    @PostMapping("/staff")
    public ResponseEntity<?> createStaff(@RequestBody Map<String, Object> body) {
        if (!currentUserService.canManageData()) {
            return PermissionResponses.dataManageRequired();
        }
        String name = (String) body.get("name");
        String role = (String) body.get("role");
        String departmentId = (String) body.get("departmentId");
        String email = (String) body.get("email");
        if (name == null || role == null || departmentId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Name, role, departmentId required"));
        }
        if (departmentRepository.findById(departmentId).isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid department"));
        }
        staffRoleService.requireValidRole(role);

        Staff staff = new Staff();
        staff.setId(UUID.randomUUID().toString());
        staff.setName(name);
        staff.setRole(staffRoleService.resolveRoleName(role));
        staff.setDepartmentId(departmentId);
        if (email == null || email.isBlank()) {
            email = name.toLowerCase().replaceAll("[^a-z0-9]+", ".").replaceAll("^\\.+|\\.+$", "") + "@hospital.org";
        }
        staff.setEmail(email);
        staff = staffRepository.save(staff);
        wellnessService.linkStaffUser(staff);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id", staff.getId());
        response.put("name", staff.getName());
        response.put("role", staff.getRole());
        response.put("departmentId", staff.getDepartmentId());
        response.put("email", staff.getEmail());
        userRepository.findByStaffId(staff.getId()).ifPresent(user -> {
            response.put("userId", user.getId());
            response.put("userEmail", user.getEmail());
        });
        return ResponseEntity.ok(response);
    }

    private Map<String, Object> toStaffDto(Staff staff) {
        return toStaffDto(staff, Map.of());
    }

    private Map<String, Object> toStaffDto(Staff staff, Map<String, String> departmentNames) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", staff.getId());
        row.put("name", staff.getName());
        row.put("email", staff.getEmail());
        row.put("role", staff.getRole());
        row.put("departmentId", staff.getDepartmentId());
        if (staff.getDepartmentId() != null) {
            String name = departmentNames.get(staff.getDepartmentId());
            if (name != null) {
                row.put("department", name);
            }
        }
        return row;
    }

    private Map<String, Object> toWellnessStaffDto(Staff staff) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", staff.getId());
        row.put("name", staff.getName());
        row.put("role", staff.getRole());
        Department dept = staff.getDepartmentId() != null
            ? departmentRepository.findById(staff.getDepartmentId()).orElse(null) : null;
        row.put("department", dept != null ? Map.of("name", dept.getName()) : Map.of("name", ""));

        List<WellnessRecord> records = wellnessRecordRepository.findTop1ByStaffIdOrderByDateDesc(staff.getId());
        if (!records.isEmpty()) {
            WellnessRecord record = records.get(0);
            row.put("wellness", List.of(Map.of(
                "riskLevel", record.getRiskLevel() != null ? record.getRiskLevel() : "low",
                "overtime", record.getOvertime()
            )));
        } else {
            row.put("wellness", List.of());
        }

        userRepository.findByStaffId(staff.getId()).ifPresent(user -> {
            row.put("userId", user.getId());
            row.put("email", user.getEmail());
        });
        return row;
    }
}
