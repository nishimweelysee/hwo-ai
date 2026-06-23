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
    private final SettingsService settingsService;
    private final WellnessService wellnessService;

    public ReportService(GeneratedReportRepository generatedReportRepository,
                         ScheduledReportRepository scheduledReportRepository,
                         DepartmentRepository departmentRepository,
                         StaffRepository staffRepository,
                         WorkloadRecordRepository workloadRecordRepository,
                         WellnessRecordRepository wellnessRecordRepository,
                         ComplianceRecordRepository complianceRecordRepository,
                         SettingsService settingsService,
                         WellnessService wellnessService) {
        this.generatedReportRepository = generatedReportRepository;
        this.scheduledReportRepository = scheduledReportRepository;
        this.departmentRepository = departmentRepository;
        this.staffRepository = staffRepository;
        this.workloadRecordRepository = workloadRecordRepository;
        this.wellnessRecordRepository = wellnessRecordRepository;
        this.complianceRecordRepository = complianceRecordRepository;
        this.settingsService = settingsService;
        this.wellnessService = wellnessService;
    }

    public List<Map<String, Object>> listReports() {
        return generatedReportRepository.findTop20ByOrderByCreatedAtDesc().stream()
            .map(this::toReportDto)
            .collect(Collectors.toList());
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
        String csv = buildReportCsv(type, List.of("departments", "staff", "workload"));
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
            csv.append("Staff\nName,Role,Email\n");
            staffRepository.findAll().forEach(s ->
                csv.append(s.getName()).append(",").append(s.getRole()).append(",").append(s.getEmail() != null ? s.getEmail() : "").append("\n"));
            csv.append("\n");
        }
        if (sections.contains("workload")) {
            csv.append("Workload Records\nDate,Value\n");
            workloadRecordRepository.findAll().stream().limit(50).forEach(w ->
                csv.append(w.getDate()).append(",").append(w.getWorkload()).append("\n"));
            csv.append("\n");
        }
        if ("compliance".equals(type) || sections.contains("compliance")) {
            csv.append("Compliance\nRequirement,Status,Value\n");
            complianceRecordRepository.findAll().forEach(c ->
                csv.append(c.getRequirement()).append(",").append(c.getStatus()).append(",").append(c.getValue()).append("\n"));
            csv.append("\n");
        }
        if ("wellness".equals(type) || sections.contains("wellness")) {
            csv.append("Wellness\nStaff ID,Overtime,Risk,Score\n");
            wellnessRecordRepository.findAll().forEach(w ->
                csv.append(w.getStaffId()).append(",").append(w.getOvertime()).append(",").append(w.getRiskLevel()).append(",").append(w.getScore()).append("\n"));
        }
        return csv.toString();
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
