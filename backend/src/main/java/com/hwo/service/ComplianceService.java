package com.hwo.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hwo.entity.AuditLog;
import com.hwo.entity.ComplianceRecord;
import com.hwo.entity.Schedule;
import com.hwo.entity.Staff;
import com.hwo.repository.AuditLogRepository;
import com.hwo.repository.CertificationRepository;
import com.hwo.repository.ComplianceRecordRepository;
import com.hwo.repository.DepartmentRepository;
import com.hwo.repository.ScheduleRepository;
import com.hwo.repository.StaffRepository;
import com.hwo.repository.TrainingEnrollmentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ComplianceService {

    public static final String TYPE_REQUIREMENT_CHECK = "requirement_check";
    public static final String TYPE_SUBMISSION = "submission";
    public static final String TYPE_SCAN = "scan";
    private static final int MAX_ISSUE_DETAILS = 50;
    private static final int MAX_STORED_SCAN_ISSUES = 25;
    private static final int MAX_VARCHAR = 255;
    private static final long SNAPSHOT_CACHE_MS = 30_000;

    private volatile SnapshotCache snapshotCache;

    private final ComplianceRecordRepository complianceRecordRepository;
    private final CertificationRepository certificationRepository;
    private final StaffRepository staffRepository;
    private final ScheduleRepository scheduleRepository;
    private final DepartmentRepository departmentRepository;
    private final TrainingEnrollmentRepository trainingEnrollmentRepository;
    private final SettingsService settingsService;
    private final SchedulingService schedulingService;
    private final AuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper;

    public ComplianceService(ComplianceRecordRepository complianceRecordRepository,
                             CertificationRepository certificationRepository,
                             StaffRepository staffRepository,
                             ScheduleRepository scheduleRepository,
                             DepartmentRepository departmentRepository,
                             TrainingEnrollmentRepository trainingEnrollmentRepository,
                             SettingsService settingsService,
                             SchedulingService schedulingService,
                             AuditLogRepository auditLogRepository,
                             ObjectMapper objectMapper) {
        this.complianceRecordRepository = complianceRecordRepository;
        this.certificationRepository = certificationRepository;
        this.staffRepository = staffRepository;
        this.scheduleRepository = scheduleRepository;
        this.departmentRepository = departmentRepository;
        this.trainingEnrollmentRepository = trainingEnrollmentRepository;
        this.settingsService = settingsService;
        this.schedulingService = schedulingService;
        this.auditLogRepository = auditLogRepository;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> getOverview(boolean canSubmit, String recordType) {
        LiveSnapshot snapshot = getCachedSnapshot(LocalDate.now());
        Map<String, Object> overview = new LinkedHashMap<>();
        overview.put("canSubmit", canSubmit);
        overview.put("schedulingRules", Map.of(
            "maxHoursPerWeek", settingsService.getInt("scheduling", "maxHoursPerWeek"),
            "restBetweenShifts", settingsService.getInt("scheduling", "restBetweenShifts"),
            "skillMixRequired", settingsService.getBoolean("scheduling", "skillMixRequired", true),
            "respectPreferences", settingsService.getBoolean("scheduling", "respectPreferences", true)
        ));
        overview.put("counts", Map.of(
            "staff", staffRepository.count(),
            "departments", departmentRepository.count(),
            "queuedSubmissions", countQueuedSubmissions()
        ));
        overview.put("templates", listTemplatesInternal());
        overview.put("submissionForms", buildSubmissionStatus());
        overview.put("dashboard", buildDashboardPayload(snapshot));
        overview.put("history", listHistory(null, null, recordType).stream().limit(100).toList());
        complianceRecordRepository.findFirstByRecordTypeOrderByRecordedAtDesc(TYPE_SCAN)
            .ifPresent(scan -> overview.put("lastScan", toHistoryDto(scan)));
        return overview;
    }

    public Map<String, Object> getMeta(boolean canSubmit) {
        LiveSnapshot snapshot = getCachedSnapshot(LocalDate.now());
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("canSubmit", canSubmit);
        meta.put("templates", listTemplates());
        meta.put("submissionForms", listSubmissionForms());
        meta.put("schedulingRules", Map.of(
            "maxHoursPerWeek", settingsService.getInt("scheduling", "maxHoursPerWeek"),
            "restBetweenShifts", settingsService.getInt("scheduling", "restBetweenShifts"),
            "skillMixRequired", settingsService.getBoolean("scheduling", "skillMixRequired", true),
            "respectPreferences", settingsService.getBoolean("scheduling", "respectPreferences", true)
        ));
        meta.put("counts", Map.of(
            "staff", staffRepository.count(),
            "departments", departmentRepository.count(),
            "violations", snapshot.violationRequirements(),
            "warnings", snapshot.warningRequirements(),
            "staffIssues", snapshot.totalIssueCount(),
            "pendingActions", snapshot.totalIssueCount() + snapshot.warningRequirements() + countQueuedSubmissions(),
            "queuedSubmissions", countQueuedSubmissions()
        ));
        complianceRecordRepository.findFirstByRecordTypeOrderByRecordedAtDesc(TYPE_SCAN)
            .ifPresent(scan -> meta.put("lastScan", toHistoryDto(scan)));
        return meta;
    }

    public Map<String, Object> getDashboard() {
        return buildDashboardPayload(getCachedSnapshot(LocalDate.now()));
    }

    private Map<String, Object> buildDashboardPayload(LiveSnapshot snapshot) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", snapshot.requirements());
        result.put("issues", snapshot.issues());
        result.put("issuesTruncated", snapshot.issuesTruncated());
        result.put("totalIssues", snapshot.totalIssueCount());
        result.put("staffIssues", snapshot.totalIssueCount());
        result.put("violations", snapshot.violationRequirements());
        result.put("warnings", snapshot.warningRequirements());
        result.put("failedRequirements", snapshot.violationRequirements());
        result.put("warningRequirements", snapshot.warningRequirements());
        result.put("complianceScore", snapshot.complianceScore());
        result.put("issueBreakdown", snapshot.issueBreakdown());
        result.put("pendingActions", snapshot.totalIssueCount() + snapshot.warningRequirements()
            + countQueuedSubmissions());
        result.put("overallStatus", snapshot.overallStatus());
        result.put("submissions", buildSubmissionStatus());
        result.put("conflictsToday", snapshot.conflictsToday());
        return result;
    }

    @Transactional
    public Map<String, Object> runScan() {
        LocalDate today = LocalDate.now();
        invalidateSnapshotCache();
        LiveSnapshot snapshot = computeLiveSnapshot(today);
        LocalDateTime now = LocalDateTime.now();

        for (Map<String, Object> requirement : snapshot.requirements()) {
            ComplianceRecord record = new ComplianceRecord();
            record.setId(UUID.randomUUID().toString());
            record.setRecordType(TYPE_REQUIREMENT_CHECK);
            record.setCategory(truncate(stringValue(requirement.get("category")), 64));
            record.setRequirement(truncate(stringValue(requirement.get("requirement")), MAX_VARCHAR));
            record.setStatus(truncate(stringValue(requirement.get("status")), 32));
            record.setValue(truncate(stringValue(requirement.get("value")), MAX_VARCHAR));
            record.setRecordedAt(now);
            record.setDetails(serializeScanIssues(requirement.get("issues"), requirement.get("totalIssues")));
            complianceRecordRepository.save(record);
        }

        ComplianceRecord scan = new ComplianceRecord();
        scan.setId(UUID.randomUUID().toString());
        scan.setRecordType(TYPE_SCAN);
        scan.setRequirement("Compliance scan");
        scan.setStatus(snapshot.overallStatus().equals("compliant") ? "compliant"
            : snapshot.overallStatus().equals("attention") ? "warning" : "violation");
        scan.setValue(snapshot.violationRequirements() + " failed requirements, "
            + snapshot.totalIssueCount() + " staff issues, "
            + snapshot.warningRequirements() + " warnings");
        scan.setRecordedAt(now);
        complianceRecordRepository.save(scan);

        invalidateSnapshotCache();
        logAudit("Compliance scan", snapshot.violationRequirements() + " failed requirements, "
            + snapshot.totalIssueCount() + " staff issues");

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("message", "Compliance scan saved — " + snapshot.requirements().size() + " requirements checked");
        result.put("violations", snapshot.violationRequirements());
        result.put("warnings", snapshot.warningRequirements());
        result.put("staffIssues", snapshot.totalIssueCount());
        result.put("scannedAt", now.toString());
        result.put("requirements", snapshot.requirements());
        return result;
    }

    public List<Map<String, Object>> listHistory(String startDate, String endDate, String recordType) {
        List<ComplianceRecord> records;
        if (startDate != null && !startDate.isBlank() && endDate != null && !endDate.isBlank()) {
            LocalDateTime start = LocalDate.parse(startDate).atStartOfDay();
            LocalDateTime end = LocalDate.parse(endDate).plusDays(1).atStartOfDay();
            if (recordType != null && !recordType.isBlank()) {
                records = complianceRecordRepository.findByRecordTypeAndRecordedAtBetweenOrderByRecordedAtDesc(
                    recordType, start, end);
            } else {
                records = complianceRecordRepository.findByRecordedAtBetweenOrderByRecordedAtDesc(start, end);
            }
        } else if (recordType != null && !recordType.isBlank()) {
            records = complianceRecordRepository.findByRecordTypeOrderByRecordedAtDesc(recordType);
        } else {
            records = complianceRecordRepository.findTop20ByOrderByRecordedAtDesc();
        }
        return records.stream().limit(100).map(this::toHistoryDto).collect(Collectors.toList());
    }

    public List<Map<String, Object>> listTemplates() {
        return listTemplatesInternal();
    }

    @Transactional
    public Map<String, Object> submitReport(String submissionId, String templateId, String submittedBy) {
        TemplateDef template = resolveTemplate(submissionId, templateId);
        LiveSnapshot snapshot = getCachedSnapshot(LocalDate.now());

        ComplianceRecord record = new ComplianceRecord();
        record.setId(UUID.randomUUID().toString());
        record.setRecordType(TYPE_SUBMISSION);
        record.setSubmissionId(template.submissionId());
        record.setRequirement(template.name());
        record.setRegulator(template.regulator());
        record.setStatus("queued");
        record.setSubmittedBy(submittedBy);
        record.setValue(truncate(buildSubmissionSummary(snapshot), MAX_VARCHAR));
        record.setRecordedAt(LocalDateTime.now());
        try {
            record.setDetails(objectMapper.writeValueAsString(Map.of(
                "templateId", template.id(),
                "failedRequirements", snapshot.violationRequirements(),
                "warningRequirements", snapshot.warningRequirements(),
                "staffIssues", snapshot.totalIssueCount(),
                "staffCount", staffRepository.count(),
                "departmentCount", departmentRepository.count()
            )));
        } catch (Exception ignored) {
            record.setDetails(null);
        }
        complianceRecordRepository.save(record);
        invalidateSnapshotCache();
        logAudit("Compliance submission", template.name() + " queued");

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("submissionId", template.submissionId());
        result.put("templateId", template.id());
        result.put("message", template.name() + " generated and queued for submission");
        result.put("generatedAt", record.getRecordedAt().toString());
        result.put("exportUrl", "/api/compliance/export/" + template.submissionId());
        return result;
    }

    public String buildExportCsv(String submissionId) {
        TemplateDef template = resolveTemplate(submissionId, null);
        LiveSnapshot snapshot = getCachedSnapshot(LocalDate.now());
        StringBuilder sb = new StringBuilder();
        sb.append("# ").append(template.name()).append("\n");
        sb.append("# Regulator: ").append(template.regulator()).append("\n");
        sb.append("# Generated: ").append(LocalDateTime.now()).append("\n");
        sb.append("# Staff: ").append(staffRepository.count()).append("\n");
        sb.append("# Departments: ").append(departmentRepository.count()).append("\n\n");
        sb.append("requirement,status,value\n");
        for (Map<String, Object> req : snapshot.requirements()) {
            sb.append(csvEscape(stringValue(req.get("requirement")))).append(",")
                .append(csvEscape(stringValue(req.get("status")))).append(",")
                .append(csvEscape(stringValue(req.get("value")))).append("\n");
        }
        sb.append("\n# Issues\n");
        sb.append("category,staff,detail\n");
        for (Map<String, Object> issue : snapshot.issues()) {
            sb.append(csvEscape(stringValue(issue.get("category")))).append(",")
                .append(csvEscape(stringValue(issue.get("staff")))).append(",")
                .append(csvEscape(stringValue(issue.get("detail")))).append("\n");
        }
        return sb.toString();
    }

    private List<Map<String, Object>> buildSubmissionStatus() {
        Map<String, ComplianceRecord> latestBySubmission = complianceRecordRepository
            .findByRecordTypeOrderByRecordedAtDesc(TYPE_SUBMISSION).stream()
            .filter(r -> r.getSubmissionId() != null)
            .collect(Collectors.toMap(
                ComplianceRecord::getSubmissionId,
                r -> r,
                (a, b) -> a.getRecordedAt().isAfter(b.getRecordedAt()) ? a : b
            ));

        List<Map<String, Object>> forms = new ArrayList<>();
        for (TemplateDef form : submissionForms()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", form.submissionId());
            row.put("templateId", form.id());
            row.put("name", form.name());
            row.put("description", form.description());
            row.put("regulator", form.regulator());
            row.put("frequency", form.frequency());
            ComplianceRecord latest = latestBySubmission.get(form.submissionId());
            row.put("status", latest != null ? latest.getStatus() : "not_started");
            row.put("lastSubmittedAt", latest != null ? latest.getRecordedAt() : null);
            forms.add(row);
        }
        return forms;
    }

    private long countQueuedSubmissions() {
        return complianceRecordRepository.countByRecordTypeAndStatus(TYPE_SUBMISSION, "queued");
    }

    private LiveSnapshot getCachedSnapshot(LocalDate today) {
        long now = System.currentTimeMillis();
        SnapshotCache cached = snapshotCache;
        if (cached != null && cached.date.equals(today) && now - cached.computedAtMs < SNAPSHOT_CACHE_MS) {
            return cached.snapshot;
        }
        LiveSnapshot snapshot = computeLiveSnapshot(today);
        snapshotCache = new SnapshotCache(today, now, snapshot);
        return snapshot;
    }

    private void invalidateSnapshotCache() {
        snapshotCache = null;
    }

    private LiveSnapshot computeLiveSnapshot(LocalDate today) {
        int maxHours = settingsService.getInt("scheduling", "maxHoursPerWeek");
        int restHours = settingsService.getInt("scheduling", "restBetweenShifts");

        List<Map<String, Object>> hourIssues = detectHourViolations(maxHours);
        List<Map<String, Object>> restIssues = detectRestViolations(restHours);
        long certsExpiring = certificationRepository.countByStatusAndExpiryDateBetween(
            "active", LocalDateTime.now(), LocalDateTime.now().plusDays(30));
        long certsExpired = certificationRepository.countByStatusAndExpiryDateBefore(
            "active", LocalDateTime.now());
        TrainingStats training = computeTrainingStats();
        List<Map<String, Object>> conflicts = schedulingService.detectConflicts(today);

        List<Map<String, Object>> requirements = new ArrayList<>();
        List<Map<String, Object>> allIssues = new ArrayList<>();

        String hourStatus = hourIssues.isEmpty() ? "compliant" : "violation";
        requirements.add(requirementRow(
            "work_hours",
            "Max " + maxHours + "hr/week",
            hourStatus,
            hourIssues.isEmpty() ? "All staff within limit" : hourIssues.size() + " staff over limit",
            hourIssues
        ));
        allIssues.addAll(hourIssues);

        String restStatus = restIssues.isEmpty() ? "compliant" : "violation";
        requirements.add(requirementRow(
            "rest",
            "Rest between shifts (" + restHours + "hr)",
            restStatus,
            restIssues.isEmpty() ? "No rest violations" : restIssues.size() + " rest gap(s)",
            restIssues
        ));
        allIssues.addAll(restIssues);

        String certStatus = certsExpired > 0 ? "violation" : certsExpiring > 0 ? "warning" : "compliant";
        requirements.add(requirementRow(
            "certifications",
            "Certification expiry",
            certStatus,
            certsExpired > 0
                ? certsExpired + " expired, " + certsExpiring + " expiring soon"
                : certsExpiring + " expiring within 30 days",
            List.of()
        ));

        String trainingStatus = training.completionRate() >= 95 ? "compliant"
            : training.completionRate() >= 80 ? "warning" : "violation";
        requirements.add(requirementRow(
            "training",
            "Mandatory training completion",
            trainingStatus,
            training.completionRate() + "% complete (" + training.completed() + "/" + training.total() + ")",
            List.of()
        ));

        if (!conflicts.isEmpty()) {
            List<Map<String, Object>> conflictIssues = conflicts.stream()
                .map(c -> issueRow(stringValue(c.get("type")), stringValue(c.get("staff")), stringValue(c.get("detail"))))
                .collect(Collectors.toList());
            requirements.add(requirementRow(
                "scheduling",
                "Today's schedule conflicts",
                "violation",
                conflicts.size() + " conflict(s) today",
                conflictIssues
            ));
            allIssues.addAll(conflictIssues);
        } else {
            requirements.add(requirementRow(
                "scheduling",
                "Today's schedule conflicts",
                "compliant",
                "No conflicts detected",
                List.of()
            ));
        }

        int totalIssues = allIssues.size();
        Map<String, Integer> issueBreakdown = new LinkedHashMap<>();
        for (Map<String, Object> issue : allIssues) {
            String category = stringValue(issue.get("category"));
            if (category != null) {
                issueBreakdown.merge(category, 1, Integer::sum);
            }
        }
        return new LiveSnapshot(requirements, limitIssues(allIssues), totalIssues, conflicts.size(), issueBreakdown);
    }

    private List<Map<String, Object>> limitIssues(List<Map<String, Object>> issues) {
        if (issues.size() <= MAX_ISSUE_DETAILS) {
            return issues;
        }
        return new ArrayList<>(issues.subList(0, MAX_ISSUE_DETAILS));
    }

    private List<Map<String, Object>> detectHourViolations(int maxHours) {
        LocalDateTime weekStart = LocalDate.now().minusDays(6).atStartOfDay();
        LocalDateTime weekEnd = LocalDate.now().plusDays(1).atStartOfDay();
        List<Schedule> weekSchedules = scheduleRepository.findByDateBetween(weekStart, weekEnd);

        Map<String, Double> hoursByStaff = new HashMap<>();
        for (Schedule schedule : weekSchedules) {
            String staffId = schedule.getStaffId();
            if (staffId == null || staffId.isBlank()) continue;
            hoursByStaff.merge(staffId, shiftHours(schedule.getShift()), Double::sum);
        }
        if (hoursByStaff.isEmpty()) {
            return List.of();
        }

        Map<String, String> namesById = staffRepository.findAllById(hoursByStaff.keySet()).stream()
            .collect(Collectors.toMap(Staff::getId, Staff::getName, (a, b) -> a));

        List<Map<String, Object>> issues = new ArrayList<>();
        for (Map.Entry<String, Double> entry : hoursByStaff.entrySet()) {
            int hours = (int) Math.round(entry.getValue());
            if (hours > maxHours) {
                String name = namesById.getOrDefault(entry.getKey(), entry.getKey());
                issues.add(issueRow("work_hours", name, hours + "h this week (limit " + maxHours + "h)"));
            }
        }
        issues.sort(Comparator.comparing(m -> stringValue(m.get("staff"))));
        return issues;
    }

    private List<Map<String, Object>> detectRestViolations(int restHoursRequired) {
        LocalDateTime weekStart = LocalDate.now().minusDays(6).atStartOfDay();
        LocalDateTime weekEnd = LocalDate.now().plusDays(1).atStartOfDay();
        List<Schedule> weekSchedules = scheduleRepository.findByDateBetween(weekStart, weekEnd);
        List<Map<String, Object>> issues = new ArrayList<>();

        Map<String, List<Schedule>> byStaff = weekSchedules.stream()
            .filter(s -> s.getStaffId() != null && !s.getStaffId().isBlank())
            .collect(Collectors.groupingBy(Schedule::getStaffId));

        for (Map.Entry<String, List<Schedule>> entry : byStaff.entrySet()) {
            List<Schedule> staffSchedules = entry.getValue().stream()
                .filter(s -> s.getDate() != null)
                .sorted(Comparator.comparing(Schedule::getDate))
                .collect(Collectors.toList());
            for (int i = 1; i < staffSchedules.size(); i++) {
                Schedule prev = staffSchedules.get(i - 1);
                Schedule next = staffSchedules.get(i);
                LocalDate prevDate = prev.getDate().toLocalDate();
                LocalDate nextDate = next.getDate().toLocalDate();
                if (!nextDate.equals(prevDate.plusDays(1))) continue;
                String prevShift = prev.getShift() != null ? prev.getShift() : "";
                String nextShift = next.getShift() != null ? next.getShift() : "";
                boolean ok = meetsRestGap(prevShift, nextShift, restHoursRequired);
                if (!ok) {
                    String name = prev.getStaff() != null ? prev.getStaff().getName() : entry.getKey();
                    issues.add(issueRow("rest", name,
                        prevShift + " on " + prevDate + " → " + nextShift + " on " + nextDate
                            + " (requires " + restHoursRequired + "h rest)"));
                }
            }
        }
        return issues;
    }

    private boolean meetsRestGap(String prevShift, String nextShift, int restHoursRequired) {
        if ("Night".equalsIgnoreCase(prevShift) && "Day".equalsIgnoreCase(nextShift)) {
            return restHoursRequired <= 8;
        }
        if ("Evening".equalsIgnoreCase(prevShift) && "Day".equalsIgnoreCase(nextShift)) {
            return restHoursRequired <= 10;
        }
        return true;
    }

    private TrainingStats computeTrainingStats() {
        long total = trainingEnrollmentRepository.count();
        if (total == 0) {
            return new TrainingStats(0, 0, 100);
        }
        long completed = trainingEnrollmentRepository.countByStatus("completed");
        int rate = (int) Math.round((completed * 100.0) / total);
        return new TrainingStats(total, completed, rate);
    }

    private Map<String, Object> requirementRow(String category, String requirement, String status,
                                               String value, List<Map<String, Object>> issues) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", category);
        row.put("category", category);
        row.put("requirement", requirement);
        row.put("status", status);
        row.put("value", value);
        List<Map<String, Object>> limited = limitIssues(issues);
        row.put("issues", limited);
        if (issues.size() > limited.size()) {
            row.put("issuesTruncated", true);
            row.put("totalIssues", issues.size());
        }
        return row;
    }

    private Map<String, Object> issueRow(String category, String staff, String detail) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("category", category);
        row.put("staff", staff);
        row.put("detail", detail);
        return row;
    }

    private Map<String, Object> toHistoryDto(ComplianceRecord record) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", record.getId());
        dto.put("recordType", record.getRecordType());
        dto.put("requirement", record.getRequirement());
        dto.put("status", record.getStatus());
        dto.put("value", record.getValue());
        dto.put("category", record.getCategory());
        dto.put("submissionId", record.getSubmissionId());
        dto.put("regulator", record.getRegulator());
        dto.put("submittedBy", record.getSubmittedBy());
        dto.put("recordedAt", record.getRecordedAt());
        return dto;
    }

    private String buildSubmissionSummary(LiveSnapshot snapshot) {
        return staffRepository.count() + " staff across "
            + departmentRepository.count() + " departments — "
            + snapshot.violationRequirements() + " failed requirements, "
            + snapshot.totalIssueCount() + " staff issues, "
            + snapshot.warningRequirements() + " warnings";
    }

    private TemplateDef resolveTemplate(String submissionId, String templateId) {
        if (submissionId != null) {
            for (TemplateDef template : allTemplates()) {
                if (template.submissionId().equals(submissionId) || template.id().equals(submissionId)) {
                    return template;
                }
            }
        }
        if (templateId != null) {
            for (TemplateDef template : allTemplates()) {
                if (template.id().equals(templateId)) {
                    return template;
                }
            }
        }
        return submissionForms().get(0);
    }

    private List<Map<String, Object>> listTemplatesInternal() {
        return allTemplates().stream().map(t -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", t.id());
            row.put("submissionId", t.submissionId());
            row.put("name", t.name());
            row.put("regulator", t.regulator());
            row.put("description", t.description());
            row.put("frequency", t.frequency());
            row.put("lastUpdated", t.lastUpdated());
            return row;
        }).collect(Collectors.toList());
    }

    private List<Map<String, Object>> listSubmissionForms() {
        return buildSubmissionStatus();
    }

    private List<TemplateDef> allTemplates() {
        List<TemplateDef> all = new ArrayList<>();
        all.addAll(mandateTemplates());
        all.addAll(submissionForms());
        return all;
    }

    private List<TemplateDef> mandateTemplates() {
        return List.of(
            new TemplateDef("who", "who-workforce", "WHO Health Workforce Guidelines", "WHO",
                "International staffing ratio and workforce planning standards", "Annual", "2024-01"),
            new TemplateDef("jci", "jci-annual", "JCI Staffing Standards", "Joint Commission",
                "Accreditation staffing and competency documentation", "Annual", "2024-03"),
            new TemplateDef("eu-ewtd", "eu-ewtd-quarterly", "EU Working Time Directive", "EU",
                "Working hours, rest periods, and night-shift limits", "Quarterly", "2023-11"),
            new TemplateDef("state-board", "state-quarterly", "State Nursing Board Requirements", "State",
                "State licensing and staffing compliance filing", "Quarterly", "2024-02")
        );
    }

    private List<TemplateDef> submissionForms() {
        return List.of(
            new TemplateDef("state-quarterly", "state-quarterly", "State Health Board - Quarterly",
                "State", "Staffing compliance report for state health board", "Quarterly", "2024-02"),
            new TemplateDef("jci-annual", "jci-annual", "JCI Accreditation", "JCI",
                "Annual staffing standards and competency evidence", "Annual", "2024-03")
        );
    }

    private double shiftHours(String shift) {
        if (shift == null) return 8;
        return switch (shift.toLowerCase(Locale.ROOT)) {
            case "night" -> 10;
            default -> 8;
        };
    }

    private void logAudit(String action, String details) {
        AuditLog entry = new AuditLog();
        entry.setId(UUID.randomUUID().toString());
        entry.setAction(action);
        entry.setType("compliance");
        entry.setResource("compliance");
        entry.setDetails(details);
        entry.setCreatedAt(LocalDateTime.now());
        auditLogRepository.save(entry);
    }

    private String csvEscape(String value) {
        if (value == null) return "";
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }

    private String stringValue(Object value) {
        if (value == null) return null;
        String s = String.valueOf(value).trim();
        return s.isEmpty() ? null : s;
    }

    private String truncate(String value, int maxLen) {
        if (value == null || value.length() <= maxLen) return value;
        if (maxLen <= 3) return value.substring(0, maxLen);
        return value.substring(0, maxLen - 3) + "...";
    }

    private String serializeScanIssues(Object issuesObj, Object totalIssuesObj) {
        if (!(issuesObj instanceof List<?> issues) || issues.isEmpty()) {
            return null;
        }
        List<?> stored = issues.size() <= MAX_STORED_SCAN_ISSUES
            ? issues
            : new ArrayList<>(issues.subList(0, MAX_STORED_SCAN_ISSUES));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("issues", stored);
        if (issues.size() > stored.size()) {
            payload.put("truncated", true);
            payload.put("storedCount", stored.size());
            payload.put("totalIssues", totalIssuesObj != null ? totalIssuesObj : issues.size());
        }
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (Exception ignored) {
            return null;
        }
    }

    private record TemplateDef(String id, String submissionId, String name, String regulator,
                               String description, String frequency, String lastUpdated) {}

    private record TrainingStats(long total, long completed, int completionRate) {}

    private record SnapshotCache(LocalDate date, long computedAtMs, LiveSnapshot snapshot) {}

    private record LiveSnapshot(List<Map<String, Object>> requirements,
                                List<Map<String, Object>> issues,
                                int totalIssueCount,
                                int conflictsToday,
                                Map<String, Integer> issueBreakdown) {
        int violationRequirements() {
            return (int) requirements.stream().filter(r -> "violation".equals(r.get("status"))).count();
        }

        int warningRequirements() {
            return (int) requirements.stream().filter(r -> "warning".equals(r.get("status"))).count();
        }

        int complianceScore() {
            if (requirements.isEmpty()) return 100;
            long passing = requirements.stream()
                .filter(r -> "compliant".equals(r.get("status")))
                .count();
            return (int) Math.round((passing * 100.0) / requirements.size());
        }

        String overallStatus() {
            if (violationRequirements() > 0) return "review_needed";
            if (warningRequirements() > 0) return "attention";
            return "compliant";
        }

        boolean issuesTruncated() {
            return totalIssueCount > issues.size();
        }
    }
}
