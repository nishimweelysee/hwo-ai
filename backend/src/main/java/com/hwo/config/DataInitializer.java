package com.hwo.config;

import com.hwo.entity.*;
import com.hwo.repository.*;
import com.hwo.service.SettingsService;
import com.hwo.service.WellnessService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
@Order(1)
public class DataInitializer implements CommandLineRunner {

    private static final String[] DEPARTMENTS = {
        "Emergency", "ICU", "Surgery", "Pediatrics", "General Medicine", "Radiology"
    };
    private static final int[] STAFF_COUNTS = {24, 18, 32, 20, 45, 12};
    private static final double[] WORKLOADS = {92, 88, 75, 68, 82, 71};
    private static final int[] HOURS = {0, 4, 8, 12, 16, 20};

    private final DepartmentRepository departmentRepository;
    private final WorkloadRecordRepository workloadRecordRepository;
    private final StaffRepository staffRepository;
    private final ResourceRepository resourceRepository;
    private final ResourceTransferRepository resourceTransferRepository;
    private final ProcurementRequestRepository procurementRequestRepository;
    private final CertificationRepository certificationRepository;
    private final ScheduleRepository scheduleRepository;
    private final WellnessRecordRepository wellnessRecordRepository;
    private final AuditLogRepository auditLogRepository;
    private final LeaveRequestRepository leaveRequestRepository;
    private final OnCallScheduleRepository onCallScheduleRepository;
    private final ComplianceRecordRepository complianceRecordRepository;
    private final WellnessInterventionRepository wellnessInterventionRepository;
    private final TrainingProgramRepository trainingProgramRepository;
    private final SettingsService settingsService;
    private final StaffRoleRepository staffRoleRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final WellnessService wellnessService;

    public DataInitializer(DepartmentRepository departmentRepository,
                           WorkloadRecordRepository workloadRecordRepository,
                           StaffRepository staffRepository,
                           ResourceRepository resourceRepository,
                           ResourceTransferRepository resourceTransferRepository,
                           ProcurementRequestRepository procurementRequestRepository,
                           CertificationRepository certificationRepository,
                           ScheduleRepository scheduleRepository,
                           WellnessRecordRepository wellnessRecordRepository,
                           AuditLogRepository auditLogRepository,
                           LeaveRequestRepository leaveRequestRepository,
                           OnCallScheduleRepository onCallScheduleRepository,
                           ComplianceRecordRepository complianceRecordRepository,
                           WellnessInterventionRepository wellnessInterventionRepository,
                           TrainingProgramRepository trainingProgramRepository,
                           SettingsService settingsService,
                           StaffRoleRepository staffRoleRepository,
                           UserRepository userRepository,
                           PasswordEncoder passwordEncoder,
                           WellnessService wellnessService) {
        this.departmentRepository = departmentRepository;
        this.workloadRecordRepository = workloadRecordRepository;
        this.staffRepository = staffRepository;
        this.resourceRepository = resourceRepository;
        this.resourceTransferRepository = resourceTransferRepository;
        this.procurementRequestRepository = procurementRequestRepository;
        this.certificationRepository = certificationRepository;
        this.scheduleRepository = scheduleRepository;
        this.wellnessRecordRepository = wellnessRecordRepository;
        this.auditLogRepository = auditLogRepository;
        this.leaveRequestRepository = leaveRequestRepository;
        this.onCallScheduleRepository = onCallScheduleRepository;
        this.complianceRecordRepository = complianceRecordRepository;
        this.wellnessInterventionRepository = wellnessInterventionRepository;
        this.trainingProgramRepository = trainingProgramRepository;
        this.settingsService = settingsService;
        this.staffRoleRepository = staffRoleRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.wellnessService = wellnessService;
    }

    @Override
    public void run(String... args) {
        settingsService.seedDefaultsIfEmpty();
        settingsService.ensurePermissionRolesSynced();
        seedAdminUserIfMissing();
        if (staffRoleRepository.count() == 0) {
            seedStaffRoles();
        }
        if (departmentRepository.count() == 0) {
            seedDepartments();
        }
        if (workloadRecordRepository.count() < 2000) {
            if (workloadRecordRepository.count() > 0) {
                workloadRecordRepository.deleteAll();
            }
            seedWorkloadRecords();
        }
        if (staffRepository.count() == 0) {
            seedStaffAndRelated();
        }
        if (resourceRepository.count() == 0) {
            seedResources();
        }
        if (resourceTransferRepository.count() == 0 && resourceRepository.count() > 0) {
            seedResourceTransfers();
        }
        if (procurementRequestRepository.count() == 0 && resourceRepository.count() > 0) {
            seedProcurementRequests();
        }
        if (auditLogRepository.count() == 0) {
            seedAuditLogs();
        }
        if (complianceRecordRepository.count() == 0) {
            seedCompliance();
        }
        if (wellnessInterventionRepository.count() == 0) {
            seedWellnessInterventions();
        }
        wellnessService.ensureStaffUserAccounts();
        if (trainingProgramRepository.count() == 0) {
            seedTrainingPrograms();
        }
    }

    private void seedStaffRoles() {
        String[][] roles = {
            {"Physician", "PHYS", "clinical", "Licensed physicians providing patient care"},
            {"Registered Nurse", "RN", "clinical", "Registered nursing staff"},
            {"Nurse Practitioner", "NP", "clinical", "Advanced practice nursing staff"},
            {"Licensed Practical Nurse", "LPN", "clinical", "Licensed practical nursing staff"},
            {"Respiratory Therapist", "RT", "support", "Respiratory therapy specialists"},
            {"Administrator", "ADMIN", "administrative", "Hospital administration staff"},
        };
        for (String[] role : roles) {
            StaffRole staffRole = new StaffRole();
            staffRole.setId(UUID.randomUUID().toString());
            staffRole.setName(role[0]);
            staffRole.setCode(role[1]);
            staffRole.setCategory(role[2]);
            staffRole.setDescription(role[3]);
            staffRole.setActive(true);
            staffRoleRepository.save(staffRole);
        }
    }

    private void seedDepartments() {
        for (int i = 0; i < DEPARTMENTS.length; i++) {
            Department department = new Department();
            department.setId(UUID.randomUUID().toString());
            department.setName(DEPARTMENTS[i]);
            department.setCode(DEPARTMENTS[i].replaceAll("[^A-Za-z0-9]", "").toUpperCase());
            department.setDescription("Hospital " + DEPARTMENTS[i] + " department");
            department.setActive(true);
            department.setStaffCount(STAFF_COUNTS[i]);
            department.setWorkload(WORKLOADS[i]);
            departmentRepository.save(department);
        }
    }

    private void seedWorkloadRecords() {
        List<Department> departments = departmentRepository.findAll();
        LocalDate end = LocalDate.now();

        for (int monthsAgo = 23; monthsAgo >= 0; monthsAgo--) {
            LocalDate monthAnchor = end.minusMonths(monthsAgo).withDayOfMonth(15);
            int seasonal = (int) Math.round(6 * Math.sin(2 * Math.PI * monthAnchor.getMonthValue() / 12.0));
            for (Department department : departments) {
                double base = 74 + seasonal + (department.getWorkload() - 80) * 0.25;
                double workload = Math.min(100, Math.max(48, base + ((monthsAgo + department.getName().length()) % 5) - 2));
                WorkloadRecord record = new WorkloadRecord();
                record.setId(UUID.randomUUID().toString());
                record.setDepartmentId(department.getId());
                record.setDate(monthAnchor.atTime(12, 0));
                record.setHour(HOURS[monthsAgo % HOURS.length]);
                record.setWorkload(workload);
                record.setPatientVolume((int) Math.round(workload * 2.5));
                workloadRecordRepository.save(record);
            }
        }

        for (int daysAgo = 364; daysAgo >= 0; daysAgo--) {
            LocalDate day = end.minusDays(daysAgo);
            int dow = day.getDayOfWeek().getValue();
            double weekendAdjust = dow >= 6 ? -4 : 2;
            for (Department department : departments) {
                double seasonal = 3 * Math.sin(2 * Math.PI * day.getDayOfYear() / 365.0);
                double base = department.getWorkload() + weekendAdjust + seasonal;
                double workload = Math.min(100, Math.max(45, base + ((daysAgo + department.getName().hashCode()) % 7) - 3));
                WorkloadRecord daily = new WorkloadRecord();
                daily.setId(UUID.randomUUID().toString());
                daily.setDepartmentId(department.getId());
                daily.setDate(day.atStartOfDay());
                daily.setHour(12);
                daily.setWorkload(workload);
                daily.setPatientVolume((int) Math.round(workload * 2.5));
                workloadRecordRepository.save(daily);
            }
        }
    }

    private void seedStaffAndRelated() {
        List<Department> departments = departmentRepository.findAll();
        if (departments.isEmpty()) return;

        Department emergency = departments.stream().filter(d -> "Emergency".equals(d.getName())).findFirst().orElse(departments.get(0));
        Department icu = departments.stream().filter(d -> "ICU".equals(d.getName())).findFirst().orElse(departments.get(0));
        Department surgery = departments.stream().filter(d -> "Surgery".equals(d.getName())).findFirst().orElse(departments.get(0));
        Department pediatrics = departments.stream().filter(d -> "Pediatrics".equals(d.getName())).findFirst().orElse(departments.get(0));
        Department general = departments.stream().filter(d -> "General Medicine".equals(d.getName())).findFirst().orElse(departments.get(0));

        String[][] staffData = {
            {"Dr. Sarah Chen", "Physician", emergency.getId()},
            {"Nurse Mike Johnson", "RN", icu.getId()},
            {"Dr. Emma Wilson", "Physician", surgery.getId()},
            {"Nurse Lisa Park", "RN", pediatrics.getId()},
            {"Dr. James Lee", "Physician", general.getId()},
            {"Nurse Alex Rivera", "RN", emergency.getId()},
            {"Dr. Priya Sharma", "Physician", icu.getId()},
            {"Nurse Jordan Kim", "RN", surgery.getId()},
        };
        double[] overtime = {12, 8, 4, 6, 5, 10, 7, 3};
        String[] risk = {"high", "medium", "low", "low", "low", "high", "medium", "low"};
        List<String> certCatalog = settingsService.configuredCertCatalog();
        int[] certExpiryDays = {30, 22, 28, 15, 45, 20, 18, 35};

        LocalDateTime today = LocalDate.now().atStartOfDay();
        String[] shifts = {"Day", "Evening", "Night", "Day", "Day"};

        for (int i = 0; i < staffData.length; i++) {
            Staff staff = new Staff();
            String id = UUID.randomUUID().toString();
            staff.setId(id);
            staff.setName(staffData[i][0]);
            staff.setEmail(normalizeStaffEmail(staffData[i][0]));
            staff.setRole(staffData[i][1]);
            staff.setDepartmentId(staffData[i][2]);
            staffRepository.save(staff);

            WellnessRecord wellness = new WellnessRecord();
            wellness.setId(UUID.randomUUID().toString());
            wellness.setStaffId(id);
            wellness.setDate(LocalDateTime.now());
            wellness.setOvertime(overtime[i]);
            wellness.setRiskLevel(risk[i]);
            wellness.setScore(risk[i].equals("high") ? 65.0 : risk[i].equals("medium") ? 72.0 : 85.0);
            wellnessRecordRepository.save(wellness);

            if (!certCatalog.isEmpty()) {
                Certification cert = new Certification();
                cert.setId(UUID.randomUUID().toString());
                cert.setStaffId(id);
                cert.setName(certCatalog.get(i % certCatalog.size()));
                cert.setExpiryDate(LocalDateTime.now().plusDays(certExpiryDays[i % certExpiryDays.length]));
                cert.setStatus("active");
                certificationRepository.save(cert);
            }

            seedWeeklySchedules(id, staffData[i][2], overtime[i], shifts);
        }

        List<Staff> allStaff = staffRepository.findAll();
        if (!allStaff.isEmpty()) {
            Staff first = allStaff.get(0);
            LeaveRequest leave = new LeaveRequest();
            leave.setId(UUID.randomUUID().toString());
            leave.setStaffId(first.getId());
            leave.setStartDate(today.plusDays(7));
            leave.setEndDate(today.plusDays(9));
            leave.setType("Annual");
            leave.setStatus("pending");
            leave.setCreatedAt(LocalDateTime.now());
            leaveRequestRepository.save(leave);

            OnCallSchedule onCall = new OnCallSchedule();
            onCall.setId(UUID.randomUUID().toString());
            onCall.setStaffId(allStaff.get(1).getId());
            onCall.setDate(today);
            onCall.setStartTime("18:00");
            onCall.setEndTime("08:00");
            onCallScheduleRepository.save(onCall);
        }
    }

    private String normalizeStaffEmail(String displayName) {
        String local = displayName.toLowerCase()
            .replaceAll("[^a-z0-9]+", ".")
            .replaceAll("^\\.+|\\.+$", "");
        return local + "@hospital.org";
    }

    /** Seeds enough shifts in the past 7 days to reflect target weekly overtime. */
    private void seedWeeklySchedules(String staffId, String departmentId, double targetOvertime, String[] shiftTypes) {
        double targetHours = 40 + targetOvertime;
        int shiftsNeeded = (int) Math.ceil(targetHours / 8.0);
        LocalDate today = LocalDate.now();
        for (int d = 0; d < shiftsNeeded && d < 7; d++) {
            Schedule schedule = new Schedule();
            schedule.setId(UUID.randomUUID().toString());
            schedule.setStaffId(staffId);
            schedule.setDepartmentId(departmentId);
            schedule.setDate(today.minusDays(d).atStartOfDay());
            schedule.setShift(shiftTypes[d % shiftTypes.length]);
            schedule.setStatus("scheduled");
            schedule.setSwapRequested(false);
            scheduleRepository.save(schedule);
        }
    }

    private void seedResources() {
        List<Department> departments = departmentRepository.findAll();
        String icuId = departments.stream().filter(d -> "ICU".equals(d.getName())).map(Department::getId).findFirst().orElse(null);
        String emergencyId = departments.stream().filter(d -> "Emergency".equals(d.getName())).map(Department::getId).findFirst().orElse(null);
        String radiologyId = departments.stream().filter(d -> "Radiology".equals(d.getName())).map(Department::getId).findFirst().orElse(null);
        String surgeryId = departments.stream().filter(d -> "Surgery".equals(d.getName())).map(Department::getId).findFirst().orElse(null);

        Object[][] resources = {
            {"Ventilators", "Equipment", 24, 22, icuId, "VENT-ICU", "ICU Bay A", "MedSupply Co", 4, 18500},
            {"ICU Beds", "Facility", 45, 42, icuId, "BED-ICU", "ICU Ward", "Hospital Ops", 6, 4200},
            {"Operating Rooms", "Facility", 12, 10, surgeryId, "OR-SURG", "Surgery Wing", "Hospital Ops", 2, 120000},
            {"Portable X-Ray", "Equipment", 6, 4, radiologyId, "XR-PORT", "Radiology Storage", "Imaging Direct", 2, 28000},
            {"Emergency Beds", "Facility", 30, 26, emergencyId, "BED-ER", "Emergency Ward", "Hospital Ops", 5, 3800},
        };
        for (Object[] r : resources) {
            Resource resource = new Resource();
            resource.setId(UUID.randomUUID().toString());
            resource.setName((String) r[0]);
            resource.setType((String) r[1]);
            resource.setAvailable((Integer) r[2]);
            resource.setInUse((Integer) r[3]);
            resource.setDepartmentId((String) r[4]);
            resource.setSku((String) r[5]);
            resource.setLocation((String) r[6]);
            resource.setSupplier((String) r[7]);
            resource.setReorderLevel((Integer) r[8]);
            resource.setUnitCost((Integer) r[9]);
            resource.setMaintenanceStatus("operational");
            resourceRepository.save(resource);
        }
    }

    private void seedResourceTransfers() {
        List<Resource> resources = resourceRepository.findAll();
        List<Department> departments = departmentRepository.findAll();
        if (resources.isEmpty() || departments.size() < 2) return;

        Resource ventilator = resources.stream()
            .filter(r -> "Ventilators".equals(r.getName())).findFirst().orElse(resources.get(0));
        String toDept = departments.stream()
            .filter(d -> ventilator.getDepartmentId() != null && !ventilator.getDepartmentId().equals(d.getId()))
            .map(Department::getId).findFirst().orElse(departments.get(1).getId());

        ResourceTransfer transfer = new ResourceTransfer();
        transfer.setId(UUID.randomUUID().toString());
        transfer.setResourceId(ventilator.getId());
        transfer.setFromDepartmentId(ventilator.getDepartmentId());
        transfer.setToDepartmentId(toDept);
        transfer.setQuantity(2);
        transfer.setStatus("pending");
        transfer.setNotes("Emergency surge support");
        transfer.setCreatedAt(LocalDateTime.now().minusDays(1));
        resourceTransferRepository.save(transfer);
    }

    private void seedProcurementRequests() {
        List<Resource> resources = resourceRepository.findAll();
        Resource ventilator = resources.stream()
            .filter(r -> "Ventilators".equals(r.getName())).findFirst().orElse(resources.get(0));

        ProcurementRequest request = new ProcurementRequest();
        request.setId(UUID.randomUUID().toString());
        request.setResourceId(ventilator.getId());
        request.setResourceName(ventilator.getName());
        request.setQuantity(4);
        request.setEstimatedUnitCost(ventilator.getUnitCost() > 0 ? ventilator.getUnitCost() : 18500);
        request.setSupplier(ventilator.getSupplier());
        request.setPriority("high");
        request.setStatus("pending");
        request.setNotes("Replenish critical ventilator stock");
        request.setCreatedAt(LocalDateTime.now().minusHours(6));
        request.setUpdatedAt(LocalDateTime.now().minusHours(6));
        procurementRequestRepository.save(request);
    }

    private void seedAuditLogs() {
        String[][] logs = {
            {"login", "auth", "User session", "Successful login"},
            {"update", "schedule", "Schedule swap", "Swap requested for Day shift"},
            {"create", "staff", "Staff record", "New staff member added"},
            {"export", "report", "Workload report", "Exported workload analysis"},
            {"train", "prediction", "ML model", "Ridge regression model trained"},
        };
        for (String[] log : logs) {
            AuditLog entry = new AuditLog();
            entry.setId(UUID.randomUUID().toString());
            entry.setAction(log[0]);
            entry.setType(log[1]);
            entry.setResource(log[2]);
            entry.setDetails(log[3]);
            entry.setIpAddress("127.0.0.1");
            entry.setCreatedAt(LocalDateTime.now().minusHours((long) (Math.random() * 48)));
            auditLogRepository.save(entry);
        }
    }

    private void seedCompliance() {
        ComplianceRecord scan = new ComplianceRecord();
        scan.setId(UUID.randomUUID().toString());
        scan.setRecordType("scan");
        scan.setRequirement("Initial compliance baseline");
        scan.setStatus("compliant");
        scan.setValue("Seeded baseline — run a live scan for current metrics");
        scan.setRecordedAt(LocalDateTime.now().minusDays(7));
        complianceRecordRepository.save(scan);
    }

    private void seedWellnessInterventions() {
        String[][] interventions = {
            {"Reduce overtime", "active"},
            {"Wellness check-in", "active"},
            {"Peer support", "planned"},
        };
        for (String[] i : interventions) {
            WellnessIntervention intervention = new WellnessIntervention();
            intervention.setId(UUID.randomUUID().toString());
            intervention.setType(i[0]);
            intervention.setStatus(i[1]);
            intervention.setRecommendedAt(LocalDateTime.now());
            wellnessInterventionRepository.save(intervention);
        }
    }

    private void seedAdminUserIfMissing() {
        final String adminEmail = "admin@hospital.org";
        userRepository.findByEmail(adminEmail).ifPresentOrElse(existing -> {
            boolean changed = false;
            if (!"Admin".equalsIgnoreCase(existing.getRole())) {
                existing.setRole("Admin");
                changed = true;
            }
            if (!existing.isActive()) {
                existing.setActive(true);
                changed = true;
            }
            if (existing.getOrganization() == null || existing.getOrganization().isBlank()) {
                existing.setOrganization(settingsService.getOrganizationName());
                changed = true;
            }
            if (changed) {
                userRepository.save(existing);
            }
        }, () -> {
            User admin = new User();
            admin.setId(UUID.randomUUID().toString());
            admin.setEmail(adminEmail);
            admin.setPassword(passwordEncoder.encode("admin123"));
            admin.setName("Admin User");
            admin.setRole("Admin");
            admin.setOrganization(settingsService.getOrganizationName());
            admin.setActive(true);
            userRepository.save(admin);
        });
    }

    private void seedTrainingPrograms() {
        Object raw = settingsService.getSection("skills").get("trainingPrograms");
        if (!(raw instanceof List<?> list) || list.isEmpty()) return;
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> map)) continue;
            String name = String.valueOf(map.get("name"));
            if (name.isBlank() || "null".equalsIgnoreCase(name)) continue;
            TrainingProgram program = new TrainingProgram();
            program.setId(UUID.randomUUID().toString());
            program.setName(name.trim());
            Object description = map.get("description");
            program.setDescription(description != null ? String.valueOf(description) : null);
            program.setActive(true);
            program.setCreatedAt(LocalDateTime.now());
            trainingProgramRepository.save(program);
        }
    }
}
