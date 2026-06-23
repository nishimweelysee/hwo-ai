package com.hwo.service;

import com.hwo.domain.RolePermissions;
import com.hwo.entity.Certification;
import com.hwo.entity.Department;
import com.hwo.entity.Staff;
import com.hwo.entity.TrainingEnrollment;
import com.hwo.entity.TrainingProgram;
import com.hwo.repository.CertificationRepository;
import com.hwo.repository.DepartmentRepository;
import com.hwo.repository.StaffRepository;
import com.hwo.repository.TrainingEnrollmentRepository;
import com.hwo.repository.TrainingProgramRepository;
import com.hwo.util.MapValueUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class SkillService {

    private static final Set<String> CERT_STATUSES = Set.of("active", "expiring", "expired", "revoked");

    private final CertificationRepository certificationRepository;
    private final StaffRepository staffRepository;
    private final DepartmentRepository departmentRepository;
    private final TrainingProgramRepository trainingProgramRepository;
    private final TrainingEnrollmentRepository trainingEnrollmentRepository;
    private final SettingsService settingsService;
    private final SkillsAiService skillsAiService;
    private final CurrentUserService currentUserService;

    public SkillService(CertificationRepository certificationRepository,
                        StaffRepository staffRepository,
                        DepartmentRepository departmentRepository,
                        TrainingProgramRepository trainingProgramRepository,
                        TrainingEnrollmentRepository trainingEnrollmentRepository,
                        SettingsService settingsService,
                        SkillsAiService skillsAiService,
                        CurrentUserService currentUserService) {
        this.certificationRepository = certificationRepository;
        this.staffRepository = staffRepository;
        this.departmentRepository = departmentRepository;
        this.trainingProgramRepository = trainingProgramRepository;
        this.trainingEnrollmentRepository = trainingEnrollmentRepository;
        this.settingsService = settingsService;
        this.skillsAiService = skillsAiService;
        this.currentUserService = currentUserService;
    }

    public Map<String, Object> getDashboard() {
        List<Certification> certs = certificationRepository.findAll();
        List<Staff> staffList = staffRepository.findAll();
        List<Department> departments = departmentRepository.findAll();
        Map<String, Staff> staffById = staffList.stream()
            .collect(Collectors.toMap(Staff::getId, s -> s, (a, b) -> a));
        Map<String, List<Certification>> certsByStaff = certs.stream()
            .collect(Collectors.groupingBy(Certification::getStaffId));

        int warningDays = expiryWarningDays();
        List<Map<String, Object>> certificationDtos = certs.stream()
            .map(c -> toCertDto(c, staffById.get(c.getStaffId()), warningDays))
            .collect(Collectors.toList());

        List<Map<String, Object>> skillGaps = computeRequirementGaps(staffList, certsByStaff, departments);
        List<Map<String, Object>> trainingNeeds = buildTrainingNeeds(certs, staffById, skillGaps, warningDays);
        List<Map<String, Object>> skillMatrix = buildSkillMatrix(certs, staffList, departments);
        List<Map<String, Object>> developmentPrograms = listDevelopmentPrograms();

        long expiringCount = certificationDtos.stream()
            .filter(c -> "expiring".equals(c.get("status")) || "expired".equals(c.get("status")))
            .count();
        Set<String> uniqueCerts = certs.stream().map(Certification::getName).collect(Collectors.toSet());

        List<Map<String, Object>> aiTraining = skillsAiService.prioritizeTraining(trainingNeeds, skillGaps);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("certifications", certificationDtos);
        result.put("totalSkills", uniqueCerts.size());
        result.put("staffWithProfiles", staffList.size());
        result.put("expiringCount", expiringCount);
        result.put("skillGaps", skillGaps.size());
        result.put("skillMatrix", skillMatrix);
        result.put("trainingNeeds", trainingNeeds);
        result.put("aiTrainingPriorities", aiTraining);
        result.put("developmentPrograms", developmentPrograms);
        result.put("departmentCoverage", buildDepartmentCoverage(staffList, certsByStaff, departments));
        result.put("aiHealth", skillsAiService.getAiHealth());
        result.put("aiGapAnalysis", skillsAiService.analyzeGaps(buildDepartmentCoverage(staffList, certsByStaff, departments)));
        result.put("canManage", canManage());
        return result;
    }

    public Map<String, Object> getMeta() {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("statuses", CERT_STATUSES);
        meta.put("staff", staffRepository.findAll().stream()
            .map(s -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", s.getId());
                row.put("name", s.getName());
                row.put("email", s.getEmail());
                row.put("role", s.getRole());
                row.put("department", s.getDepartment() != null ? s.getDepartment().getName() : "");
                return row;
            })
            .collect(Collectors.toList()));
        meta.put("departments", departmentRepository.findAll().stream()
            .map(d -> Map.of("id", d.getId(), "name", d.getName()))
            .collect(Collectors.toList()));
        meta.put("certCatalog", certCatalog());
        meta.put("skillsSettings", skillsSettingsMap());
        meta.put("canManage", canManage());
        return meta;
    }

    public List<Map<String, Object>> listCertifications(String search, String status, String departmentId) {
        Map<String, Staff> staffById = staffRepository.findAll().stream()
            .collect(Collectors.toMap(Staff::getId, s -> s, (a, b) -> a));
        int warningDays = expiryWarningDays();
        return certificationRepository.findAll().stream()
            .map(c -> toCertDto(c, staffById.get(c.getStaffId()), warningDays))
            .filter(c -> status == null || status.isBlank() || status.equals(c.get("status")))
            .filter(c -> departmentId == null || departmentId.isBlank()
                || departmentId.equals(c.get("departmentId")))
            .filter(c -> search == null || search.isBlank()
                || String.valueOf(c.get("certName")).toLowerCase().contains(search.toLowerCase())
                || String.valueOf(c.get("staffName")).toLowerCase().contains(search.toLowerCase()))
            .collect(Collectors.toList());
    }

    public Map<String, Object> getCertification(String id) {
        Certification cert = certificationRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Certification not found"));
        Staff staff = staffRepository.findById(cert.getStaffId()).orElse(null);
        return toCertDto(cert, staff, expiryWarningDays());
    }

    @Transactional
    public Map<String, Object> createCertification(Map<String, Object> body) {
        requireManageAccess();
        String staffId = MapValueUtils.stringValue(body.get("staffId"));
        String name = MapValueUtils.stringValue(body.get("name"));
        if (staffId == null || staffRepository.findById(staffId).isEmpty()) {
            throw new IllegalArgumentException("Valid staff member is required");
        }
        if (name == null || name.isBlank()) throw new IllegalArgumentException("Certification name is required");
        requireCertInCatalog(name);

        Certification cert = new Certification();
        cert.setId(UUID.randomUUID().toString());
        cert.setStaffId(staffId);
        cert.setName(name.trim());
        applyCertFields(cert, body);
        certificationRepository.save(cert);
        Staff staff = staffRepository.findById(staffId).orElse(null);
        return toCertDto(cert, staff, expiryWarningDays());
    }

    @Transactional
    public Map<String, Object> updateCertification(String id, Map<String, Object> body) {
        requireManageAccess();
        Certification cert = certificationRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Certification not found"));
        String name = MapValueUtils.stringValue(body.get("name"));
        if (name != null && !name.isBlank()) {
            requireCertInCatalog(name);
            cert.setName(name.trim());
        }
        String staffId = MapValueUtils.stringValue(body.get("staffId"));
        if (staffId != null) {
            if (staffRepository.findById(staffId).isEmpty()) {
                throw new IllegalArgumentException("Invalid staff member");
            }
            cert.setStaffId(staffId);
        }
        applyCertFields(cert, body);
        certificationRepository.save(cert);
        Staff staff = staffRepository.findById(cert.getStaffId()).orElse(null);
        return toCertDto(cert, staff, expiryWarningDays());
    }

    @Transactional
    public void deleteCertification(String id) {
        requireManageAccess();
        if (certificationRepository.findById(id).isEmpty()) {
            throw new IllegalArgumentException("Certification not found");
        }
        certificationRepository.deleteById(id);
    }

    public String exportCertificationsCsv() {
        List<Certification> certs = certificationRepository.findAll();
        Map<String, Staff> staffById = staffRepository.findAll().stream()
            .collect(Collectors.toMap(Staff::getId, s -> s, (a, b) -> a));
        int warningDays = expiryWarningDays();
        StringBuilder csv = new StringBuilder("staff,certification,status,expiry,department,credential_id\n");
        for (Certification c : certs) {
            Map<String, Object> dto = toCertDto(c, staffById.get(c.getStaffId()), warningDays);
            csv.append(csvCell(String.valueOf(dto.get("staffName")))).append(",")
                .append(csvCell(String.valueOf(dto.get("certName")))).append(",")
                .append(csvCell(String.valueOf(dto.get("status")))).append(",")
                .append(csvCell(String.valueOf(dto.get("expiry")))).append(",")
                .append(csvCell(String.valueOf(dto.get("department")))).append(",")
                .append(csvCell(c.getCredentialId())).append("\n");
        }
        return csv.toString();
    }

    public Map<String, Object> getStaffDevelopment(String staffId) {
        Staff staff = staffRepository.findById(staffId)
            .orElseThrow(() -> new IllegalArgumentException("Staff not found"));
        List<Certification> certs = certificationRepository.findByStaffId(staffId);
        String deptName = staff.getDepartment() != null ? staff.getDepartment().getName() : "";
        List<String> gaps = requiredCertsForDepartment(deptName).stream()
            .filter(req -> certs.stream().noneMatch(c -> req.equalsIgnoreCase(c.getName()) && isValidCert(c)))
            .collect(Collectors.toList());
        long expiring = certs.stream()
            .filter(c -> {
                String st = resolveStatus(c, expiryWarningDays());
                return "expiring".equals(st) || "expired".equals(st);
            })
            .count();

        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("staffId", staffId);
        profile.put("role", staff.getRole());
        profile.put("department", deptName);
        profile.put("cert_count", certs.size());
        profile.put("expiring_count", expiring);
        profile.put("skill_gaps", gaps);
        profile.put("available_programs", trainingProgramRepository.findByActiveTrueOrderByNameAsc().stream()
            .map(TrainingProgram::getName).collect(Collectors.toList()));
        Map<String, Object> ai = skillsAiService.recommendDevelopment(profile);
        ai.put("staffId", staffId);
        ai.put("staffName", staff.getName());
        ai.put("skillGaps", gaps);
        return ai;
    }

    public Map<String, Object> getAiHealth() {
        return skillsAiService.getAiHealth();
    }

    public List<Map<String, Object>> listDevelopmentPrograms() {
        Map<String, String> staffNames = staffRepository.findAll().stream()
            .collect(Collectors.toMap(Staff::getId, Staff::getName, (a, b) -> a));
        return trainingProgramRepository.findAllByOrderByNameAsc().stream().map(program -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", program.getId());
            row.put("name", program.getName());
            row.put("description", program.getDescription());
            row.put("active", program.isActive());
            long enrolled = trainingEnrollmentRepository.countByProgramIdAndStatus(program.getId(), "enrolled");
            long completed = trainingEnrollmentRepository.countByProgramIdAndStatus(program.getId(), "completed");
            row.put("enrolled", enrolled);
            row.put("completed", completed);
            List<Map<String, Object>> enrollments = trainingEnrollmentRepository.findByProgramId(program.getId()).stream()
                .map(e -> toEnrollmentDto(e, staffNames.getOrDefault(e.getStaffId(), ""), program.getName()))
                .collect(Collectors.toList());
            row.put("enrollments", enrollments);
            return row;
        }).collect(Collectors.toList());
    }

    @Transactional
    public Map<String, Object> createProgram(Map<String, Object> body) {
        requireManageAccess();
        String name = MapValueUtils.stringValue(body.get("name"));
        if (name == null || name.isBlank()) throw new IllegalArgumentException("Program name is required");
        TrainingProgram program = new TrainingProgram();
        program.setId(UUID.randomUUID().toString());
        program.setName(name.trim());
        program.setDescription(MapValueUtils.stringValue(body.get("description")));
        program.setActive(!Boolean.FALSE.equals(body.get("active")));
        program.setCreatedAt(LocalDateTime.now());
        trainingProgramRepository.save(program);
        return Map.of("id", program.getId(), "name", program.getName(), "description", program.getDescription() != null ? program.getDescription() : "");
    }

    @Transactional
    public Map<String, Object> updateProgram(String id, Map<String, Object> body) {
        requireManageAccess();
        TrainingProgram program = trainingProgramRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Program not found"));
        String name = MapValueUtils.stringValue(body.get("name"));
        if (name != null && !name.isBlank()) program.setName(name.trim());
        if (body.containsKey("description")) program.setDescription(MapValueUtils.stringValue(body.get("description")));
        if (body.containsKey("active")) program.setActive(Boolean.TRUE.equals(body.get("active")));
        trainingProgramRepository.save(program);
        return Map.of("id", program.getId(), "name", program.getName());
    }

    @Transactional
    public void deleteProgram(String id) {
        requireManageAccess();
        trainingEnrollmentRepository.findByProgramId(id).forEach(trainingEnrollmentRepository::delete);
        trainingProgramRepository.deleteById(id);
    }

    @Transactional
    public Map<String, Object> enrollStaff(Map<String, Object> body) {
        requireManageAccess();
        String programId = MapValueUtils.stringValue(body.get("programId"));
        String staffId = MapValueUtils.stringValue(body.get("staffId"));
        if (programId == null || trainingProgramRepository.findById(programId).isEmpty()) {
            throw new IllegalArgumentException("Valid program is required");
        }
        if (staffId == null || staffRepository.findById(staffId).isEmpty()) {
            throw new IllegalArgumentException("Valid staff member is required");
        }
        TrainingEnrollment enrollment = new TrainingEnrollment();
        enrollment.setId(UUID.randomUUID().toString());
        enrollment.setProgramId(programId);
        enrollment.setStaffId(staffId);
        enrollment.setStatus("enrolled");
        enrollment.setEnrolledAt(LocalDateTime.now());
        enrollment.setNotes(MapValueUtils.stringValue(body.get("notes")));
        trainingEnrollmentRepository.save(enrollment);
        TrainingProgram program = trainingProgramRepository.findById(programId).orElseThrow();
        Staff staff = staffRepository.findById(staffId).orElseThrow();
        return toEnrollmentDto(enrollment, staff.getName(), program.getName());
    }

    @Transactional
    public Map<String, Object> completeEnrollment(String id) {
        requireManageAccess();
        TrainingEnrollment enrollment = trainingEnrollmentRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Enrollment not found"));
        enrollment.setStatus("completed");
        enrollment.setCompletedAt(LocalDateTime.now());
        trainingEnrollmentRepository.save(enrollment);
        String programName = trainingProgramRepository.findById(enrollment.getProgramId())
            .map(TrainingProgram::getName).orElse("");
        String staffName = staffRepository.findById(enrollment.getStaffId()).map(Staff::getName).orElse("");
        return toEnrollmentDto(enrollment, staffName, programName);
    }

    @Transactional
    public void deleteEnrollment(String id) {
        requireManageAccess();
        trainingEnrollmentRepository.deleteById(id);
    }

    private Map<String, Object> toEnrollmentDto(TrainingEnrollment e, String staffName, String programName) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", e.getId());
        dto.put("programId", e.getProgramId());
        dto.put("programName", programName);
        dto.put("staffId", e.getStaffId());
        dto.put("staffName", staffName);
        dto.put("status", e.getStatus());
        dto.put("enrolledAt", e.getEnrolledAt());
        dto.put("completedAt", e.getCompletedAt());
        dto.put("notes", e.getNotes());
        return dto;
    }

    private void applyCertFields(Certification cert, Map<String, Object> body) {
        String expiry = MapValueUtils.stringValue(body.get("expiryDate"));
        if (expiry == null) expiry = MapValueUtils.stringValue(body.get("expiry"));
        if (expiry != null && !expiry.isBlank()) {
            cert.setExpiryDate(LocalDate.parse(expiry.substring(0, 10)).atStartOfDay());
        }
        String issued = MapValueUtils.stringValue(body.get("issuedDate"));
        if (issued != null && !issued.isBlank()) {
            cert.setIssuedDate(LocalDate.parse(issued.substring(0, 10)).atStartOfDay());
        }
        String status = MapValueUtils.stringValue(body.get("status"));
        if (status != null && CERT_STATUSES.contains(status)) cert.setStatus(status);
        else if (cert.getExpiryDate() != null) cert.setStatus(resolveStatus(cert, expiryWarningDays()));
        String credentialId = MapValueUtils.stringValue(body.get("credentialId"));
        if (credentialId != null) cert.setCredentialId(credentialId);
        String notes = MapValueUtils.stringValue(body.get("notes"));
        if (notes != null) cert.setNotes(notes);
    }

    private Map<String, Object> toCertDto(Certification c, Staff staff, int warningDays) {
        String status = c.getStatus() != null ? c.getStatus() : resolveStatus(c, warningDays);
        if ("active".equals(status) && c.getExpiryDate() != null) {
            status = resolveStatus(c, warningDays);
        }
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", c.getId());
        dto.put("staffId", c.getStaffId());
        dto.put("staffName", staff != null ? staff.getName() : "Unknown");
        dto.put("certName", c.getName());
        dto.put("name", c.getName() + (staff != null ? " - " + staff.getName() : ""));
        dto.put("expiry", c.getExpiryDate() != null ? c.getExpiryDate().toLocalDate().toString() : "");
        dto.put("issuedDate", c.getIssuedDate() != null ? c.getIssuedDate().toLocalDate().toString() : "");
        dto.put("status", status);
        dto.put("credentialId", c.getCredentialId());
        dto.put("notes", c.getNotes());
        dto.put("department", staff != null && staff.getDepartment() != null ? staff.getDepartment().getName() : "");
        dto.put("departmentId", staff != null ? staff.getDepartmentId() : "");
        if (c.getExpiryDate() != null) {
            long days = ChronoUnit.DAYS.between(LocalDate.now(), c.getExpiryDate().toLocalDate());
            dto.put("daysToExpiry", days);
        }
        return dto;
    }

    private String resolveStatus(Certification c, int warningDays) {
        if (c.getExpiryDate() == null) return "active";
        LocalDate expiry = c.getExpiryDate().toLocalDate();
        if (expiry.isBefore(LocalDate.now())) return "expired";
        if (!expiry.isAfter(LocalDate.now().plusDays(warningDays))) return "expiring";
        return "active";
    }

    private boolean isValidCert(Certification c) {
        String status = resolveStatus(c, expiryWarningDays());
        return "active".equals(status) || "expiring".equals(status);
    }

    private List<Map<String, Object>> computeRequirementGaps(List<Staff> staff,
                                                             Map<String, List<Certification>> certsByStaff,
                                                             List<Department> departments) {
        Map<String, List<String>> deptReqs = departmentSkillRequirements();
        List<Map<String, Object>> gaps = new ArrayList<>();
        for (Department dept : departments) {
            if (!dept.isActive()) continue;
            List<String> required = requiredCertsForDepartment(dept.getName(), deptReqs);
            if (required.isEmpty()) continue;
            List<Staff> deptStaff = staff.stream()
                .filter(s -> dept.getId().equals(s.getDepartmentId()))
                .collect(Collectors.toList());
            for (String certName : required) {
                List<String> missingStaff = deptStaff.stream()
                    .filter(s -> certsByStaff.getOrDefault(s.getId(), List.of()).stream()
                        .noneMatch(c -> certName.equalsIgnoreCase(c.getName()) && isValidCert(c)))
                    .map(Staff::getName)
                    .collect(Collectors.toList());
                if (!missingStaff.isEmpty()) {
                    Map<String, Object> gap = new LinkedHashMap<>();
                    gap.put("id", dept.getId() + ":" + certName);
                    gap.put("department", dept.getName());
                    gap.put("departmentId", dept.getId());
                    gap.put("certification", certName);
                    gap.put("staffCount", missingStaff.size());
                    gap.put("missingStaff", missingStaff);
                    gap.put("gapType", "requirement");
                    gap.put("coveragePercent", deptStaff.isEmpty() ? 0
                        : (int) Math.round(((deptStaff.size() - missingStaff.size()) * 100.0) / deptStaff.size()));
                    gap.put("description", missingStaff.size() + " staff in " + dept.getName()
                        + " missing required " + certName);
                    gaps.add(gap);
                }
            }
        }
        return gaps;
    }

    private List<Map<String, Object>> buildTrainingNeeds(List<Certification> certs,
                                                         Map<String, Staff> staffById,
                                                         List<Map<String, Object>> requirementGaps,
                                                         int warningDays) {
        List<Map<String, Object>> needs = new ArrayList<>(requirementGaps);
        LocalDateTime cutoff = LocalDateTime.now().plusDays(warningDays);
        Map<String, Long> expiringByCert = certs.stream()
            .filter(c -> c.getExpiryDate() != null && c.getExpiryDate().isBefore(cutoff))
            .filter(c -> !"revoked".equals(c.getStatus()))
            .collect(Collectors.groupingBy(Certification::getName, Collectors.counting()));
        for (Map.Entry<String, Long> entry : expiringByCert.entrySet()) {
            Map<String, Object> need = new LinkedHashMap<>();
            need.put("id", "renewal:" + entry.getKey());
            need.put("certification", entry.getKey());
            need.put("staffCount", entry.getValue());
            need.put("gapType", "renewal");
            need.put("description", entry.getValue() + " staff need renewal training for " + entry.getKey());
            needs.add(need);
        }
        return needs;
    }

    private List<Map<String, Object>> buildSkillMatrix(List<Certification> certs,
                                                        List<Staff> staffList,
                                                        List<Department> departments) {
        Set<String> certNames = new LinkedHashSet<>();
        certCatalog().forEach(certNames::add);
        certs.stream().map(Certification::getName).forEach(certNames::add);
        departmentSkillRequirements().values().stream().flatMap(Collection::stream).forEach(certNames::add);

        List<String> deptNames = departments.stream()
            .filter(Department::isActive)
            .map(Department::getName)
            .collect(Collectors.toList());

        return certNames.stream().map(certName -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("skill", certName);
            Map<String, Integer> counts = new LinkedHashMap<>();
            for (String dept : deptNames) {
                int count = (int) certs.stream()
                    .filter(c -> certName.equalsIgnoreCase(c.getName()) && isValidCert(c))
                    .filter(c -> staffList.stream()
                        .anyMatch(s -> s.getId().equals(c.getStaffId())
                            && s.getDepartment() != null && dept.equals(s.getDepartment().getName())))
                    .count();
                counts.put(dept, count);
            }
            row.put("counts", counts);
            row.put("total", counts.values().stream().mapToInt(Integer::intValue).sum());
            return row;
        }).filter(row -> (int) row.get("total") > 0 || certCatalog().contains(row.get("skill")))
            .collect(Collectors.toList());
    }

    private List<Map<String, Object>> buildDepartmentCoverage(List<Staff> staff,
                                                              Map<String, List<Certification>> certsByStaff,
                                                              List<Department> departments) {
        Map<String, List<String>> deptReqs = departmentSkillRequirements();
        List<Map<String, Object>> coverage = new ArrayList<>();
        for (Department dept : departments) {
            if (!dept.isActive()) continue;
            List<String> required = requiredCertsForDepartment(dept.getName(), deptReqs);
            List<Staff> deptStaff = staff.stream()
                .filter(s -> dept.getId().equals(s.getDepartmentId()))
                .collect(Collectors.toList());
            long qualified = deptStaff.stream()
                .filter(s -> required.isEmpty() || required.stream().allMatch(req ->
                    certsByStaff.getOrDefault(s.getId(), List.of()).stream()
                        .anyMatch(c -> req.equalsIgnoreCase(c.getName()) && isValidCert(c))))
                .count();
            List<Map<String, Object>> missingBreakdown = new ArrayList<>();
            for (String cert : required) {
                int missing = (int) deptStaff.stream()
                    .filter(s -> certsByStaff.getOrDefault(s.getId(), List.of()).stream()
                        .noneMatch(c -> cert.equalsIgnoreCase(c.getName()) && isValidCert(c)))
                    .count();
                if (missing > 0) {
                    missingBreakdown.add(Map.of("cert", cert, "missing", missing));
                }
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("department", dept.getName());
            row.put("name", dept.getName());
            row.put("requiredCerts", required);
            row.put("staffTotal", deptStaff.size());
            row.put("qualifiedStaff", (int) qualified);
            row.put("coveragePercent", deptStaff.isEmpty() ? 100
                : (int) Math.round((qualified * 100.0) / deptStaff.size()));
            row.put("missingBreakdown", missingBreakdown);
            coverage.add(row);
        }
        return coverage;
    }

    private List<String> requiredCertsForDepartment(String departmentName) {
        return requiredCertsForDepartment(departmentName, departmentSkillRequirements());
    }

    private List<String> requiredCertsForDepartment(String departmentName, Map<String, List<String>> configured) {
        List<String> required = new ArrayList<>();
        if (departmentName == null) return required;
        for (Map.Entry<String, List<String>> entry : configured.entrySet()) {
            if (departmentName.equalsIgnoreCase(entry.getKey())) {
                required.addAll(entry.getValue());
            }
        }
        return required.stream().distinct().collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private Map<String, List<String>> departmentSkillRequirements() {
        Object raw = settingsService.getSchedulingConstraints().get("departmentSkillRequirements");
        if (!(raw instanceof Map<?, ?> map)) {
            return Map.of();
        }
        Map<String, List<String>> result = new LinkedHashMap<>();
        map.forEach((k, v) -> {
            if (v instanceof List<?> list) {
                result.put(String.valueOf(k), list.stream().map(String::valueOf).collect(Collectors.toList()));
            }
        });
        return result;
    }

    @SuppressWarnings("unchecked")
    private List<String> certCatalog() {
        return settingsService.configuredCertCatalog();
    }

    private void requireCertInCatalog(String name) {
        List<String> catalog = certCatalog();
        if (catalog.isEmpty()) {
            throw new IllegalArgumentException(
                "Configure the certification catalog in Configuration → Skills before assigning certifications");
        }
        boolean found = catalog.stream().anyMatch(c -> c.equalsIgnoreCase(name.trim()));
        if (!found) {
            throw new IllegalArgumentException(
                "Certification must be from the configured catalog: " + String.join(", ", catalog));
        }
    }

    private Map<String, Object> skillsSettingsMap() {
        Map<String, Object> settings = new LinkedHashMap<>();
        settings.put("expiryWarningDays", expiryWarningDays());
        settings.put("certCatalog", certCatalog());
        settings.put("trainingPrograms", settingsService.getSection("skills").get("trainingPrograms"));
        settings.put("autoTrainingAlerts", settingsService.getBoolean("skills", "autoTrainingAlerts", true));
        return settings;
    }

    private int expiryWarningDays() {
        return Math.max(7, settingsService.getInt("skills", "expiryWarningDays", 30));
    }

    private String csvCell(String value) {
        if (value == null) return "";
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }

    private boolean canManage() {
        return currentUserService.hasAction(RolePermissions.ALL)
            || currentUserService.hasAction(RolePermissions.ACTION_DATA_MANAGE)
            || currentUserService.hasAction(RolePermissions.ACTION_SETTINGS_MANAGE);
    }

    private void requireManageAccess() {
        if (!canManage()) throw new IllegalArgumentException("Insufficient permissions to manage certifications");
    }
}
