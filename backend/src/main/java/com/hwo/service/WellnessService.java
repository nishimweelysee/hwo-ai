package com.hwo.service;

import com.hwo.entity.Department;
import com.hwo.entity.Schedule;
import com.hwo.entity.Staff;
import com.hwo.entity.User;
import com.hwo.entity.UserProfile;
import com.hwo.entity.WellnessRecord;
import com.hwo.repository.DepartmentRepository;
import com.hwo.repository.ScheduleRepository;
import com.hwo.repository.StaffRepository;
import com.hwo.repository.UserProfileRepository;
import com.hwo.repository.UserRepository;
import com.hwo.repository.WellnessRecordRepository;
import com.hwo.entity.WellnessFeedback;
import com.hwo.entity.WellnessIntervention;
import com.hwo.entity.WellnessSurveyResponse;
import com.hwo.repository.WellnessFeedbackRepository;
import com.hwo.repository.WellnessInterventionRepository;
import com.hwo.repository.WellnessSurveyResponseRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class WellnessService {

    private static final int STANDARD_WEEK_HOURS = 40;
    private static final long WELLNESS_REFRESH_COOLDOWN_MS = 5 * 60 * 1000L;
    private static final long ENSURE_STAFF_USERS_COOLDOWN_MS = 60 * 1000L;
    private static final int DASHBOARD_ALERT_LIMIT = 25;

    private volatile long lastScheduleRefreshAtMs = 0L;
    private volatile long lastEnsureStaffUsersAtMs = 0L;

    private final UserRepository userRepository;
    private final UserProfileRepository userProfileRepository;
    private final StaffRepository staffRepository;
    private final DepartmentRepository departmentRepository;
    private final ScheduleRepository scheduleRepository;
    private final WellnessRecordRepository wellnessRecordRepository;
    private final WellnessFeedbackRepository wellnessFeedbackRepository;
    private final WellnessInterventionRepository wellnessInterventionRepository;
    private final WellnessSurveyResponseRepository wellnessSurveyResponseRepository;
    private final SettingsService settingsService;
    private final PasswordEncoder passwordEncoder;
    private final WellnessAiService wellnessAiService;
    private final PushNotificationService pushNotificationService;

    public WellnessService(UserRepository userRepository,
                           UserProfileRepository userProfileRepository,
                           StaffRepository staffRepository,
                           DepartmentRepository departmentRepository,
                           ScheduleRepository scheduleRepository,
                           WellnessRecordRepository wellnessRecordRepository,
                           WellnessFeedbackRepository wellnessFeedbackRepository,
                           WellnessInterventionRepository wellnessInterventionRepository,
                           WellnessSurveyResponseRepository wellnessSurveyResponseRepository,
                           SettingsService settingsService,
                           PasswordEncoder passwordEncoder,
                           WellnessAiService wellnessAiService,
                           PushNotificationService pushNotificationService) {
        this.userRepository = userRepository;
        this.userProfileRepository = userProfileRepository;
        this.staffRepository = staffRepository;
        this.departmentRepository = departmentRepository;
        this.scheduleRepository = scheduleRepository;
        this.wellnessRecordRepository = wellnessRecordRepository;
        this.wellnessFeedbackRepository = wellnessFeedbackRepository;
        this.wellnessInterventionRepository = wellnessInterventionRepository;
        this.wellnessSurveyResponseRepository = wellnessSurveyResponseRepository;
        this.settingsService = settingsService;
        this.passwordEncoder = passwordEncoder;
        this.wellnessAiService = wellnessAiService;
        this.pushNotificationService = pushNotificationService;
    }

    /** Links a single staff member to an active login in `users`. Generates email if missing. */
    @Transactional
    public void linkStaffUser(Staff staff) {
        if (staff == null) return;
        ensureStaffHasEmail(staff);
        String email = normalizeEmail(staff.getEmail());
        if (!email.equals(staff.getEmail())) {
            staff.setEmail(email);
            staffRepository.save(staff);
        }
        Optional<User> byStaff = userRepository.findByStaffId(staff.getId());
        if (byStaff.isPresent()) {
            User user = byStaff.get();
            boolean dirty = false;
            if (!email.equals(user.getEmail()) && userRepository.findByEmail(email).isEmpty()) {
                user.setEmail(email);
                dirty = true;
            }
            if (!user.isActive()) {
                user.setActive(true);
                dirty = true;
            }
            if (user.getName() == null || user.getName().isBlank()) {
                user.setName(staff.getName());
                dirty = true;
            }
            if (dirty) userRepository.save(user);
            ensureProfileDepartment(user.getId(), staff.getDepartmentId());
            return;
        }
        Optional<User> existing = userRepository.findByEmail(email);
        if (existing.isPresent()) {
            User user = existing.get();
            user.setStaffId(staff.getId());
            if (user.getName() == null || user.getName().isBlank()) user.setName(staff.getName());
            user.setActive(true);
            userRepository.save(user);
            ensureProfileDepartment(user.getId(), staff.getDepartmentId());
            return;
        }
        User user = new User();
        user.setId(UUID.randomUUID().toString());
        user.setEmail(email);
        user.setName(staff.getName());
        user.setPassword(passwordEncoder.encode("staff123"));
        user.setRole(settingsService.staffProvisionRole());
        user.setOrganization(settingsService.getOrganizationName());
        user.setActive(true);
        user.setStaffId(staff.getId());
        userRepository.save(user);
        ensureProfileDepartment(user.getId(), staff.getDepartmentId());
    }

    @Transactional
    public Map<String, Object> submitFeedback(String userId, Map<String, ?> body) {
        String message = resolveFeedbackMessage(body);
        Integer rating = body.get("rating") instanceof Number number ? number.intValue() : null;
        Map<String, Object> analysis = wellnessAiService.analyzeFeedback(message, rating);

        WellnessFeedback feedback = new WellnessFeedback();
        feedback.setId(UUID.randomUUID().toString());
        feedback.setUserId(userId);
        feedback.setMessage(message);
        if (rating != null) feedback.setRating(rating);
        feedback.setAnonymous(Boolean.TRUE.equals(body.get("anonymous")));
        feedback.setCreatedAt(LocalDateTime.now());
        feedback.setSentiment(String.valueOf(analysis.getOrDefault("sentiment", "neutral")));
        feedback.setUrgency(String.valueOf(analysis.getOrDefault("urgency", "low")));
        feedback.setThemes(String.join(",", themesList(analysis.get("themes"))));
        wellnessFeedbackRepository.save(feedback);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("id", feedback.getId());
        result.put("sentiment", feedback.getSentiment());
        result.put("urgency", feedback.getUrgency());
        result.put("themes", themesList(analysis.get("themes")));
        result.put("aiPowered", analysis.get("aiPowered"));
        return result;
    }

    @Transactional
    public Map<String, Object> submitCheckin(String userId, Map<String, ?> body) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("User not found"));
        if (user.getStaffId() == null || user.getStaffId().isBlank()) {
            throw new IllegalArgumentException("Your account is not linked to a workforce profile");
        }
        double score = body.get("score") instanceof Number number ? number.doubleValue() : 75;
        double overtime = parseOvertimeAnswer(body.get("overtime"));
        int overtimeWarning = settingsService.getInt("workload", "overtimeWarningHours", 10);
        String risk = classifyRisk(overtime, overtimeWarning);
        if (score <= 50) risk = "high";
        else if (score <= 65 && !"high".equals(risk)) risk = "medium";
        risk = applyAiRiskIfAvailable(user.getStaffId(), overtime, score, risk);
        insertWellnessRecord(user.getStaffId(), overtime, risk, score);
        if ("high".equals(risk) || "medium".equals(risk)) {
            pushNotificationService.notifyUser(
                userId,
                "Wellness alert",
                "Your check-in was flagged as " + risk + " risk. Tap to review.",
                Map.of("type", "wellness", "risk", risk, "staffId", user.getStaffId())
            );
        }
        return Map.of("success", true, "score", Math.round(score), "risk", risk, "riskLevel", risk);
    }

    /** Links every workforce staff row to an active login in `users` (by email). */
    @Transactional
    public int ensureStaffUserAccounts() {
        int linked = 0;
        for (Staff staff : staffRepository.findAll()) {
            boolean hadUser = userRepository.findByStaffId(staff.getId()).isPresent();
            linkStaffUser(staff);
            if (!hadUser && userRepository.findByStaffId(staff.getId()).isPresent()) {
                linked++;
            }
        }
        lastEnsureStaffUsersAtMs = System.currentTimeMillis();
        return linked;
    }

    /** Avoid re-linking every staff row on each dashboard/wellness page load. */
    public void ensureStaffUserAccountsIfStale() {
        long now = System.currentTimeMillis();
        if (now - lastEnsureStaffUsersAtMs < ENSURE_STAFF_USERS_COOLDOWN_MS) {
            return;
        }
        synchronized (this) {
            if (now - lastEnsureStaffUsersAtMs < ENSURE_STAFF_USERS_COOLDOWN_MS) {
                return;
            }
            ensureStaffUserAccounts();
        }
    }

    /** Recompute overtime from schedule data when shifts exist; otherwise keep stored wellness rows. */
    @Transactional
    public void refreshWellnessFromSchedules() {
        refreshWellnessFromSchedulesBatched();
        lastScheduleRefreshAtMs = System.currentTimeMillis();
    }

    /** Avoid recomputing wellness from every schedule row on each dashboard/wellness page load. */
    public void refreshWellnessFromSchedulesIfStale() {
        long now = System.currentTimeMillis();
        if (now - lastScheduleRefreshAtMs < WELLNESS_REFRESH_COOLDOWN_MS) {
            return;
        }
        synchronized (this) {
            if (now - lastScheduleRefreshAtMs < WELLNESS_REFRESH_COOLDOWN_MS) {
                return;
            }
            refreshWellnessFromSchedules();
        }
    }

    private void refreshWellnessFromSchedulesBatched() {
        LocalDateTime weekStart = LocalDate.now().minusDays(6).atStartOfDay();
        LocalDateTime weekEnd = LocalDate.now().plusDays(1).atStartOfDay();
        int overtimeWarning = settingsService.getInt("workload", "overtimeWarningHours", 10);

        List<Schedule> weekSchedules = scheduleRepository.findByDateBetween(weekStart, weekEnd);
        Map<String, List<Schedule>> schedulesByStaff = weekSchedules.stream()
            .filter(s -> s.getStaffId() != null && !s.getStaffId().isBlank())
            .collect(Collectors.groupingBy(Schedule::getStaffId));

        Map<String, WellnessRecord> existingByStaff = wellnessRecordRepository.findLatestPerStaff().stream()
            .collect(Collectors.toMap(WellnessRecord::getStaffId, r -> r, (a, b) -> a));

        List<WellnessRecord> toSave = new ArrayList<>();
        for (Map.Entry<String, List<Schedule>> entry : schedulesByStaff.entrySet()) {
            List<Schedule> schedules = entry.getValue();
            if (schedules.size() < 4) continue;

            double weeklyHours = schedules.stream()
                .mapToDouble(s -> shiftHours(s.getShift()))
                .sum();
            if (weeklyHours <= 0) continue;

            double overtime = Math.max(0, weeklyHours - STANDARD_WEEK_HOURS);
            String risk = classifyRisk(overtime, overtimeWarning);
            double score = scoreFromRisk(risk);

            WellnessRecord record = existingByStaff.get(entry.getKey());
            if (record == null) {
                record = new WellnessRecord();
                record.setId(UUID.randomUUID().toString());
                record.setStaffId(entry.getKey());
            }
            record.setDate(LocalDateTime.now());
            record.setOvertime(overtime);
            record.setRiskLevel(risk);
            record.setScore(score);
            toSave.add(record);
        }
        if (!toSave.isEmpty()) {
            wellnessRecordRepository.saveAll(toSave);
        }
    }

    /** Lightweight wellness payload for dashboard — no per-alert AI enrichment. */
    public Map<String, Object> getDashboardWellness() {
        ensureStaffUserAccountsIfStale();
        return buildWellnessSummary(false, false, DASHBOARD_ALERT_LIMIT);
    }

    public Map<String, Object> getWellnessSummary() {
        ensureStaffUserAccountsIfStale();
        refreshWellnessFromSchedulesIfStale();
        // Skip per-alert AI enrichment on the list endpoint — each alert used to trigger
        // multiple AI/schedule round-trips. Use GET /api/wellness/ai/risk/{staffId} on demand.
        return buildWellnessSummary(true, false, Integer.MAX_VALUE);
    }

    private Map<String, Object> buildWellnessSummary(boolean includeStats, boolean enrichWithAi, int alertLimit) {
        int overtimeWarning = settingsService.getInt("workload", "overtimeWarningHours", 10);
        List<WellnessRecord> latestRecords = wellnessRecordRepository.findLatestPerStaff();

        if (latestRecords.isEmpty()) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("alertsEnabled", settingsService.getBoolean("notifications", "wellnessAlerts", true));
            empty.put("aiServiceHealthy", wellnessAiService.isActive());
            empty.put("aiWellnessActive", wellnessAiService.isActive());
            empty.put("alerts", List.of());
            empty.put("avgOvertime", 0);
            empty.put("atRiskCount", 0);
            if (includeStats) {
                empty.putAll(getWellnessStats());
            }
            return empty;
        }

        Set<String> staffIds = latestRecords.stream()
            .map(WellnessRecord::getStaffId)
            .filter(id -> id != null && !id.isBlank())
            .collect(Collectors.toSet());
        Map<String, Staff> staffById = staffRepository.findAllById(staffIds).stream()
            .collect(Collectors.toMap(Staff::getId, s -> s, (a, b) -> a));
        Map<String, User> userByStaffId = staffIds.isEmpty()
            ? Map.of()
            : userRepository.findByStaffIdIn(staffIds).stream()
                .filter(u -> u.getStaffId() != null)
                .collect(Collectors.toMap(User::getStaffId, u -> u, (a, b) -> a));
        Map<String, String> departmentNames = departmentRepository.findAll().stream()
            .collect(Collectors.toMap(Department::getId, Department::getName, (a, b) -> a));

        List<Map<String, Object>> alerts = new ArrayList<>();
        double totalOvertime = 0;
        int count = 0;

        for (WellnessRecord record : latestRecords) {
            Staff staff = staffById.get(record.getStaffId());
            if (staff == null) continue;

            totalOvertime += record.getOvertime();
            count++;

            if (!isAtRisk(record, overtimeWarning)) continue;

            User user = userByStaffId.get(staff.getId());
            if (user == null || !user.isActive()) {
                linkStaffUser(staff);
                user = userRepository.findByStaffId(staff.getId()).orElse(null);
                if (user != null) userByStaffId.put(staff.getId(), user);
            }

            Map<String, Object> alert = buildAlert(user, staff, record, departmentNames);
            if (enrichWithAi && wellnessAiService.isActive()) {
                alert.putAll(wellnessAiService.enrichAlert(staff, record));
            }
            alerts.add(alert);
        }

        alerts.sort(Comparator
            .comparing((Map<String, Object> a) -> "high".equals(a.get("risk")) ? 0 : 1)
            .thenComparing(a -> -((Number) a.getOrDefault("overtime", 0)).intValue()));

        int atRiskCount = alerts.size();
        if (alertLimit < alerts.size()) {
            alerts = new ArrayList<>(alerts.subList(0, alertLimit));
        }

        Map<String, Object> result = new LinkedHashMap<>();
        boolean alertsEnabled = settingsService.getBoolean("notifications", "wellnessAlerts", true);
        result.put("alertsEnabled", alertsEnabled);
        result.put("aiServiceHealthy", wellnessAiService.isActive());
        result.put("aiWellnessActive", wellnessAiService.isActive());
        result.put("alerts", alertsEnabled ? alerts : List.of());
        result.put("avgOvertime", count > 0 ? Math.round((totalOvertime / count) * 10) / 10.0 : 0);
        result.put("atRiskCount", alertsEnabled ? atRiskCount : 0);
        if (includeStats) {
            result.putAll(getWellnessStats());
        }
        return result;
    }

    /** Rolling 7-day shifts for wellness alert review (same window as overtime calculation). */
    public Map<String, Object> getStaffRollingWeekShifts(String staffId) {
        Staff staff = staffRepository.findById(staffId)
            .orElseThrow(() -> new IllegalArgumentException("Staff member not found"));

        LocalDate weekEndDate = LocalDate.now();
        LocalDate weekStartDate = weekEndDate.minusDays(6);
        LocalDateTime weekStart = weekStartDate.atStartOfDay();
        LocalDateTime weekEnd = weekEndDate.plusDays(1).atStartOfDay();

        List<Schedule> schedules = scheduleRepository.findByStaffIdAndDateBetween(staffId, weekStart, weekEnd).stream()
            .sorted(Comparator
                .comparing(Schedule::getDate, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(s -> s.getShift() != null ? s.getShift() : ""))
            .collect(Collectors.toList());

        double totalHours = schedules.stream()
            .mapToDouble(s -> shiftHours(s.getShift()))
            .sum();
        double overtime = Math.max(0, totalHours - STANDARD_WEEK_HOURS);

        List<Map<String, Object>> shiftRows = new ArrayList<>();
        for (Schedule schedule : schedules) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", schedule.getId());
            row.put("date", schedule.getDate() != null ? schedule.getDate().toLocalDate().toString() : null);
            row.put("shift", schedule.getShift());
            row.put("dept", scheduleDepartmentName(schedule));
            row.put("departmentId", schedule.getDepartmentId());
            row.put("status", schedule.getStatus() != null ? schedule.getStatus() : "scheduled");
            row.put("hours", shiftHours(schedule.getShift()));
            row.put("swapRequested", schedule.isSwapRequested());
            shiftRows.add(row);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("staffId", staffId);
        result.put("staffName", staff.getName());
        result.put("weekStart", weekStartDate.toString());
        result.put("weekEnd", weekEndDate.toString());
        result.put("totalHours", Math.round(totalHours * 10) / 10.0);
        result.put("standardHours", STANDARD_WEEK_HOURS);
        result.put("overtimeHours", Math.round(overtime * 10) / 10.0);
        result.put("shiftCount", schedules.size());
        result.put("shifts", shiftRows);
        return result;
    }

    private String scheduleDepartmentName(Schedule schedule) {
        if (schedule.getDepartment() != null && schedule.getDepartment().getName() != null) {
            return schedule.getDepartment().getName();
        }
        if (schedule.getDepartmentId() != null) {
            return departmentRepository.findById(schedule.getDepartmentId())
                .map(Department::getName)
                .orElse("");
        }
        return "";
    }

    public Map<String, Object> getWellnessMeta() {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("interventionTypes", interventionTypes());
        meta.put("surveyQuestions", surveyQuestions());
        meta.put("shiftHours", shiftHoursSettings());
        meta.put("overtimeWarningHours", settingsService.getInt("workload", "overtimeWarningHours", 10));
        return meta;
    }

    public List<Map<String, Object>> getSurveyQuestions() {
        return surveyQuestions();
    }

    public Map<String, Object> getWellnessStats() {
        long activeStaff = staffRepository.count();
        LocalDateTime since = LocalDate.now().minusDays(30).atStartOfDay();
        long surveySessions = wellnessSurveyResponseRepository.countDistinctSessionIdBySubmittedAtAfter(since);
        double responseRate = activeStaff > 0
            ? Math.min(100, Math.round((surveySessions * 100.0) / activeStaff))
            : 0;
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("surveyResponseRate", responseRate);
        stats.put("feedbackCount", wellnessFeedbackRepository.count());
        stats.put("interventionCount", wellnessInterventionRepository.count());
        stats.put("activeInterventions", wellnessInterventionRepository.countActiveInterventions());
        return stats;
    }

    public List<Map<String, Object>> listRecords(String staffId) {
        List<WellnessRecord> records = staffId != null && !staffId.isBlank()
            ? wellnessRecordRepository.findByStaffIdOrderByDateDesc(staffId)
            : wellnessRecordRepository.findAllByOrderByDateDesc();
        return records.stream().map(this::toRecordInfo).collect(java.util.stream.Collectors.toList());
    }

    public Map<String, Object> getRecord(String id) {
        WellnessRecord record = wellnessRecordRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Wellness record not found"));
        return toRecordInfo(record);
    }

    @Transactional
    public Map<String, Object> createRecord(Map<String, ?> body) {
        String staffId = String.valueOf(body.get("staffId"));
        Staff staff = staffRepository.findById(staffId)
            .orElseThrow(() -> new IllegalArgumentException("Staff not found"));
        linkStaffUser(staff);
        double overtime = parseOvertimeAnswer(body.get("overtime"));
        int overtimeWarning = settingsService.getInt("workload", "overtimeWarningHours", 10);
        String risk = body.get("riskLevel") != null
            ? String.valueOf(body.get("riskLevel"))
            : classifyRisk(overtime, overtimeWarning);
        double score = body.get("score") instanceof Number number
            ? number.doubleValue()
            : scoreFromRisk(risk);
        WellnessRecord record = insertWellnessRecord(staffId, overtime, risk, score);
        return toRecordInfo(record);
    }

    @Transactional
    public Map<String, Object> updateRecord(String id, Map<String, ?> body) {
        WellnessRecord record = wellnessRecordRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Wellness record not found"));
        if (body.get("overtime") != null) record.setOvertime(parseOvertimeAnswer(body.get("overtime")));
        if (body.get("riskLevel") != null) record.setRiskLevel(String.valueOf(body.get("riskLevel")));
        if (body.get("score") instanceof Number number) record.setScore(number.doubleValue());
        wellnessRecordRepository.save(record);
        return toRecordInfo(record);
    }

    @Transactional
    public void deleteRecord(String id) {
        if (!wellnessRecordRepository.existsById(id)) {
            throw new IllegalArgumentException("Wellness record not found");
        }
        wellnessRecordRepository.deleteById(id);
    }

    public List<Map<String, Object>> listInterventions(String staffId) {
        List<WellnessIntervention> interventions;
        if (staffId != null && !staffId.isBlank()) {
            interventions = wellnessInterventionRepository.findByStaffIdOrderByRecommendedAtDesc(staffId);
        } else {
            interventions = wellnessInterventionRepository.findAllByOrderByRecommendedAtDesc();
        }
        return interventions.stream().map(this::toInterventionInfo).collect(java.util.stream.Collectors.toList());
    }

    @Transactional
    public Map<String, Object> createIntervention(Map<String, ?> body) {
        WellnessIntervention intervention = new WellnessIntervention();
        intervention.setId(UUID.randomUUID().toString());
        if (body.get("staffId") != null) {
            String staffId = String.valueOf(body.get("staffId"));
            if (!staffId.isBlank()) {
                staffRepository.findById(staffId).orElseThrow(() -> new IllegalArgumentException("Staff not found"));
                intervention.setStaffId(staffId);
            }
        }
        intervention.setType(body.get("type") != null ? String.valueOf(body.get("type")) : "Wellness check-in");
        intervention.setStatus(body.get("status") != null ? String.valueOf(body.get("status")) : "active");
        intervention.setRecommendedAt(LocalDateTime.now());
        wellnessInterventionRepository.save(intervention);
        return toInterventionInfo(intervention);
    }

    @Transactional
    public Map<String, Object> updateIntervention(String id, Map<String, ?> body) {
        WellnessIntervention intervention = wellnessInterventionRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Intervention not found"));
        if (body.get("type") != null) intervention.setType(String.valueOf(body.get("type")));
        if (body.get("status") != null) intervention.setStatus(String.valueOf(body.get("status")));
        if (body.get("staffId") != null) {
            String staffId = String.valueOf(body.get("staffId"));
            intervention.setStaffId(staffId.isBlank() ? null : staffId);
        }
        wellnessInterventionRepository.save(intervention);
        return toInterventionInfo(intervention);
    }

    @Transactional
    public Map<String, Object> completeIntervention(String id) {
        WellnessIntervention intervention = wellnessInterventionRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Intervention not found"));
        intervention.setStatus("completed");
        intervention.setCompletedAt(LocalDateTime.now());
        wellnessInterventionRepository.save(intervention);
        return toInterventionInfo(intervention);
    }

    @Transactional
    public void deleteIntervention(String id) {
        if (!wellnessInterventionRepository.existsById(id)) {
            throw new IllegalArgumentException("Intervention not found");
        }
        wellnessInterventionRepository.deleteById(id);
    }

    public List<Map<String, Object>> listFeedback() {
        return wellnessFeedbackRepository.findAllByOrderByCreatedAtDesc().stream()
            .map(this::toFeedbackInfo)
            .collect(java.util.stream.Collectors.toList());
    }

    @Transactional
    public void deleteFeedback(String id) {
        if (!wellnessFeedbackRepository.existsById(id)) {
            throw new IllegalArgumentException("Feedback not found");
        }
        wellnessFeedbackRepository.deleteById(id);
    }

    @Transactional
    public Map<String, Object> submitMobileCheckin(Map<String, ?> body) {
        String staffId = body.get("staffId") != null ? String.valueOf(body.get("staffId")) : null;
        if (staffId == null || staffId.isBlank()) {
            throw new IllegalArgumentException("staffId is required");
        }
        staffRepository.findById(staffId).orElseThrow(() -> new IllegalArgumentException("Staff not found"));
        double score = body.get("score") instanceof Number number ? number.doubleValue() : 75;
        double overtime = parseOvertimeAnswer(body.get("overtime"));
        int overtimeWarning = settingsService.getInt("workload", "overtimeWarningHours", 10);
        String risk = classifyRisk(overtime, overtimeWarning);
        if (score <= 50) risk = "high";
        else if (score <= 65 && !"high".equals(risk)) risk = "medium";
        insertWellnessRecord(staffId, overtime, risk, score);
        return Map.of("success", true, "score", Math.round(score), "risk", risk, "riskLevel", risk);
    }

    public Map<String, Object> getMobileWellness(String staffId) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (staffId == null || staffId.isBlank()) {
            result.put("authenticated", false);
            result.put("message", "Sign in to view your wellness data");
            return result;
        }
        final String resolvedStaffId = staffId;
        result.put("staffId", resolvedStaffId);
        Optional<WellnessRecord> latest = latestRecord(resolvedStaffId);
        if (latest.isPresent()) {
            WellnessRecord record = latest.get();
            result.put("score", record.getScore() != null ? Math.round(record.getScore()) : 0);
            result.put("riskLevel", record.getRiskLevel() != null ? record.getRiskLevel() : "low");
            result.put("overtime", Math.round(record.getOvertime()));
        } else {
            result.put("score", 75);
            result.put("riskLevel", "low");
            result.put("overtime", 0);
        }
        Map<String, Object> summary = getWellnessSummary();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> alerts = (List<Map<String, Object>>) summary.getOrDefault("alerts", List.of());
        long personalAlerts = alerts.stream().filter(a -> resolvedStaffId.equals(a.get("staffId"))).count();
        result.put("alerts", personalAlerts);
        result.put("avgScore", result.get("score"));
        return result;
    }

    public Map<String, Object> getMobileAlerts(String staffId) {
        Map<String, Object> response = new LinkedHashMap<>();
        if (staffId == null || staffId.isBlank()) {
            response.put("guest", true);
            response.put("alerts", List.of());
            return response;
        }

        Map<String, Object> summary = getWellnessSummary();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> alerts = (List<Map<String, Object>>) summary.getOrDefault("alerts", List.of());
        List<Map<String, Object>> filtered = alerts.stream()
            .filter(a -> staffId.equals(a.get("staffId")))
            .collect(java.util.stream.Collectors.toList());

        List<Map<String, Object>> normalized = new ArrayList<>();
        for (Map<String, Object> alert : filtered) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", "wellness-" + alert.getOrDefault("staffId", UUID.randomUUID().toString()));
            item.put("type", "wellness");
            item.put("message", alert.get("staff") + " — " + alert.get("risk") + " risk, +"
                + alert.get("overtime") + "hr overtime (" + alert.get("department") + ")");
            item.put("severity", alert.get("risk"));
            normalized.add(item);
        }

        LocalDateTime now = LocalDateTime.now();
        LocalDateTime horizon = now.plusDays(14);
        for (Schedule schedule : scheduleRepository.findByStaffIdAndDateBetween(staffId, now, horizon)) {
            if (!schedule.isSwapRequested() && !"swap_pending".equals(schedule.getStatus())) {
                continue;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", "schedule-" + schedule.getId());
            item.put("type", "schedule");
            String shift = schedule.getShift() != null ? schedule.getShift() : "shift";
            String date = schedule.getDate() != null ? schedule.getDate().toLocalDate().toString() : "";
            item.put("message", "Swap pending for " + shift + " on " + date);
            item.put("severity", "medium");
            normalized.add(item);
        }

        response.put("guest", false);
        response.put("alerts", normalized);
        return response;
    }

    @Transactional
    public Map<String, Object> submitSurvey(String userId, Map<String, ?> answers) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("User not found"));
        if (user.getStaffId() == null || user.getStaffId().isBlank()) {
            throw new IllegalArgumentException("Your account is not linked to a workforce profile");
        }

        String sessionId = UUID.randomUUID().toString();
        LocalDateTime submittedAt = LocalDateTime.now();
        for (Map.Entry<String, ?> entry : answers.entrySet()) {
            if (entry.getValue() == null) continue;
            WellnessSurveyResponse response = new WellnessSurveyResponse();
            response.setId(UUID.randomUUID().toString());
            response.setStaffId(user.getStaffId());
            response.setSessionId(sessionId);
            response.setQuestionId(entry.getKey());
            response.setValue(String.valueOf(entry.getValue()));
            response.setSubmittedAt(submittedAt);
            wellnessSurveyResponseRepository.save(response);
        }

        double overtime = overtimeFromSurveyAnswers(answers);
        double avgRating = averageRatingFromSurvey(answers);
        int overtimeWarning = settingsService.getInt("workload", "overtimeWarningHours", 10);
        String ruleRisk = riskFromRules(overtime, avgRating, overtimeWarning);
        double score = Math.min(100, Math.max(0, avgRating * 20));
        String risk = applyAiRiskIfAvailable(user.getStaffId(), overtime, score, ruleRisk);
        insertWellnessRecord(user.getStaffId(), overtime, risk, score);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("score", Math.round(score));
        result.put("risk", risk);
        result.put("overtime", Math.round(overtime));
        result.put("sessionId", sessionId);
        return result;
    }

    private void ensureProfileDepartment(String userId, String departmentId) {
        if (departmentId == null || departmentId.isBlank()) return;
        Department dept = departmentRepository.findById(departmentId).orElse(null);
        if (dept == null) return;

        UserProfile profile = userProfileRepository.findByUserId(userId).orElseGet(() -> {
            UserProfile p = new UserProfile();
            p.setId(UUID.randomUUID().toString());
            p.setUserId(userId);
            return p;
        });
        profile.setDepartmentId(dept.getId());
        profile.setDepartment(dept.getName());
        profile.setUpdatedAt(LocalDateTime.now());
        userProfileRepository.save(profile);
    }

    @SuppressWarnings("unchecked")
    private List<String> interventionTypes() {
        Object raw = settingsService.getSection("wellness").get("interventionTypes");
        if (raw instanceof List<?> list && !list.isEmpty()) {
            return list.stream().map(String::valueOf).collect(java.util.stream.Collectors.toList());
        }
        return List.of(
            "Reduce overtime",
            "Wellness check-in",
            "Peer support",
            "Schedule adjustment",
            "Mental health referral"
        );
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> surveyQuestions() {
        Object raw = settingsService.getSection("wellness").get("surveyQuestions");
        if (raw instanceof List<?> list && !list.isEmpty()) {
            List<Map<String, Object>> questions = new ArrayList<>();
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    Map<String, Object> q = new LinkedHashMap<>();
                    q.put("id", String.valueOf(map.get("id")));
                    q.put("text", String.valueOf(map.get("text")));
                    Object typeVal = map.get("type");
                    q.put("type", typeVal != null ? String.valueOf(typeVal) : "scale");
                    questions.add(q);
                }
            }
            if (!questions.isEmpty()) return questions;
        }
        return List.of(
            Map.of("id", "q1", "text", "How would you rate your current workload?", "type", "scale"),
            Map.of("id", "q2", "text", "Do you feel supported by your team?", "type", "scale"),
            Map.of("id", "q3", "text", "How many hours of overtime did you work this week?", "type", "number"),
            Map.of("id", "q4", "text", "How would you rate your work-life balance?", "type", "scale"),
            Map.of("id", "q5", "text", "Would you recommend intervention support?", "type", "scale")
        );
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> shiftHoursSettings() {
        Object raw = settingsService.getSection("wellness").get("shiftHours");
        if (raw instanceof Map<?, ?> map && !map.isEmpty()) {
            Map<String, Object> hours = new LinkedHashMap<>();
            map.forEach((k, v) -> {
                if (v instanceof Number n) hours.put(String.valueOf(k), n.doubleValue());
            });
            if (!hours.isEmpty()) return hours;
        }
        return Map.of("day", 8.0, "evening", 8.0, "night", 10.0);
    }

    private double shiftHours(String shift) {
        if (shift == null) return 8;
        Map<String, Object> configured = shiftHoursSettings();
        String key = shift.toLowerCase();
        Object value = configured.get(key);
        if (value instanceof Number number) return number.doubleValue();
        return switch (key) {
            case "night" -> 10;
            case "evening" -> 8;
            default -> 8;
        };
    }

    private String classifyRisk(double overtime, int overtimeWarning) {
        if (overtime >= overtimeWarning + 2) return "high";
        if (overtime >= overtimeWarning || overtime >= 6) return "medium";
        return "low";
    }

    private double scoreFromRisk(String risk) {
        return switch (risk) {
            case "high" -> 65;
            case "medium" -> 72;
            default -> 85;
        };
    }

    private boolean isAtRisk(WellnessRecord record, int overtimeWarning) {
        String risk = record.getRiskLevel();
        return "high".equals(risk) || "medium".equals(risk) || record.getOvertime() > overtimeWarning;
    }

    private Optional<WellnessRecord> latestRecord(String staffId) {
        List<WellnessRecord> records = wellnessRecordRepository.findTop1ByStaffIdOrderByDateDesc(staffId);
        return records.isEmpty() ? Optional.empty() : Optional.of(records.get(0));
    }

    private WellnessRecord insertWellnessRecord(String staffId, double overtime, String risk, double score) {
        WellnessRecord record = new WellnessRecord();
        record.setId(UUID.randomUUID().toString());
        record.setStaffId(staffId);
        record.setDate(LocalDateTime.now());
        record.setOvertime(overtime);
        record.setRiskLevel(risk);
        record.setScore(score);
        return wellnessRecordRepository.save(record);
    }

    private void upsertWellnessRecord(String staffId, double overtime, String risk, double score) {
        WellnessRecord record = latestRecord(staffId).orElseGet(WellnessRecord::new);
        if (record.getId() == null) {
            record.setId(UUID.randomUUID().toString());
            record.setStaffId(staffId);
        }
        record.setDate(LocalDateTime.now());
        record.setOvertime(overtime);
        record.setRiskLevel(risk);
        record.setScore(score);
        wellnessRecordRepository.save(record);
    }

    private Map<String, Object> buildAlert(User user, Staff staff, WellnessRecord record,
                                           Map<String, String> departmentNames) {
        String departmentName = "";
        if (staff.getDepartmentId() != null) {
            departmentName = departmentNames.getOrDefault(staff.getDepartmentId(), "");
        }
        Map<String, Object> alert = new LinkedHashMap<>();
        alert.put("userId", user != null ? user.getId() : null);
        alert.put("email", user != null && user.getEmail() != null ? user.getEmail() : staff.getEmail());
        alert.put("staffId", staff.getId());
        alert.put("staff", staff.getName());
        alert.put("department", departmentName);
        alert.put("risk", record.getRiskLevel() != null ? record.getRiskLevel() : "medium");
        alert.put("overtime", Math.round(record.getOvertime()));
        alert.put("id", staff.getId() + "-" + record.getId());
        return alert;
    }

    private void ensureStaffHasEmail(Staff staff) {
        if (staff.getEmail() != null && !staff.getEmail().isBlank()) return;
        String base = staff.getName() != null
            ? staff.getName().toLowerCase().replaceAll("[^a-z0-9]+", ".").replaceAll("^\\.+|\\.+$", "")
            : "staff";
        if (base.isBlank()) base = "staff";
        String email = base + "@hospital.org";
        int suffix = 1;
        while (userRepository.findByEmail(email).isPresent()
            || staffRepository.findByEmailIgnoreCase(email).filter(s -> !s.getId().equals(staff.getId())).isPresent()) {
            email = base + suffix + "@hospital.org";
            suffix++;
        }
        staff.setEmail(email);
        staffRepository.save(staff);
    }

    private Map<String, Object> toRecordInfo(WellnessRecord record) {
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("id", record.getId());
        info.put("staffId", record.getStaffId());
        staffRepository.findById(record.getStaffId()).ifPresent(staff -> {
            info.put("staffName", staff.getName());
            if (staff.getDepartmentId() != null) {
                departmentRepository.findById(staff.getDepartmentId())
                    .ifPresent(dept -> info.put("department", dept.getName()));
            }
        });
        info.put("date", record.getDate() != null ? record.getDate().toLocalDate().toString() : null);
        info.put("overtime", Math.round(record.getOvertime()));
        info.put("riskLevel", record.getRiskLevel());
        info.put("score", record.getScore() != null ? Math.round(record.getScore()) : null);
        return info;
    }

    private Map<String, Object> toInterventionInfo(WellnessIntervention intervention) {
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("id", intervention.getId());
        info.put("staffId", intervention.getStaffId());
        if (intervention.getStaffId() != null) {
            staffRepository.findById(intervention.getStaffId())
                .ifPresent(staff -> info.put("staffName", staff.getName()));
        }
        info.put("type", intervention.getType());
        info.put("title", intervention.getType());
        info.put("description", intervention.getType() + " intervention");
        info.put("status", intervention.getStatus() != null ? intervention.getStatus() : "active");
        info.put("recommendedAt", intervention.getRecommendedAt() != null
            ? intervention.getRecommendedAt().toLocalDate().toString() : null);
        info.put("completedAt", intervention.getCompletedAt() != null
            ? intervention.getCompletedAt().toLocalDate().toString() : null);
        return info;
    }

    private Map<String, Object> toFeedbackInfo(WellnessFeedback feedback) {
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("id", feedback.getId());
        info.put("rating", feedback.getRating());
        info.put("message", feedback.getMessage());
        info.put("anonymous", feedback.isAnonymous());
        info.put("createdAt", feedback.getCreatedAt() != null
            ? feedback.getCreatedAt().toLocalDate().toString() : null);
        info.put("sentiment", feedback.getSentiment());
        info.put("urgency", feedback.getUrgency());
        info.put("themes", feedback.getThemes() != null
            ? List.of(feedback.getThemes().split(",")) : List.of());
        return info;
    }

    public Map<String, Object> getAiHealth() {
        Map<String, Object> health = new LinkedHashMap<>();
        health.put("aiServiceHealthy", wellnessAiService.isActive());
        health.put("features", List.of("burnout-risk", "intervention-ranking", "feedback-sentiment", "explainability"));
        return health;
    }

    public Map<String, Object> getBurnoutModelInfo() {
        return wellnessAiService.getModelInfo();
    }

    public Map<String, Object> predictStaffRisk(String staffId) {
        Staff staff = staffRepository.findById(staffId)
            .orElseThrow(() -> new IllegalArgumentException("Staff not found"));
        WellnessRecord record = latestRecord(staffId).orElseThrow(
            () -> new IllegalArgumentException("No wellness record for staff"));
        Map<String, Object> risk = wellnessAiService.predictRiskForStaff(staff, record);
        Map<String, Object> interventions = wellnessAiService.recommendInterventionsForStaff(staff, record, risk);
        Map<String, Object> result = new LinkedHashMap<>(risk);
        result.put("staffId", staffId);
        result.put("staffName", staff.getName());
        result.put("interventions", interventions);
        return result;
    }

    private String riskFromRules(double overtime, double avgRating, int overtimeWarning) {
        String risk = classifyRisk(overtime, overtimeWarning);
        if (avgRating <= 2) return "high";
        if (avgRating <= 3 && !"high".equals(risk)) return "medium";
        return risk;
    }

    private String applyAiRiskIfAvailable(String staffId, double overtime, double score, String fallbackRisk) {
        if (!wellnessAiService.isActive()) return fallbackRisk;
        Staff staff = staffRepository.findById(staffId).orElse(null);
        if (staff == null) return fallbackRisk;
        WellnessRecord temp = new WellnessRecord();
        temp.setStaffId(staffId);
        temp.setOvertime(overtime);
        temp.setScore(score);
        temp.setRiskLevel(fallbackRisk);
        try {
            Map<String, Object> prediction = wellnessAiService.predictRiskForStaff(staff, temp);
            Object aiRisk = prediction.get("risk_level");
            return aiRisk != null ? String.valueOf(aiRisk) : fallbackRisk;
        } catch (Exception ignored) {
            return fallbackRisk;
        }
    }

    @SuppressWarnings("unchecked")
    private List<String> themesList(Object themes) {
        if (themes instanceof List<?> list) {
            return list.stream().map(String::valueOf).collect(java.util.stream.Collectors.toList());
        }
        return List.of("general");
    }

    private String resolveFeedbackMessage(Map<String, ?> body) {
        if (body.get("message") != null) return String.valueOf(body.get("message"));
        if (body.get("feedback") != null) return String.valueOf(body.get("feedback"));
        return "";
    }

    private double parseOvertimeAnswer(Object value) {
        if (value instanceof Number number) return Math.max(0, number.doubleValue());
        if (value != null) {
            try {
                return Math.max(0, Double.parseDouble(String.valueOf(value)));
            } catch (NumberFormatException ignored) {
                return 0;
            }
        }
        return 0;
    }

    private double overtimeFromSurveyAnswers(Map<String, ?> answers) {
        String overtimeId = surveyQuestions().stream()
            .filter(q -> "number".equals(q.get("type")))
            .map(q -> String.valueOf(q.get("id")))
            .findFirst()
            .orElse("q3");
        return parseOvertimeAnswer(answers.get(overtimeId));
    }

    private double averageRatingFromSurvey(Map<String, ?> answers) {
        Set<String> scaleIds = surveyQuestions().stream()
            .filter(q -> "scale".equals(q.get("type")))
            .map(q -> String.valueOf(q.get("id")))
            .collect(java.util.stream.Collectors.toSet());
        List<Double> ratings = new ArrayList<>();
        answers.forEach((key, value) -> {
            if (scaleIds.contains(key) && value instanceof Number number) {
                ratings.add(number.doubleValue());
            }
        });
        if (ratings.isEmpty()) return 3;
        return ratings.stream().mapToDouble(Double::doubleValue).average().orElse(3);
    }

    private String normalizeEmail(String email) {
        String trimmed = email.trim().toLowerCase();
        int at = trimmed.indexOf('@');
        if (at <= 0) return trimmed;
        String local = trimmed.substring(0, at)
            .replaceAll("[^a-z0-9]+", ".")
            .replaceAll("^\\.+|\\.+$", "");
        return local + trimmed.substring(at);
    }
}
