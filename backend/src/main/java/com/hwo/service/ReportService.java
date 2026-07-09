package com.hwo.service;

import com.hwo.entity.*;
import com.hwo.repository.*;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.IsoFields;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ReportService {

    private final GeneratedReportRepository generatedReportRepository;
    private final ScheduledReportRepository scheduledReportRepository;
    private final DepartmentRepository departmentRepository;
    private final StaffRepository staffRepository;
    private final WorkloadRecordRepository workloadRecordRepository;
    private final WellnessRecordRepository wellnessRecordRepository;
    private final ComplianceRecordRepository complianceRecordRepository;
    private final UserRepository userRepository;
    private final UserProfileRepository userProfileRepository;
    private final SettingsService settingsService;
    private final WellnessService wellnessService;
    private final SchedulingService schedulingService;

    public ReportService(GeneratedReportRepository generatedReportRepository,
                         ScheduledReportRepository scheduledReportRepository,
                         DepartmentRepository departmentRepository,
                         StaffRepository staffRepository,
                         WorkloadRecordRepository workloadRecordRepository,
                         WellnessRecordRepository wellnessRecordRepository,
                         ComplianceRecordRepository complianceRecordRepository,
                         UserRepository userRepository,
                         UserProfileRepository userProfileRepository,
                         SettingsService settingsService,
                         WellnessService wellnessService,
                         SchedulingService schedulingService) {
        this.generatedReportRepository = generatedReportRepository;
        this.scheduledReportRepository = scheduledReportRepository;
        this.departmentRepository = departmentRepository;
        this.staffRepository = staffRepository;
        this.workloadRecordRepository = workloadRecordRepository;
        this.wellnessRecordRepository = wellnessRecordRepository;
        this.complianceRecordRepository = complianceRecordRepository;
        this.userRepository = userRepository;
        this.userProfileRepository = userProfileRepository;
        this.settingsService = settingsService;
        this.wellnessService = wellnessService;
        this.schedulingService = schedulingService;
    }

    public List<Map<String, Object>> listReports() {
        return generatedReportRepository.findTop20ByOrderByCreatedAtDesc().stream()
            .map(this::toReportDto)
            .collect(Collectors.toList());
    }

    public Map<String, Object> operationalReport() {
        Map<String, Object> wellness = wellnessService.getWellnessSummary();
        Map<String, Object> scheduling = schedulingService.scheduleSummary(LocalDate.now());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("title", "Operational Report");
        result.put("generatedAt", LocalDateTime.now().toString());
        result.put("kpis", buildKpis(wellness, scheduling));
        result.put("departments", listDepartmentRows());
        result.put("staff", listStaffRows());
        result.put("workload", listWorkloadRows());
        result.put("workloadTrend", workloadTrend());
        result.put("wellnessSummary", wellness);
        result.put("wellnessRecords", wellnessService.listRecords(null));
        Map<String, Object> wellnessFull = wellnessReport();
        result.put("interventions", wellnessFull.get("interventions"));
        result.put("feedback", wellnessFull.get("feedback"));
        result.put("wellnessTrend", wellnessFull.get("trend"));
        result.put("avgWellnessScore", wellnessFull.get("avgScore"));
        result.put("wellnessTrendLabel", wellnessFull.get("trendLabel"));
        result.put("schedulingSummary", scheduling);
        result.put("scheduling", schedulingReport(LocalDate.now()));
        result.put("compliance", listComplianceRows());
        return result;
    }

    public Map<String, Object> strategicReport() {
        Map<String, Object> operational = operationalReport();
        Map<String, Object> wellnessFull = wellnessReport();
        Map<String, Object> bench = benchmark();

        Map<String, Object> result = new LinkedHashMap<>(operational);
        result.put("title", "Strategic Report");
        result.put("quarter", LocalDate.now().getYear() + " Q" + LocalDate.now().get(IsoFields.QUARTER_OF_YEAR));
        result.put("benchmarks", bench.get("benchmarks"));
        result.put("industryAvg", bench.get("industryAvg"));
        result.put("yourAvg", bench.get("yourAvg"));
        result.put("ranking", bench.get("ranking"));
        result.put("wellnessTrend", wellnessFull.get("trend"));
        result.put("wellnessTrendLabel", wellnessFull.get("trendLabel"));
        result.put("avgWellnessScore", wellnessFull.get("avgScore"));
        result.put("interventions", wellnessFull.get("interventions"));
        result.put("feedback", wellnessFull.get("feedback"));
        result.put("recommendations", buildStrategicRecommendations(operational, wellnessFull, bench));
        return result;
    }

    public Map<String, Object> customReportData(List<String> sections) {
        if (sections == null || sections.isEmpty()) {
            sections = List.of("departments", "staff", "workload");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("title", "Custom Report");
        result.put("generatedAt", LocalDateTime.now().toString());
        result.put("sections", sections);
        if (sections.contains("departments")) result.put("departments", listDepartmentRows());
        if (sections.contains("staff")) result.put("staff", listStaffRows());
        if (sections.contains("workload")) {
            result.put("workload", listWorkloadRows());
            result.put("workloadTrend", workloadTrend());
        }
        if (sections.contains("wellness")) {
            Map<String, Object> w = wellnessReport();
            result.put("wellnessSummary", w.get("summary"));
            result.put("wellnessRecords", w.get("records"));
            result.put("interventions", w.get("interventions"));
            result.put("feedback", w.get("feedback"));
            result.put("wellnessTrend", w.get("trend"));
        }
        if (sections.contains("scheduling")) {
            result.put("scheduling", schedulingReport(LocalDate.now()));
        }
        if (sections.contains("compliance")) {
            result.put("compliance", listComplianceRows());
        }
        return result;
    }

    public Map<String, Object> wellnessReport() {
        Map<String, Object> summary = wellnessService.getWellnessSummary();
        List<Map<String, Object>> records = wellnessService.listRecords(null);
        List<Map<String, Object>> interventions = wellnessService.listInterventions(null);
        List<Map<String, Object>> feedback = wellnessService.listFeedback();

        List<WellnessRecord> allRecords = wellnessRecordRepository.findAll();
        Map<String, List<Double>> byMonth = new TreeMap<>();
        String[] monthNames = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};
        for (WellnessRecord r : allRecords) {
            if (r.getScore() != null && r.getDate() != null) {
                String key = monthNames[r.getDate().getMonthValue() - 1];
                byMonth.computeIfAbsent(key, k -> new ArrayList<>()).add(r.getScore());
            }
        }
        List<Map<String, Object>> trend = new ArrayList<>();
        for (Map.Entry<String, List<Double>> entry : byMonth.entrySet()) {
            double avg = entry.getValue().stream().mapToDouble(Double::doubleValue).average().orElse(0);
            trend.add(Map.of("month", entry.getKey(), "score", Math.round(avg)));
        }
        double avgScore = allRecords.stream()
            .filter(r -> r.getScore() != null)
            .mapToDouble(WellnessRecord::getScore)
            .average().orElse(0);
        String trendLabel = avgScore >= 70 ? "improving" : avgScore >= 50 ? "stable" : "declining";

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("title", "Wellness Report");
        result.put("generatedAt", LocalDateTime.now().toString());
        result.put("summary", summary);
        result.put("records", records);
        result.put("interventions", interventions);
        result.put("feedback", feedback);
        result.put("trend", trend);
        result.put("trendLabel", trendLabel);
        result.put("avgScore", Math.round(avgScore * 10) / 10.0);
        return result;
    }

    public Map<String, Object> schedulingReport(LocalDate startDate) {
        if (startDate == null) startDate = LocalDate.now();
        LocalDate endDate = startDate.plusDays(6);

        List<Map<String, Object>> dailySummaries = new ArrayList<>();
        List<Map<String, Object>> allSchedules = new ArrayList<>();
        List<Map<String, Object>> allConflicts = new ArrayList<>();
        Set<String> conflictKeys = new HashSet<>();

        List<Map<String, Object>> allOnCall = new ArrayList<>();
        Set<String> onCallKeys = new HashSet<>();

        for (LocalDate d = startDate; !d.isAfter(endDate); d = d.plusDays(1)) {
            Map<String, Object> day = schedulingService.getDayOverview(d);
            Map<String, Object> dayRow = new LinkedHashMap<>();
            dayRow.put("date", d.toString());
            dayRow.put("summary", day.get("summary"));
            dailySummaries.add(dayRow);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> schedules = (List<Map<String, Object>>) day.getOrDefault("schedules", List.of());
            for (Map<String, Object> s : schedules) {
                Map<String, Object> row = new LinkedHashMap<>(s);
                row.put("date", d.toString());
                allSchedules.add(row);
            }

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> conflicts = (List<Map<String, Object>>) day.getOrDefault("conflicts", List.of());
            for (Map<String, Object> c : conflicts) {
                String key = String.valueOf(c.get("type")) + "|" + String.valueOf(c.get("staff")) + "|" + String.valueOf(c.get("detail"));
                if (conflictKeys.add(key)) {
                    Map<String, Object> row = new LinkedHashMap<>(c);
                    row.put("date", d.toString());
                    allConflicts.add(row);
                }
            }

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> dayOnCall = (List<Map<String, Object>>) day.getOrDefault("onCall", List.of());
            for (Map<String, Object> o : dayOnCall) {
                String key = String.valueOf(o.get("id")) + "|" + d;
                if (onCallKeys.add(key)) {
                    Map<String, Object> row = new LinkedHashMap<>(o);
                    row.put("date", d.toString());
                    allOnCall.add(row);
                }
            }
        }

        Map<String, Object> weekSummary = schedulingService.scheduleSummary(startDate);
        Map<String, Object> todayOverview = schedulingService.getDayOverview(startDate);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("title", "Scheduling Report");
        result.put("generatedAt", LocalDateTime.now().toString());
        result.put("periodStart", startDate.toString());
        result.put("periodEnd", endDate.toString());
        result.put("weekSummary", weekSummary);
        result.put("dailySummaries", dailySummaries);
        result.put("schedules", allSchedules);
        result.put("conflicts", allConflicts);
        result.put("leave", todayOverview.getOrDefault("leave", List.of()));
        result.put("onCall", allOnCall);
        return result;
    }

    public Map<String, Object> benchmark() {
        int target = settingsService.getInt("workload", "threshold", 80);
        List<Map<String, Object>> benchmarks = departmentRepository.findAll().stream()
            .map(d -> {
                int workload = (int) Math.round(d.getWorkload());
                String status = workload <= target ? "compliant" : "warning";
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("department", d.getName());
                row.put("metric", "Workload utilization");
                row.put("current", workload + "%");
                row.put("target", target + "%");
                row.put("status", status);
                return row;
            })
            .collect(Collectors.toList());
        double avgWorkload = departmentRepository.findAll().stream().mapToDouble(Department::getWorkload).average().orElse(0);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("benchmarks", benchmarks);
        result.put("industryAvg", target);
        result.put("yourAvg", Math.round(avgWorkload));
        result.put("ranking", avgWorkload <= target ? "Above average" : "Needs improvement");
        return result;
    }

    public Map<String, Object> executiveSummary() {
        long staffCount = staffRepository.count();
        double avgWorkload = departmentRepository.findAll().stream().mapToDouble(Department::getWorkload).average().orElse(0);
        Map<String, Object> wellness = wellnessService.getWellnessSummary();
        int atRisk = (int) wellness.getOrDefault("atRiskCount", 0);
        double avgOvertime = wellness.get("avgOvertime") instanceof Number n ? n.doubleValue() : 0;
        long violations = complianceRecordRepository.findAll().stream().filter(r -> "violation".equals(r.getStatus())).count();

        List<Map<String, Object>> highlights = List.of(
            Map.of("label", "Total staff monitored", "value", staffCount, "unit", ""),
            Map.of("label", "Average department workload", "value", Math.round(avgWorkload), "unit", "%"),
            Map.of("label", "At-risk wellness alerts", "value", atRisk, "unit", ""),
            Map.of("label", "Average overtime", "value", avgOvertime, "unit", "hrs")
        );

        List<String> recommendations = new ArrayList<>();
        if (atRisk > 0) recommendations.add("Review wellness interventions for " + atRisk + " at-risk staff members.");
        if (avgWorkload > 85) recommendations.add("Consider additional staffing in high-utilization departments.");
        if (violations > 0) recommendations.add("Address " + violations + " open compliance violations.");
        if (recommendations.isEmpty()) recommendations.add("Workforce utilization is within target range. Continue monitoring weekly trends.");

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("highlights", highlights);
        result.put("recommendations", recommendations);
        result.put("summary", recommendations.get(0));
        result.put("generatedAt", LocalDateTime.now().toString());
        return result;
    }

    @Transactional
    public ResponseEntity<?> generateReport(Map<String, ?> body) {
        String type = body.get("type") != null ? String.valueOf(body.get("type")) : "custom";
        String format = body.get("format") != null ? String.valueOf(body.get("format")) : "csv";
        List<String> sections = sectionsForType(type);
        String csv = buildReportCsv(type, sections);
        GeneratedReport report = saveReport(type + " Report", type, format);
        return csvDownload(csv, report.getName(), format);
    }

    @Transactional
    public ResponseEntity<?> customReport(Map<String, ?> body) {
        List<String> sections = toStringList(body.get("sections"));
        if (sections.isEmpty()) sections = List.of("departments", "staff");
        String format = body.get("format") != null ? String.valueOf(body.get("format")) : "csv";
        String csv = buildReportCsv("custom", sections);
        GeneratedReport report = saveReport("Custom Report", "custom", format);
        return csvDownload(csv, report.getName(), format);
    }

    public List<Map<String, Object>> listScheduledReports() {
        return scheduledReportRepository.findAll().stream()
            .map(r -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", r.getId());
                row.put("type", r.getType());
                row.put("format", r.getFormat());
                row.put("frequency", r.getFrequency());
                row.put("recipients", r.getRecipients());
                row.put("nextRun", r.getNextRun() != null ? r.getNextRun().toString() : null);
                row.put("enabled", r.isEnabled());
                return row;
            })
            .collect(Collectors.toList());
    }

    @Transactional
    public Map<String, Object> createScheduledReport(Map<String, ?> body) {
        ScheduledReport report = new ScheduledReport();
        report.setId(UUID.randomUUID().toString());
        report.setType(body.get("type") != null ? String.valueOf(body.get("type")) : "operational");
        report.setFormat(body.get("format") != null ? String.valueOf(body.get("format")) : "csv");
        report.setFrequency(body.get("frequency") != null ? String.valueOf(body.get("frequency")) : "weekly");
        report.setRecipients(body.get("recipients") != null ? String.valueOf(body.get("recipients")) : "");
        report.setEnabled(true);
        report.setNextRun(computeNextRun(report.getFrequency()));
        scheduledReportRepository.save(report);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", report.getId());
        result.put("success", true);
        result.put("type", report.getType());
        result.put("format", report.getFormat());
        result.put("frequency", report.getFrequency());
        result.put("nextRun", report.getNextRun().toString());
        return result;
    }

    public Map<String, Object> archives() {
        List<GeneratedReport> reports = generatedReportRepository.findAll();
        Map<String, Long> byQuarter = reports.stream()
            .filter(r -> r.getCreatedAt() != null)
            .collect(Collectors.groupingBy(
                r -> r.getCreatedAt().getYear() + " Q" + r.getCreatedAt().get(IsoFields.QUARTER_OF_YEAR),
                Collectors.counting()
            ));
        List<Map<String, Object>> archives = byQuarter.entrySet().stream()
            .sorted(Map.Entry.<String, Long>comparingByKey().reversed())
            .map(e -> Map.<String, Object>of(
                "period", e.getKey(),
                "size", e.getValue() + " reports",
                "status", "archived"
            ))
            .collect(Collectors.toList());
        if (archives.isEmpty()) {
            archives = List.of(Map.of("period", LocalDate.now().getYear() + " Q" + LocalDate.now().get(IsoFields.QUARTER_OF_YEAR),
                "size", "0 reports", "status", "empty"));
        }
        return Map.of("archives", archives);
    }

    private GeneratedReport saveReport(String name, String type, String format) {
        GeneratedReport report = new GeneratedReport();
        report.setId(UUID.randomUUID().toString());
        report.setName(name + " - " + LocalDate.now());
        report.setType(type);
        report.setFormat(format);
        report.setStatus("ready");
        report.setCreatedAt(LocalDateTime.now());
        return generatedReportRepository.save(report);
    }

    private String buildReportCsv(String type, List<String> sections) {
        StringBuilder csv = new StringBuilder();
        csv.append("Report Type,").append(type).append("\n");
        csv.append("Generated,").append(LocalDateTime.now()).append("\n\n");

        if (sections.contains("departments")) {
            csv.append("Departments\nName,Staff Count,Workload\n");
            departmentRepository.findAll().forEach(d ->
                csv.append(d.getName()).append(",").append(d.getStaffCount()).append(",").append(Math.round(d.getWorkload())).append("\n"));
            csv.append("\n");
        }
        if (sections.contains("staff")) {
            csv.append("Staff\nName,Role,Email,Phone,Department\n");
            listStaffRows().forEach(s ->
                csv.append(csvCell(s.get("name"))).append(",")
                    .append(csvCell(s.get("role"))).append(",")
                    .append(csvCell(s.get("email"))).append(",")
                    .append(csvCell(s.get("phone"))).append(",")
                    .append(csvCell(s.get("department"))).append("\n"));
            csv.append("\n");
        }
        if (sections.contains("workload")) {
            csv.append("Workload Records\nDate,Department,Hour,Workload,Patient Volume,Staff On Duty\n");
            listWorkloadRows().forEach(w ->
                csv.append(csvCell(w.get("date"))).append(",")
                    .append(csvCell(w.get("department"))).append(",")
                    .append(csvCell(w.get("hour"))).append(",")
                    .append(csvCell(w.get("workload"))).append(",")
                    .append(csvCell(w.get("patientVolume"))).append(",")
                    .append(csvCell(w.get("staffOnDuty"))).append("\n"));
            csv.append("\n");
        }
        if ("compliance".equals(type) || sections.contains("compliance")) {
            csv.append("Compliance History\nRequirement,Status,Value,Type,Category,Regulator,Submitted By,Recorded At,Details\n");
            listComplianceRows().forEach(c ->
                csv.append(csvCell(c.get("requirement"))).append(",")
                    .append(csvCell(c.get("status"))).append(",")
                    .append(csvCell(c.get("value"))).append(",")
                    .append(csvCell(c.get("recordType"))).append(",")
                    .append(csvCell(c.get("category"))).append(",")
                    .append(csvCell(c.get("regulator"))).append(",")
                    .append(csvCell(c.get("submittedBy"))).append(",")
                    .append(csvCell(c.get("recordedAt"))).append(",")
                    .append(csvCell(c.get("details"))).append("\n"));
            csv.append("\n");
        }
        if ("wellness".equals(type) || sections.contains("wellness")) {
            csv.append("Wellness Alerts\nStaff,Department,Risk,Overtime (hrs)\n");
            Object alertList = ((Map<?, ?>) wellnessService.getWellnessSummary()).get("alerts");
            if (alertList instanceof List<?> list) {
                for (Object item : list) {
                    if (item instanceof Map<?, ?> a) {
                        csv.append(csvCell(a.get("staff"))).append(",")
                            .append(csvCell(a.get("department"))).append(",")
                            .append(csvCell(a.get("risk"))).append(",")
                            .append(csvCell(a.get("overtime"))).append("\n");
                    }
                }
            }
            csv.append("\nWellness Records\nStaff,Department,Date,Overtime,Risk,Score\n");
            wellnessService.listRecords(null).forEach(r ->
                csv.append(csvCell(r.get("staffName"))).append(",")
                    .append(csvCell(r.get("department"))).append(",")
                    .append(csvCell(r.get("date"))).append(",")
                    .append(csvCell(r.get("overtime"))).append(",")
                    .append(csvCell(r.get("riskLevel"))).append(",")
                    .append(csvCell(r.get("score"))).append("\n"));
            csv.append("\nInterventions\nStaff,Type,Title,Status,Recommended\n");
            wellnessService.listInterventions(null).forEach(i ->
                csv.append(csvCell(i.get("staffName"))).append(",")
                    .append(csvCell(i.get("type"))).append(",")
                    .append(csvCell(i.get("title"))).append(",")
                    .append(csvCell(i.get("status"))).append(",")
                    .append(csvCell(i.get("recommendedAt"))).append("\n"));
            csv.append("\nFeedback\nStaff,Sentiment,Message,Created\n");
            wellnessService.listFeedback().forEach(f ->
                csv.append(csvCell(f.get("staffName"))).append(",")
                    .append(csvCell(f.get("sentiment"))).append(",")
                    .append(csvCell(f.get("message"))).append(",")
                    .append(csvCell(f.get("createdAt"))).append("\n"));
            csv.append("\n");
        }
        if ("scheduling".equals(type) || sections.contains("scheduling")) {
            Map<String, Object> sched = schedulingReport(LocalDate.now());
            csv.append("Scheduling Period,").append(sched.get("periodStart")).append(" to ").append(sched.get("periodEnd")).append("\n\n");
            csv.append("Shifts\nDate,Staff,Role,Department,Shift,Status,Swap Requested\n");
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> schedules = (List<Map<String, Object>>) sched.getOrDefault("schedules", List.of());
            for (Map<String, Object> s : schedules) {
                csv.append(csvCell(s.get("date"))).append(",")
                    .append(csvCell(s.get("staff"))).append(",")
                    .append(csvCell(s.get("role"))).append(",")
                    .append(csvCell(s.get("dept"))).append(",")
                    .append(csvCell(s.get("shift"))).append(",")
                    .append(csvCell(s.get("status"))).append(",")
                    .append(csvCell(s.get("swapRequested"))).append("\n");
            }
            csv.append("\nConflicts\nDate,Type,Staff,Detail\n");
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> conflicts = (List<Map<String, Object>>) sched.getOrDefault("conflicts", List.of());
            for (Map<String, Object> c : conflicts) {
                csv.append(csvCell(c.get("date"))).append(",")
                    .append(csvCell(c.get("type"))).append(",")
                    .append(csvCell(c.get("staff"))).append(",")
                    .append(csvCell(c.get("detail"))).append("\n");
            }
            csv.append("\n");
        }
        return csv.toString();
    }

    private List<String> sectionsForType(String type) {
        return switch (type != null ? type.toLowerCase() : "custom") {
            case "wellness" -> List.of("wellness");
            case "scheduling" -> List.of("scheduling");
            case "operational" -> List.of("departments", "staff", "workload", "wellness", "scheduling", "compliance");
            case "strategic" -> List.of("departments", "staff", "workload", "wellness", "scheduling", "compliance");
            default -> List.of("departments", "staff", "workload");
        };
    }

    private Map<String, Object> buildKpis(Map<String, Object> wellness, Map<String, Object> scheduling) {
        double avgWorkload = departmentRepository.findAll().stream().mapToDouble(Department::getWorkload).average().orElse(0);
        Map<String, Object> kpis = new LinkedHashMap<>();
        kpis.put("staffCount", staffRepository.count());
        kpis.put("departmentCount", departmentRepository.count());
        kpis.put("avgWorkload", Math.round(avgWorkload));
        kpis.put("atRiskCount", wellness.getOrDefault("atRiskCount", 0));
        kpis.put("avgOvertime", wellness.getOrDefault("avgOvertime", 0));
        kpis.put("coverage", scheduling.getOrDefault("coverage", 0));
        kpis.put("openShifts", scheduling.getOrDefault("openShifts", 0));
        kpis.put("swapRequests", scheduling.getOrDefault("swapRequests", 0));
        long violations = complianceRecordRepository.findAll().stream()
            .filter(r -> "violation".equalsIgnoreCase(r.getStatus())).count();
        kpis.put("complianceViolations", violations);
        kpis.put("complianceRecords", complianceRecordRepository.count());
        return kpis;
    }

    private List<Map<String, Object>> listDepartmentRows() {
        return departmentRepository.findAllOrderByName().stream().map(d -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("name", d.getName());
            row.put("code", d.getCode() != null ? d.getCode() : "");
            row.put("description", d.getDescription() != null ? d.getDescription() : "");
            row.put("active", d.isActive());
            row.put("staffCount", d.getStaffCount());
            row.put("workload", Math.round(d.getWorkload()));
            return row;
        }).collect(Collectors.toList());
    }

    private List<Map<String, Object>> listStaffRows() {
        Map<String, String> deptNames = departmentRepository.findAll().stream()
            .collect(Collectors.toMap(Department::getId, Department::getName, (a, b) -> a));
        List<Staff> allStaff = staffRepository.findAll();
        Set<String> staffIds = allStaff.stream().map(Staff::getId).collect(Collectors.toSet());
        Map<String, User> userByStaffId = staffIds.isEmpty()
            ? Map.of()
            : userRepository.findByStaffIdIn(staffIds).stream()
                .filter(u -> u.getStaffId() != null)
                .collect(Collectors.toMap(User::getStaffId, u -> u, (a, b) -> a));
        Set<String> userIds = userByStaffId.values().stream().map(User::getId).collect(Collectors.toSet());
        Map<String, UserProfile> profileByUserId = userIds.isEmpty()
            ? Map.of()
            : userProfileRepository.findByUserIdIn(userIds).stream()
                .collect(Collectors.toMap(UserProfile::getUserId, p -> p, (a, b) -> a));
        return allStaff.stream().map(s -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("name", s.getName());
            row.put("role", s.getRole());
            row.put("email", s.getEmail() != null ? s.getEmail() : "");
            User user = userByStaffId.get(s.getId());
            String phone = "";
            if (user != null) {
                UserProfile profile = profileByUserId.get(user.getId());
                if (profile != null && profile.getPhone() != null) {
                    phone = profile.getPhone();
                }
            }
            row.put("phone", phone);
            row.put("department", s.getDepartmentId() != null ? deptNames.getOrDefault(s.getDepartmentId(), "") : "");
            row.put("departmentId", s.getDepartmentId());
            return row;
        }).collect(Collectors.toList());
    }

    private List<Map<String, Object>> listComplianceRows() {
        return complianceRecordRepository.findAll().stream()
            .sorted(Comparator.comparing(
                ComplianceRecord::getRecordedAt,
                Comparator.nullsLast(Comparator.reverseOrder())))
            .map(c -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("requirement", c.getRequirement() != null ? c.getRequirement() : "");
                row.put("status", c.getStatus() != null ? c.getStatus() : "");
                row.put("value", c.getValue() != null ? c.getValue() : "");
                row.put("recordType", c.getRecordType() != null ? c.getRecordType() : "");
                row.put("category", c.getCategory() != null ? c.getCategory() : "");
                row.put("regulator", c.getRegulator() != null ? c.getRegulator() : "");
                row.put("submittedBy", c.getSubmittedBy() != null ? c.getSubmittedBy() : "");
                row.put("recordedAt", c.getRecordedAt() != null ? c.getRecordedAt().toString() : "");
                row.put("details", c.getDetails() != null ? c.getDetails() : "");
                return row;
            })
            .collect(Collectors.toList());
    }

    private List<Map<String, Object>> listWorkloadRows() {
        Map<String, String> deptNames = departmentRepository.findAll().stream()
            .collect(Collectors.toMap(Department::getId, Department::getName, (a, b) -> a));
        return workloadRecordRepository.findAllByOrderByDateAsc().stream().map(w -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("date", w.getDate() != null ? w.getDate().toString() : "");
            row.put("department", w.getDepartmentId() != null ? deptNames.getOrDefault(w.getDepartmentId(), "") : "");
            row.put("hour", w.getHour());
            row.put("workload", w.getWorkload());
            row.put("patientVolume", w.getPatientVolume());
            row.put("staffOnDuty", w.getStaffOnDuty());
            return row;
        }).collect(Collectors.toList());
    }

    private List<Map<String, Object>> workloadTrend() {
        String[] monthNames = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};
        Map<String, List<Double>> byMonth = new TreeMap<>();
        for (WorkloadRecord w : workloadRecordRepository.findAllByOrderByDateAsc()) {
            if (w.getDate() != null) {
                String key = monthNames[w.getDate().getMonthValue() - 1];
                byMonth.computeIfAbsent(key, k -> new ArrayList<>()).add(w.getWorkload());
            }
        }
        List<Map<String, Object>> trend = new ArrayList<>();
        for (Map.Entry<String, List<Double>> entry : byMonth.entrySet()) {
            double avg = entry.getValue().stream().mapToDouble(Double::doubleValue).average().orElse(0);
            trend.add(Map.of("month", entry.getKey(), "workload", Math.round(avg * 10) / 10.0));
        }
        return trend;
    }

    private List<String> buildStrategicRecommendations(Map<String, Object> operational,
                                                       Map<String, Object> wellnessFull,
                                                       Map<String, Object> bench) {
        List<String> recs = new ArrayList<>();
        @SuppressWarnings("unchecked")
        Map<String, Object> kpis = (Map<String, Object>) operational.getOrDefault("kpis", Map.of());
        int atRisk = kpis.get("atRiskCount") instanceof Number n ? n.intValue() : 0;
        int avgWl = kpis.get("avgWorkload") instanceof Number n ? n.intValue() : 0;
        if (atRisk > 0) recs.add("Prioritize wellness interventions for " + atRisk + " at-risk staff.");
        if (avgWl > 85) recs.add("Average workload exceeds 85% — plan hiring or shift redistribution.");
        if ("Needs improvement".equals(bench.get("ranking"))) {
            recs.add("Department workload benchmarks indicate capacity gaps — review strategic staffing plan.");
        }
        Object trendLabel = wellnessFull.get("trendLabel");
        if ("declining".equals(trendLabel)) recs.add("Wellness scores are declining — expand survey and check-in programs.");
        if (recs.isEmpty()) recs.add("Workforce metrics are within targets. Maintain quarterly review cadence.");
        return recs;
    }

    private String csvCell(Object value) {
        if (value == null) return "";
        String s = String.valueOf(value).replace("\"", "\"\"");
        if (s.contains(",") || s.contains("\"") || s.contains("\n")) {
            return "\"" + s + "\"";
        }
        return s;
    }

    private ResponseEntity<?> csvDownload(String csv, String filename, String format) {
        String ext = "excel".equalsIgnoreCase(format) ? "xlsx" : "csv";
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename.replace(" ", "_") + "." + ext + "\"")
            .contentType(MediaType.parseMediaType("text/csv"))
            .body(csv);
    }

    private Map<String, Object> toReportDto(GeneratedReport report) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", report.getId());
        row.put("name", report.getName());
        row.put("type", report.getType());
        row.put("format", report.getFormat() != null ? report.getFormat() : "csv");
        row.put("date", report.getCreatedAt() != null ? report.getCreatedAt().toLocalDate().toString() : "");
        row.put("status", report.getStatus());
        return row;
    }

    private LocalDateTime computeNextRun(String frequency) {
        LocalDateTime now = LocalDateTime.now();
        return switch (frequency != null ? frequency.toLowerCase() : "weekly") {
            case "daily" -> now.plusDays(1);
            case "monthly" -> now.plusMonths(1);
            default -> now.plusWeeks(1);
        };
    }

    private List<String> toStringList(Object value) {
        if (value instanceof List<?> list) {
            return list.stream().map(String::valueOf).filter(s -> !s.isBlank()).toList();
        }
        return List.of();
    }
}
