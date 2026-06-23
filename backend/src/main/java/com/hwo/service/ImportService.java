package com.hwo.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hwo.entity.AuditLog;
import com.hwo.entity.DataImport;
import com.hwo.entity.Department;
import com.hwo.entity.Schedule;
import com.hwo.entity.Staff;
import com.hwo.entity.StaffRole;
import com.hwo.entity.WorkloadRecord;
import com.hwo.repository.AuditLogRepository;
import com.hwo.repository.DataImportRepository;
import com.hwo.repository.DepartmentRepository;
import com.hwo.repository.ScheduleRepository;
import com.hwo.repository.StaffRepository;
import com.hwo.repository.WorkloadRecordRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ImportService {

    private static final int MAX_ERROR_DETAILS = 25;
    private static final int BATCH_SIZE = 500;
    private static final int BULK_USER_LINK_THRESHOLD = 2000;
    private static final int MAX_SAMPLE_ROWS = 50_000;
    private static final int MIN_SAMPLE_ROWS = 100;
    private static final Set<String> IMPORT_TYPES = Set.of("staff", "shift", "patient");

    private final DepartmentRepository departmentRepository;
    private final StaffRoleService staffRoleService;
    private final StaffRepository staffRepository;
    private final WorkloadRecordRepository workloadRecordRepository;
    private final ScheduleRepository scheduleRepository;
    private final SettingsService settingsService;
    private final AuditLogRepository auditLogRepository;
    private final WellnessService wellnessService;
    private final DataImportRepository dataImportRepository;
    private final CurrentUserService currentUserService;
    private final IntegrationService integrationService;
    private final ObjectMapper objectMapper;

    public ImportService(DepartmentRepository departmentRepository,
                         StaffRoleService staffRoleService,
                         StaffRepository staffRepository,
                         WorkloadRecordRepository workloadRecordRepository,
                         ScheduleRepository scheduleRepository,
                         SettingsService settingsService,
                         AuditLogRepository auditLogRepository,
                         WellnessService wellnessService,
                         DataImportRepository dataImportRepository,
                         CurrentUserService currentUserService,
                         IntegrationService integrationService,
                         ObjectMapper objectMapper) {
        this.departmentRepository = departmentRepository;
        this.staffRoleService = staffRoleService;
        this.staffRepository = staffRepository;
        this.workloadRecordRepository = workloadRecordRepository;
        this.scheduleRepository = scheduleRepository;
        this.settingsService = settingsService;
        this.auditLogRepository = auditLogRepository;
        this.wellnessService = wellnessService;
        this.dataImportRepository = dataImportRepository;
        this.currentUserService = currentUserService;
        this.integrationService = integrationService;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> getMeta() {
        long staffCount = staffRepository.count();
        long workloadCount = workloadRecordRepository.count();
        long scheduleCount = scheduleRepository.count();
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("canManage", currentUserService.canManageData());
        meta.put("templates", listTemplateMetadata());
        meta.put("importTypes", IMPORT_TYPES);
        meta.put("lastImport", dataImportRepository.findFirstByOrderByImportedAtDesc()
            .map(this::toImportDto).orElse(null));
        meta.put("counts", Map.of(
            "staff", staffCount,
            "schedules", scheduleCount,
            "workloadRecords", workloadCount
        ));
        meta.put("validationSummary", buildValidationSummary());
        Map<String, Object> integrations = settingsService.getSection("integrations");
        meta.put("syncSchedule", Map.of(
            "syncFrequency", integrations.getOrDefault("syncFrequency", "daily"),
            "syncTimeUtc", integrations.getOrDefault("syncTimeUtc", "02:00"),
            "hisEnabled", integrations.getOrDefault("hisEnabled", false),
            "hrEnabled", integrations.getOrDefault("hrEnabled", false)
        ));
        meta.putAll(integrationService.buildDataIntegrationFields(workloadCount, staffCount));
        return meta;
    }

    public List<Map<String, Object>> listImportHistory(String startDate, String endDate) {
        List<DataImport> imports;
        if (startDate != null && !startDate.isBlank() && endDate != null && !endDate.isBlank()) {
            LocalDateTime start = LocalDate.parse(startDate).atStartOfDay();
            LocalDateTime end = LocalDate.parse(endDate).plusDays(1).atStartOfDay();
            imports = dataImportRepository.findByImportedAtBetweenOrderByImportedAtDesc(start, end);
        } else {
            imports = dataImportRepository.findAllByOrderByImportedAtDesc();
        }
        return imports.stream().limit(100).map(this::toImportDto).collect(Collectors.toList());
    }

    public List<Map<String, Object>> listTemplateMetadata() {
        return List.of(
            staffTemplateMeta(),
            shiftTemplateMeta(),
            patientTemplateMeta()
        );
    }

    public String buildTemplateCsv(String type) {
        List<Department> departments = departmentRepository.findAllOrderByName();
        List<StaffRole> roles = staffRoleService.getActiveRoles();

        String deptCode = departments.stream().findFirst().map(this::deptCode).orElse("");
        String deptCode2 = departments.stream().skip(1).findFirst().map(this::deptCode).orElse(deptCode);
        String roleRn = roles.stream().findFirst().map(StaffRole::getCode).orElse("");
        String rolePhys = roles.stream().skip(1).findFirst().map(StaffRole::getCode).orElse(roleRn);
        List<String> shiftTypes = settingsService.getShiftTypes();
        String shiftDay = shiftTypes.isEmpty() ? "Day" : shiftTypes.get(0);
        String shiftEvening = shiftTypes.size() > 1 ? shiftTypes.get(1) : shiftDay;
        String shiftNight = shiftTypes.size() > 2 ? shiftTypes.get(2) : shiftDay;
        String exampleDate = LocalDate.now().toString();

        StringBuilder sb = new StringBuilder();
        switch (type) {
            case "staff" -> {
                appendHeader(sb, "Staff Roster Import Template",
                    "One row per staff member. Use short codes from Configuration — not UUIDs.");
                appendReference(sb, "Department codes", departments, d -> deptCode(d) + " = " + d.getName());
                appendReference(sb, "Role codes", roles, r -> r.getCode() + " = " + r.getName());
                sb.append("\nname,email,role_code,department_code\n");
                sb.append("Jane Smith,jane.smith@hospital.org,").append(roleRn).append(",").append(deptCode).append("\n");
                sb.append("John Doe,john.doe@hospital.org,").append(rolePhys).append(",").append(deptCode).append("\n");
                sb.append("Maria Garcia,maria.garcia@hospital.org,").append(roleRn).append(",").append(deptCode2).append("\n");
            }
            case "shift" -> {
                appendHeader(sb, "Shift Schedule Import Template",
                    "One row per scheduled shift. Staff must already exist (match by email).");
                appendReference(sb, "Department codes", departments, d -> deptCode(d) + " = " + d.getName());
                sb.append("# shift: ").append(String.join(" | ", shiftTypes)).append("\n");
                sb.append("# status: scheduled | confirmed | cancelled\n");
                sb.append("\nstaff_email,date,shift,status,department_code\n");
                sb.append("jane.smith@hospital.org,").append(exampleDate).append(",").append(shiftDay).append(",scheduled,").append(deptCode).append("\n");
                sb.append("jane.smith@hospital.org,").append(exampleDate).append(",").append(shiftEvening).append(",scheduled,").append(deptCode).append("\n");
                sb.append("john.doe@hospital.org,").append(exampleDate).append(",").append(shiftNight).append(",scheduled,").append(deptCode2).append("\n");
            }
            case "patient" -> {
                appendHeader(sb, "Patient / Workload Volume Import Template",
                    "Hourly workload metrics per department. Used for workload charts and AI training.");
                appendReference(sb, "Department codes", departments, d -> deptCode(d) + " = " + d.getName());
                sb.append("# hour: 0-23 (24-hour clock)\n");
                sb.append("# workload: 0-100 percentage\n");
                sb.append("\ndate,hour,department_code,patient_volume,workload,staff_on_duty\n");
                sb.append(exampleDate).append(",8,").append(deptCode).append(",45,72.5,12\n");
                sb.append(exampleDate).append(",9,").append(deptCode).append(",52,81.0,12\n");
                sb.append(exampleDate).append(",10,").append(deptCode2).append(",48,76.2,11\n");
                sb.append(exampleDate).append(",14,").append(deptCode2).append(",61,88.4,13\n");
            }
            default -> {
                return null;
            }
        }
        return sb.toString().trim();
    }

    /**
     * Generates a realistic bulk CSV for load testing. Staff rows use unique emails;
     * shift rows reference staff{n}@hospital.org; workload rows span departments × hours × days.
     */
    public String generateBulkSampleCsv(String type, int rows) {
        if (!IMPORT_TYPES.contains(type)) {
            return null;
        }
        if (rows < MIN_SAMPLE_ROWS || rows > MAX_SAMPLE_ROWS) {
            throw new IllegalArgumentException(
                "Row count must be between " + MIN_SAMPLE_ROWS + " and " + MAX_SAMPLE_ROWS);
        }
        List<String> deptCodes = departmentRepository.findAllOrderByName().stream()
            .map(this::deptCode).filter(c -> !c.isBlank()).toList();
        if (deptCodes.isEmpty()) {
            deptCodes = List.of("EMERGENCY", "ICU", "SURGERY", "PEDIATRICS", "GENERALMEDICINE", "RADIOLOGY");
        }
        List<String> roleCodes = staffRoleService.getActiveRoles().stream()
            .map(StaffRole::getCode).filter(c -> c != null && !c.isBlank()).toList();
        if (roleCodes.isEmpty()) {
            roleCodes = List.of("RN", "PHYS", "NP", "LPN", "RT", "ADMIN");
        }
        List<String> shiftTypes = settingsService.getShiftTypes();
        if (shiftTypes.isEmpty()) {
            shiftTypes = List.of("Day", "Evening", "Night");
        }
        String[] firstNames = {"Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Quinn", "Avery", "Cameron"};
        String[] lastNames = {"Chen", "Patel", "Garcia", "Kim", "Nguyen", "Brooks", "Rivera", "Sharma", "Wilson", "Okonkwo"};

        StringBuilder sb = new StringBuilder(rows * 96);
        LocalDate today = LocalDate.now();

        switch (type) {
            case "staff" -> {
                appendHeader(sb, "Staff Roster Bulk Sample (" + rows + " rows)",
                    "Import this file first. Each row has a unique email for shift imports.");
                sb.append("\nname,email,role_code,department_code\n");
                for (int i = 0; i < rows; i++) {
                    String name = firstNames[i % firstNames.length] + " " + lastNames[(i / firstNames.length) % lastNames.length] + " " + (i + 1);
                    sb.append(name).append(",staff").append(i).append("@hospital.org,")
                        .append(roleCodes.get(i % roleCodes.size())).append(",")
                        .append(deptCodes.get(i % deptCodes.size())).append("\n");
                }
            }
            case "shift" -> {
                appendHeader(sb, "Shift Schedule Bulk Sample (" + rows + " rows)",
                    "Import after staff. References staff0@hospital.org through staff emails in the pool.");
                sb.append("\nstaff_email,date,shift,status,department_code\n");
                int staffPool = Math.min(rows, 20_000);
                for (int i = 0; i < rows; i++) {
                    int staffIdx = (i / 3) % staffPool;
                    int dayOffset = i % 140;
                    String shift = shiftTypes.get(i % shiftTypes.size());
                    LocalDate date = today.minusDays(dayOffset);
                    sb.append("staff").append(staffIdx).append("@hospital.org,")
                        .append(date).append(",").append(shift).append(",scheduled,")
                        .append(deptCodes.get(i % deptCodes.size())).append("\n");
                }
            }
            case "patient" -> {
                appendHeader(sb, "Workload Volume Bulk Sample (" + rows + " rows)",
                    "Hourly metrics per department — feeds workload charts and AI training.");
                sb.append("\ndate,hour,department_code,patient_volume,workload,staff_on_duty\n");
                int slotsPerDay = deptCodes.size() * 24;
                for (int i = 0; i < rows; i++) {
                    int dayOffset = i / slotsPerDay;
                    int remainder = i % slotsPerDay;
                    int hour = remainder % 24;
                    int deptIdx = remainder / 24;
                    LocalDate date = today.minusDays(dayOffset % 150);
                    int patientVol = 28 + (i % 45);
                    double workload = Math.min(99.0, 52 + (i % 40) + (hour >= 8 && hour <= 18 ? 8 : 0));
                    int onDuty = 8 + (i % 14);
                    sb.append(date).append(",").append(hour).append(",")
                        .append(deptCodes.get(deptIdx % deptCodes.size())).append(",")
                        .append(patientVol).append(",").append(String.format(Locale.ROOT, "%.1f", workload)).append(",")
                        .append(onDuty).append("\n");
                }
            }
            default -> {
                return null;
            }
        }
        return sb.toString();
    }

    @Transactional
    public Map<String, Object> importFile(MultipartFile file, String type) throws Exception {
        if (!IMPORT_TYPES.contains(type)) {
            return Map.of("error", "Unknown import type: " + type);
        }
        String filename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "upload";
        if (filename.toLowerCase(Locale.ROOT).endsWith(".xlsx") || filename.toLowerCase(Locale.ROOT).endsWith(".xls")) {
            return Map.of("error", "Excel files are not supported. Download a CSV template and upload a .csv file.");
        }

        List<String[]> rows = parseCsv(file);
        if (rows.isEmpty()) {
            return Map.of("error", "No data rows found. Remove comment lines and include a header row.");
        }

        ImportCounters counters = new ImportCounters();
        List<String> errors = new ArrayList<>();

        switch (type) {
            case "staff" -> importStaffRows(rows, counters, errors);
            case "shift" -> importShiftRows(rows, counters, errors);
            case "patient" -> importWorkloadRows(rows, counters, errors);
            default -> {
                return Map.of("error", "Unknown import type: " + type);
            }
        }

        Map<String, Object> result = buildImportResult(type, filename, counters, errors);
        if ("staff".equals(type)) {
            return finalizeStaffImport(result, counters);
        }
        return result;
    }

    private Map<String, Object> finalizeStaffImport(Map<String, Object> result, ImportCounters counters) {
        if (counters.valid <= 0) {
            return result;
        }
        if (counters.valid <= BULK_USER_LINK_THRESHOLD) {
            int linked = wellnessService.ensureStaffUserAccounts();
            result.put("usersLinked", linked);
        } else {
            result.put("usersLinked", 0);
            result.put("linkNotice",
                "Bulk staff import — user accounts were not auto-created. Restart backend or run account sync.");
        }
        return result;
    }

    private void importStaffRows(List<String[]> rows, ImportCounters counters, List<String> errors) {
        Map<String, Integer> col = columnIndex(rows.get(0));
        ImportContext ctx = buildImportContext();
        Set<String> knownEmails = new HashSet<>(staffRepository.findAllEmailsLowerCase());
        List<Staff> batch = new ArrayList<>(BATCH_SIZE);

        for (int i = 1; i < rows.size(); i++) {
            String[] row = rows.get(i);
            String name = cell(row, col, "name");
            String email = cell(row, col, "email");
            String roleCode = cell(row, col, "role_code");
            String deptCode = cell(row, col, "department_code");
            if (name == null || roleCode == null || deptCode == null) {
                counters.missing++;
                continue;
            }
            Department dept = ctx.resolveDepartment(deptCode);
            StaffRole role = ctx.resolveRole(roleCode);
            if (dept == null || role == null) {
                counters.missing++;
                if (errors.size() < MAX_ERROR_DETAILS) {
                    errors.add("Row " + (i + 1) + ": unknown department_code or role_code");
                }
                continue;
            }
            if (email != null) {
                String emailKey = email.toLowerCase(Locale.ROOT);
                if (knownEmails.contains(emailKey)) {
                    counters.duplicates++;
                    continue;
                }
                knownEmails.add(emailKey);
            }
            Staff staff = new Staff();
            staff.setId(UUID.randomUUID().toString());
            staff.setName(name);
            staff.setEmail(email);
            staff.setRole(role.getName());
            staff.setDepartmentId(dept.getId());
            batch.add(staff);
            if (batch.size() >= BATCH_SIZE) {
                staffRepository.saveAll(batch);
                counters.valid += batch.size();
                batch.clear();
            }
        }
        if (!batch.isEmpty()) {
            staffRepository.saveAll(batch);
            counters.valid += batch.size();
        }
    }

    private void importShiftRows(List<String[]> rows, ImportCounters counters, List<String> errors) {
        Map<String, Integer> col = columnIndex(rows.get(0));
        ImportContext ctx = buildImportContext();
        Map<String, Staff> staffByEmail = staffRepository.findAll().stream()
            .filter(s -> s.getEmail() != null && !s.getEmail().isBlank())
            .collect(Collectors.toMap(s -> s.getEmail().toLowerCase(Locale.ROOT), s -> s, (a, b) -> a));
        Set<String> seenKeys = new HashSet<>();
        List<Schedule> batch = new ArrayList<>(BATCH_SIZE);

        for (int i = 1; i < rows.size(); i++) {
            String[] row = rows.get(i);
            String email = cell(row, col, "staff_email");
            String dateStr = cell(row, col, "date");
            String shift = cell(row, col, "shift");
            String deptCode = cell(row, col, "department_code");
            if (email == null || dateStr == null || shift == null || deptCode == null) {
                counters.missing++;
                continue;
            }
            Staff staff = staffByEmail.get(email.toLowerCase(Locale.ROOT));
            if (staff == null) {
                counters.missing++;
                if (errors.size() < MAX_ERROR_DETAILS) {
                    errors.add("Row " + (i + 1) + ": staff email not found");
                }
                continue;
            }
            Department dept = ctx.resolveDepartment(deptCode);
            if (dept == null) {
                counters.missing++;
                if (errors.size() < MAX_ERROR_DETAILS) {
                    errors.add("Row " + (i + 1) + ": unknown department_code");
                }
                continue;
            }
            LocalDateTime dayStart;
            try {
                dayStart = LocalDate.parse(dateStr).atStartOfDay();
            } catch (Exception e) {
                counters.missing++;
                if (errors.size() < MAX_ERROR_DETAILS) {
                    errors.add("Row " + (i + 1) + ": invalid date");
                }
                continue;
            }
            String dedupeKey = staff.getId() + "|" + dateStr + "|" + shift.toLowerCase(Locale.ROOT);
            if (!seenKeys.add(dedupeKey)) {
                counters.duplicates++;
                continue;
            }
            Schedule schedule = new Schedule();
            schedule.setId(UUID.randomUUID().toString());
            schedule.setStaffId(staff.getId());
            schedule.setDepartmentId(dept.getId());
            schedule.setDate(dayStart);
            schedule.setShift(shift);
            schedule.setStatus(cell(row, col, "status") != null ? cell(row, col, "status") : "scheduled");
            schedule.setSwapRequested(false);
            batch.add(schedule);
            if (batch.size() >= BATCH_SIZE) {
                scheduleRepository.saveAll(batch);
                counters.valid += batch.size();
                batch.clear();
            }
        }
        if (!batch.isEmpty()) {
            scheduleRepository.saveAll(batch);
            counters.valid += batch.size();
        }
    }

    private void importWorkloadRows(List<String[]> rows, ImportCounters counters, List<String> errors) {
        Map<String, Integer> col = columnIndex(rows.get(0));
        ImportContext ctx = buildImportContext();
        Set<String> seenKeys = new HashSet<>();
        List<WorkloadRecord> batch = new ArrayList<>(BATCH_SIZE);

        for (int i = 1; i < rows.size(); i++) {
            String[] row = rows.get(i);
            String dateStr = cell(row, col, "date");
            String hourStr = cell(row, col, "hour");
            String deptCode = cell(row, col, "department_code");
            if (dateStr == null || hourStr == null || deptCode == null) {
                counters.missing++;
                continue;
            }
            Department dept = ctx.resolveDepartment(deptCode);
            if (dept == null) {
                counters.missing++;
                if (errors.size() < MAX_ERROR_DETAILS) {
                    errors.add("Row " + (i + 1) + ": unknown department_code");
                }
                continue;
            }
            int hour;
            try {
                hour = Integer.parseInt(hourStr);
            } catch (NumberFormatException e) {
                counters.missing++;
                if (errors.size() < MAX_ERROR_DETAILS) {
                    errors.add("Row " + (i + 1) + ": invalid hour");
                }
                continue;
            }
            String dedupeKey = dept.getId() + "|" + dateStr + "|" + hour;
            if (!seenKeys.add(dedupeKey)) {
                counters.duplicates++;
                continue;
            }
            LocalDateTime recordDate;
            try {
                recordDate = LocalDate.parse(dateStr).atStartOfDay().plusHours(hour);
            } catch (Exception e) {
                counters.missing++;
                if (errors.size() < MAX_ERROR_DETAILS) {
                    errors.add("Row " + (i + 1) + ": invalid date");
                }
                continue;
            }
            WorkloadRecord record = new WorkloadRecord();
            record.setId(UUID.randomUUID().toString());
            record.setDepartmentId(dept.getId());
            record.setDate(recordDate);
            record.setHour(hour);
            String pv = cell(row, col, "patient_volume");
            String wl = cell(row, col, "workload");
            String staffOnDuty = cell(row, col, "staff_on_duty");
            try {
                record.setPatientVolume(pv != null ? Integer.parseInt(pv) : 0);
                record.setWorkload(wl != null ? Double.parseDouble(wl) : 0);
                if (staffOnDuty != null) {
                    record.setStaffOnDuty(Integer.parseInt(staffOnDuty));
                }
            } catch (NumberFormatException e) {
                counters.missing++;
                if (errors.size() < MAX_ERROR_DETAILS) {
                    errors.add("Row " + (i + 1) + ": invalid numeric field");
                }
                continue;
            }
            batch.add(record);
            if (batch.size() >= BATCH_SIZE) {
                workloadRecordRepository.saveAll(batch);
                counters.valid += batch.size();
                batch.clear();
            }
        }
        if (!batch.isEmpty()) {
            workloadRecordRepository.saveAll(batch);
            counters.valid += batch.size();
        }
    }

    private Map<String, Object> buildImportResult(String type, String filename,
                                                  ImportCounters counters, List<String> errors) {
        int total = counters.valid + counters.duplicates + counters.missing;
        int quality = total > 0 ? Math.round((counters.valid * 100f) / total) : 0;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("imported", counters.valid);
        result.put("valid", counters.valid);
        result.put("validCount", counters.valid);
        result.put("duplicates", counters.duplicates);
        result.put("duplicateCount", counters.duplicates);
        result.put("missing", counters.missing);
        result.put("errorCount", counters.missing);
        result.put("quality", quality);
        result.put("total", total);
        if (!errors.isEmpty()) {
            result.put("errors", errors.stream().limit(MAX_ERROR_DETAILS).toList());
            if (errors.size() > MAX_ERROR_DETAILS) {
                result.put("errorsTruncated", true);
                result.put("totalErrors", errors.size());
            }
        }
        persistImportRecord(type, filename, counters, quality, errors);
        if (counters.valid > 0) {
            logAuditImport(type, counters.valid, filename);
        }
        return result;
    }

    private Map<String, Object> buildValidationSummary() {
        return dataImportRepository.findFirstByOrderByImportedAtDesc()
            .map(last -> {
                Map<String, Object> summary = new LinkedHashMap<>();
                summary.put("valid", last.getValidCount());
                summary.put("duplicates", last.getDuplicateCount());
                summary.put("missing", last.getErrorCount());
                summary.put("quality", last.getQuality());
                summary.put("lastImportAt", last.getImportedAt());
                summary.put("lastImportType", last.getType());
                summary.put("lastImportFilename", last.getFilename());
                return summary;
            })
            .orElseGet(() -> Map.of(
                "valid", 0,
                "duplicates", 0,
                "missing", 0,
                "quality", 0
            ));
    }

    private void persistImportRecord(String type, String filename, ImportCounters counters,
                                     int quality, List<String> errors) {
        DataImport record = new DataImport();
        record.setId(UUID.randomUUID().toString());
        record.setFilename(filename);
        record.setType(type);
        record.setValidCount(counters.valid);
        record.setDuplicateCount(counters.duplicates);
        record.setErrorCount(counters.missing);
        record.setQuality(quality);
        record.setStatus(counters.valid > 0 ? "completed" : "failed");
        record.setImportedBy(currentUserService.currentUserId().orElse(null));
        record.setImportedAt(LocalDateTime.now());
        if (!errors.isEmpty()) {
            try {
                record.setErrorDetails(objectMapper.writeValueAsString(errors.stream().limit(50).toList()));
            } catch (Exception ignored) {
                record.setErrorDetails(String.join("\n", errors.stream().limit(20).toList()));
            }
        }
        dataImportRepository.save(record);
    }

    private void logAuditImport(String type, int valid, String filename) {
        AuditLog entry = new AuditLog();
        entry.setId(UUID.randomUUID().toString());
        entry.setAction("Data import");
        entry.setType("import");
        entry.setResource(type);
        entry.setDetails(valid + " records from " + (filename != null ? filename : "upload"));
        entry.setCreatedAt(LocalDateTime.now());
        auditLogRepository.save(entry);
    }

    private Map<String, Object> toImportDto(DataImport record) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", record.getId());
        dto.put("filename", record.getFilename());
        dto.put("type", record.getType());
        dto.put("validCount", record.getValidCount());
        dto.put("duplicateCount", record.getDuplicateCount());
        dto.put("errorCount", record.getErrorCount());
        dto.put("quality", record.getQuality());
        dto.put("status", record.getStatus());
        dto.put("importedAt", record.getImportedAt());
        dto.put("importedBy", record.getImportedBy());
        if (record.getErrorDetails() != null && !record.getErrorDetails().isBlank()) {
            try {
                dto.put("errors", objectMapper.readValue(record.getErrorDetails(), List.class));
            } catch (Exception e) {
                dto.put("errors", List.of(record.getErrorDetails()));
            }
        }
        return dto;
    }

    private Map<String, Object> staffTemplateMeta() {
        String exampleDept = departmentRepository.findAllOrderByName().stream().findFirst().map(this::deptCode).orElse("");
        String exampleRole = staffRoleService.getActiveRoles().stream().findFirst().map(StaffRole::getCode).orElse("");
        Map<String, Object> meta = baseMeta("staff", "Staff Roster", "staff_import_template.csv",
            "Import staff names, emails, roles, and department assignments using human-readable codes.");
        meta.put("fields", List.of(
            field("name", "Full name of the staff member", "Jane Smith", true),
            field("email", "Work email (optional but required for shift imports)", "jane.smith@hospital.org", false),
            field("role_code", "Role code from Configuration → Roles", exampleRole, true),
            field("department_code", "Department code from Configuration → Departments", exampleDept, true)
        ));
        return meta;
    }

    private Map<String, Object> shiftTemplateMeta() {
        String exampleShift = settingsService.getShiftTypes().stream().findFirst().orElse("Day");
        String exampleDept = departmentRepository.findAllOrderByName().stream().findFirst().map(this::deptCode).orElse("");
        Map<String, Object> meta = baseMeta("shift", "Shift Schedule", "shift_import_template.csv",
            "Import shift assignments. Staff must already exist in the system (matched by email).");
        meta.put("fields", List.of(
            field("staff_email", "Email of an existing staff member", "jane.smith@hospital.org", true),
            field("date", "Shift date in YYYY-MM-DD format", LocalDate.now().toString(), true),
            field("shift", "Shift type from Configuration → Scheduling", exampleShift, true),
            field("status", "scheduled, confirmed, or cancelled", "scheduled", false),
            field("department_code", "Department where the shift is assigned", exampleDept, true)
        ));
        return meta;
    }

    private Map<String, Object> patientTemplateMeta() {
        String exampleDept = departmentRepository.findAllOrderByName().stream().findFirst().map(this::deptCode).orElse("");
        Map<String, Object> meta = baseMeta("patient", "Patient / Workload Volume", "patient_import_template.csv",
            "Import hourly patient volume and workload metrics for analytics and AI forecasting.");
        meta.put("fields", List.of(
            field("date", "Record date in YYYY-MM-DD format", LocalDate.now().toString(), true),
            field("hour", "Hour of day using 24-hour clock (0-23)", "8", true),
            field("department_code", "Department code from Configuration → Departments", exampleDept, true),
            field("patient_volume", "Number of patients in that hour", "45", true),
            field("workload", "Workload intensity percentage (0-100)", "72.5", true),
            field("staff_on_duty", "Number of staff on duty that hour", "12", false)
        ));
        return meta;
    }

    private Map<String, Object> baseMeta(String type, String name, String filename, String description) {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("type", type);
        meta.put("name", name);
        meta.put("filename", filename);
        meta.put("description", description);
        return meta;
    }

    private Map<String, Object> field(String column, String description, String example, boolean required) {
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("column", column);
        f.put("description", description);
        f.put("example", example);
        f.put("required", required);
        return f;
    }

    private void appendHeader(StringBuilder sb, String title, String summary) {
        sb.append("# ").append(title).append("\n");
        sb.append("# ").append(summary).append("\n");
    }

    private <T> void appendReference(StringBuilder sb, String label, List<T> items, java.util.function.Function<T, String> formatter) {
        sb.append("#\n# REFERENCE — ").append(label).append(":\n");
        if (items.isEmpty()) {
            sb.append("# (none configured — add departments/roles in Configuration)\n");
        } else {
            items.forEach(item -> sb.append("# ").append(formatter.apply(item)).append("\n"));
        }
    }

    private String deptCode(Department d) {
        return d.getCode() != null && !d.getCode().isBlank() ? d.getCode() : d.getName().replaceAll("[^A-Za-z0-9]", "").toUpperCase();
    }

    private ImportContext buildImportContext() {
        Map<String, Department> deptByKey = new HashMap<>();
        for (Department dept : departmentRepository.findAllOrderByName()) {
            String code = deptCode(dept);
            if (!code.isBlank()) {
                deptByKey.put(code.toLowerCase(Locale.ROOT), dept);
            }
            if (dept.getName() != null && !dept.getName().isBlank()) {
                deptByKey.putIfAbsent(dept.getName().toLowerCase(Locale.ROOT), dept);
            }
            if (dept.getCode() != null && !dept.getCode().isBlank()) {
                deptByKey.putIfAbsent(dept.getCode().toLowerCase(Locale.ROOT), dept);
            }
        }
        Map<String, StaffRole> roleByKey = new HashMap<>();
        for (StaffRole role : staffRoleService.getActiveRoles()) {
            if (role.getCode() != null && !role.getCode().isBlank()) {
                roleByKey.put(role.getCode().toLowerCase(Locale.ROOT), role);
            }
            if (role.getName() != null && !role.getName().isBlank()) {
                roleByKey.putIfAbsent(role.getName().toLowerCase(Locale.ROOT), role);
            }
        }
        return new ImportContext(deptByKey, roleByKey);
    }

    private Optional<Department> resolveDepartment(String code) {
        if (code == null) return Optional.empty();
        return departmentRepository.findByCodeIgnoreCase(code.trim())
            .or(() -> departmentRepository.findAll().stream()
                .filter(d -> deptCode(d).equalsIgnoreCase(code.trim()) || d.getName().equalsIgnoreCase(code.trim()))
                .findFirst());
    }

    private Optional<StaffRole> resolveRole(String code) {
        return staffRoleService.findByCodeOrName(code);
    }

    private List<String[]> parseCsv(MultipartFile file) throws Exception {
        List<String[]> rows = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if (line.isEmpty() || line.startsWith("#")) continue;
                rows.add(line.split(",", -1));
            }
        }
        return rows;
    }

    private Map<String, Integer> columnIndex(String[] header) {
        Map<String, Integer> col = new HashMap<>();
        for (int i = 0; i < header.length; i++) {
            col.put(header[i].trim().toLowerCase(), i);
        }
        return col;
    }

    private String cell(String[] row, Map<String, Integer> col, String name) {
        Integer idx = col.get(name.toLowerCase());
        if (idx == null || idx >= row.length) return null;
        String value = row[idx].trim();
        return value.isEmpty() ? null : value;
    }

    private static final class ImportCounters {
        int valid;
        int duplicates;
        int missing;
    }

    private static final class ImportContext {
        private final Map<String, Department> deptByKey;
        private final Map<String, StaffRole> roleByKey;

        ImportContext(Map<String, Department> deptByKey, Map<String, StaffRole> roleByKey) {
            this.deptByKey = deptByKey;
            this.roleByKey = roleByKey;
        }

        Department resolveDepartment(String code) {
            if (code == null) return null;
            return deptByKey.get(code.trim().toLowerCase(Locale.ROOT));
        }

        StaffRole resolveRole(String code) {
            if (code == null) return null;
            return roleByKey.get(code.trim().toLowerCase(Locale.ROOT));
        }
    }
}
