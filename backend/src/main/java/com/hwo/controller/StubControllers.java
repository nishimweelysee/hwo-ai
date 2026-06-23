package com.hwo.controller;

import com.hwo.entity.Department;
import com.hwo.entity.Schedule;
import com.hwo.entity.Staff;
import com.hwo.entity.WellnessIntervention;
import com.hwo.repository.*;
import com.hwo.service.CurrentUserService;
import com.hwo.service.IntegrationService;
import com.hwo.service.ReportService;
import com.hwo.service.SchedulingService;
import com.hwo.service.SettingsService;
import com.hwo.service.WellnessService;
import com.hwo.web.PermissionResponses;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api")
public class StubControllers {

    private final DepartmentRepository departmentRepository;
    private final StaffRepository staffRepository;
    private final UserRepository userRepository;
    private final ScheduleRepository scheduleRepository;
    private final WellnessInterventionRepository wellnessInterventionRepository;
    private final WorkloadRecordRepository workloadRecordRepository;
    private final AuditLogRepository auditLogRepository;
    private final SettingsService settingsService;
    private final IntegrationService integrationService;
    private final ReportService reportService;
    private final WellnessService wellnessService;
    private final CurrentUserService currentUserService;
    private final SchedulingService schedulingService;

    public StubControllers(DepartmentRepository departmentRepository,
                           StaffRepository staffRepository,
                           UserRepository userRepository,
                           ScheduleRepository scheduleRepository,
                           WellnessInterventionRepository wellnessInterventionRepository,
                           WorkloadRecordRepository workloadRecordRepository,
                           AuditLogRepository auditLogRepository,
                           SettingsService settingsService,
                           IntegrationService integrationService,
                           ReportService reportService,
                           WellnessService wellnessService,
                           CurrentUserService currentUserService,
                           SchedulingService schedulingService) {
        this.departmentRepository = departmentRepository;
        this.staffRepository = staffRepository;
        this.userRepository = userRepository;
        this.scheduleRepository = scheduleRepository;
        this.wellnessInterventionRepository = wellnessInterventionRepository;
        this.workloadRecordRepository = workloadRecordRepository;
        this.auditLogRepository = auditLogRepository;
        this.settingsService = settingsService;
        this.integrationService = integrationService;
        this.reportService = reportService;
        this.wellnessService = wellnessService;
        this.currentUserService = currentUserService;
        this.schedulingService = schedulingService;
    }

    @GetMapping("/dashboard/heatmap")
    public ResponseEntity<List<Map<String, Object>>> heatmap() {
        return ResponseEntity.ok(departmentRepository.findAll().stream()
            .map(d -> {
                int workload = (int) Math.round(d.getWorkload());
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("department", d.getName());
                row.put("Day", workload);
                row.put("Evening", Math.max(0, workload - 8));
                row.put("Night", Math.max(0, workload - 15));
                return row;
            })
            .collect(Collectors.toList()));
    }

    @PostMapping("/dashboard/share")
    public ResponseEntity<?> share(@RequestBody Map<String, ?> body) {
        return ResponseEntity.ok(Map.of("success", true));
    }

    @GetMapping("/reports")
    public ResponseEntity<List<Map<String, Object>>> reports() {
        return ResponseEntity.ok(reportService.listReports());
    }

    @GetMapping("/reports/benchmark")
    public ResponseEntity<Map<String, Object>> benchmark() {
        return ResponseEntity.ok(reportService.benchmark());
    }

    @PostMapping("/reports/generate")
    public ResponseEntity<?> generateReport(@RequestBody Map<String, ?> body) {
        return reportService.generateReport(body);
    }

    @PostMapping("/reports/custom")
    public ResponseEntity<?> customReport(@RequestBody Map<String, ?> body) {
        return reportService.customReport(body);
    }

    @PostMapping("/reports/executive-summary")
    public ResponseEntity<?> executiveSummary() {
        return ResponseEntity.ok(reportService.executiveSummary());
    }

    @GetMapping("/scheduled-reports")
    public ResponseEntity<List<Map<String, Object>>> scheduledReports() {
        return ResponseEntity.ok(reportService.listScheduledReports());
    }

    @PostMapping("/scheduled-reports")
    public ResponseEntity<?> createScheduledReport(@RequestBody Map<String, ?> body) {
        return ResponseEntity.ok(reportService.createScheduledReport(body));
    }

    @GetMapping("/scheduling/conflicts")
    public ResponseEntity<Map<String, Object>> conflicts(@RequestParam(required = false) String date) {
        LocalDate d = date != null ? LocalDate.parse(date) : LocalDate.now();
        return ResponseEntity.ok(Map.of("conflicts", schedulingService.detectConflicts(d)));
    }

    @GetMapping("/scheduling/constraints")
    public ResponseEntity<Map<String, Object>> constraints() {
        return ResponseEntity.ok(Map.of("constraints", settingsService.getSchedulingConstraints()));
    }

    @PatchMapping("/scheduling/constraints")
    public ResponseEntity<?> updateConstraints(@RequestBody Map<String, ?> body) {
        if (!currentUserService.canManageSettings()) {
            return PermissionResponses.settingsRequired();
        }
        Map<String, Object> updated = settingsService.updateSection("scheduling", body);
        return ResponseEntity.ok(Map.of("success", true, "constraints", updated));
    }

    @GetMapping("/scheduling/preferences")
    public ResponseEntity<Map<String, Object>> preferences() {
        List<String> shiftTypes = settingsService.getShiftTypes();
        String defaultShift = shiftTypes.isEmpty() ? "Day" : shiftTypes.get(0);
        Map<String, Map<String, Object>> stored = settingsService.getStaffSchedulingPreferences();
        List<com.hwo.entity.User> linkedUsers = userRepository.findByStaffIdIsNotNull();
        Set<String> staffIds = linkedUsers.stream()
            .map(com.hwo.entity.User::getStaffId)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
        Map<String, Staff> staffById = staffRepository.findAllById(staffIds).stream()
            .collect(Collectors.toMap(Staff::getId, s -> s, (a, b) -> a));

        List<Map<String, Object>> prefs = linkedUsers.stream()
            .map(user -> {
                if (user.getStaffId() == null) return null;
                Staff staff = staffById.get(user.getStaffId());
                if (staff == null) return null;
                Map<String, Object> saved = stored.get(staff.getId());
                List<String> preferredShifts = defaultShiftList(saved, "preferredShifts", defaultShift);
                List<String> avoidDates = defaultStringList(saved, "avoidDates");
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("staffId", staff.getId());
                row.put("userId", user.getId());
                row.put("email", user.getEmail());
                row.put("staffName", staff.getName());
                row.put("preferredShifts", preferredShifts);
                row.put("avoidDates", avoidDates);
                return row;
            })
            .filter(Objects::nonNull)
            .collect(Collectors.toList());
        return ResponseEntity.ok(Map.of("preferences", prefs, "shiftTypes", shiftTypes));
    }

    @PostMapping("/scheduling/preferences")
    public ResponseEntity<?> createPreferences(@RequestBody Map<String, ?> body) {
        if (!currentUserService.canManageSettings()) {
            return PermissionResponses.settingsRequired();
        }
        return updatePreferences(body);
    }

    @PatchMapping("/scheduling/preferences")
    public ResponseEntity<?> updatePreferences(@RequestBody Map<String, ?> body) {
        if (!currentUserService.canManageSettings()) {
            return PermissionResponses.settingsRequired();
        }
        Object staffIdValue = body.get("staffId");
        if (staffIdValue == null || String.valueOf(staffIdValue).isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Staff ID is required"));
        }
        String staffId = String.valueOf(staffIdValue);
        if (staffRepository.findById(staffId).isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Staff member not found"));
        }
        List<String> preferredShifts = toStringList(body.get("preferredShifts"));
        List<String> avoidDates = toStringList(body.get("avoidDates"));
        settingsService.updateStaffSchedulingPreference(staffId, preferredShifts, avoidDates);
        return ResponseEntity.ok(Map.of(
            "success", true,
            "preference", Map.of("staffId", staffId, "preferredShifts", preferredShifts, "avoidDates", avoidDates)
        ));
    }

    @SuppressWarnings("unchecked")
    private List<String> defaultShiftList(Map<String, Object> saved, String key, String fallback) {
        if (saved == null) return List.of(fallback);
        Object value = saved.get(key);
        if (value instanceof List<?> list && !list.isEmpty()) {
            return list.stream().map(String::valueOf).toList();
        }
        return List.of(fallback);
    }

    @SuppressWarnings("unchecked")
    private List<String> defaultStringList(Map<String, Object> saved, String key) {
        if (saved == null) return List.of();
        Object value = saved.get(key);
        if (value instanceof List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        return List.of();
    }

    private List<String> toStringList(Object value) {
        if (value instanceof List<?> list) {
            return list.stream().map(String::valueOf).filter(s -> !s.isBlank()).toList();
        }
        return List.of();
    }

    @GetMapping("/data-settings")
    public ResponseEntity<Map<String, Object>> dataSettings() {
        return ResponseEntity.ok(settingsService.getSection("data"));
    }

    @PatchMapping("/data-settings")
    public ResponseEntity<?> updateDataSettings(@RequestBody Map<String, ?> body) {
        if (!currentUserService.canManageData()) {
            return PermissionResponses.dataManageRequired();
        }
        Map<String, Object> updated = settingsService.updateSection("data", body);
        return ResponseEntity.ok(Map.of("success", true, "settings", updated));
    }

    @GetMapping("/data-settings/lineage")
    public ResponseEntity<Map<String, Object>> lineage() {
        long workloadCount = workloadRecordRepository.count();
        long staffCount = staffRepository.count();
        long manualImportCount = auditLogRepository.countByType("import");
        return ResponseEntity.ok(integrationService.buildLineage(workloadCount, staffCount, manualImportCount));
    }

    @GetMapping("/data-settings/archives")
    public ResponseEntity<Map<String, Object>> archives() {
        return ResponseEntity.ok(reportService.archives());
    }

    @GetMapping("/user-activity")
    public ResponseEntity<List<Map<String, Object>>> userActivity(@RequestParam(required = false) Integer limit) {
        int max = limit != null ? limit : 10;
        return ResponseEntity.ok(auditLogRepository.findAll().stream()
            .sorted(Comparator.comparing(a -> a.getCreatedAt() != null ? a.getCreatedAt() : LocalDateTime.MIN, Comparator.reverseOrder()))
            .limit(max)
            .map(a -> {
                String ts = a.getCreatedAt() != null ? a.getCreatedAt().toString() : "";
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("action", a.getAction());
                row.put("resource", a.getResource() != null ? a.getResource() : "");
                row.put("details", a.getDetails() != null ? a.getDetails() : "");
                row.put("timestamp", ts);
                row.put("createdAt", ts);
                return row;
            })
            .collect(Collectors.toList()));
    }


    @GetMapping("/audit/anomalies")
    public ResponseEntity<Map<String, Object>> auditAnomalies() {
        var logs = auditLogRepository.findAll();
        long suspiciousLogins = logs.stream()
            .filter(a -> "login".equals(a.getAction()))
            .filter(a -> a.getDetails() != null && a.getDetails().toLowerCase().contains("fail"))
            .count();
        long unusualExports = logs.stream().filter(a -> "export".equals(a.getAction())).count();
        List<Map<String, Object>> anomalies = new ArrayList<>();
        if (suspiciousLogins > 0) {
            anomalies.add(Map.of("type", "failed_login", "count", suspiciousLogins, "severity", "medium"));
        }
        if (unusualExports > 5) {
            anomalies.add(Map.of("type", "export_spike", "count", unusualExports, "severity", "low"));
        }
        return ResponseEntity.ok(Map.of(
            "anomalies", anomalies,
            "suspiciousLogins", suspiciousLogins,
            "unusualExports", unusualExports
        ));
    }

    @GetMapping("/audit/export")
    public ResponseEntity<String> auditExport(@RequestParam(required = false) String format) {
        if (!currentUserService.canExportAudit()) {
            return ResponseEntity.status(403).body("Permission denied: audit:export required");
        }
        StringBuilder csv = new StringBuilder("timestamp,action,type,resource,details\n");
        auditLogRepository.findAll().forEach(a ->
            csv.append(a.getCreatedAt()).append(",")
                .append(a.getAction()).append(",")
                .append(a.getType()).append(",")
                .append(a.getResource()).append(",")
                .append(a.getDetails()).append("\n"));
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"audit-export." + ("csv".equals(format) ? "csv" : "csv") + "\"")
            .contentType(MediaType.parseMediaType("text/csv"))
            .body(csv.toString());
    }
}
