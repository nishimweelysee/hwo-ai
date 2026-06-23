package com.hwo.service;

import com.hwo.entity.Department;
import com.hwo.entity.LeaveRequest;
import com.hwo.entity.OnCallSchedule;
import com.hwo.entity.Schedule;
import com.hwo.entity.Staff;
import com.hwo.entity.User;
import com.hwo.repository.DepartmentRepository;
import com.hwo.repository.LeaveRequestRepository;
import com.hwo.repository.OnCallScheduleRepository;
import com.hwo.repository.ScheduleRepository;
import com.hwo.repository.StaffRepository;
import com.hwo.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.PageRequest;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class SchedulingService {

    private final ScheduleRepository scheduleRepository;
    private final LeaveRequestRepository leaveRequestRepository;
    private final OnCallScheduleRepository onCallScheduleRepository;
    private final StaffRepository staffRepository;
    private final UserRepository userRepository;
    private final DepartmentRepository departmentRepository;
    private final SettingsService settingsService;
    private final SchedulingAiService schedulingAiService;

    public SchedulingService(ScheduleRepository scheduleRepository,
                             LeaveRequestRepository leaveRequestRepository,
                             OnCallScheduleRepository onCallScheduleRepository,
                             StaffRepository staffRepository,
                             UserRepository userRepository,
                             DepartmentRepository departmentRepository,
                             SettingsService settingsService,
                             SchedulingAiService schedulingAiService) {
        this.scheduleRepository = scheduleRepository;
        this.leaveRequestRepository = leaveRequestRepository;
        this.onCallScheduleRepository = onCallScheduleRepository;
        this.staffRepository = staffRepository;
        this.userRepository = userRepository;
        this.departmentRepository = departmentRepository;
        this.settingsService = settingsService;
        this.schedulingAiService = schedulingAiService;
    }

    public static LocalDateTime parseDateTime(Object value) {
        if (value == null) {
            throw new IllegalArgumentException("date required");
        }
        String s = String.valueOf(value).trim();
        if (s.length() == 10) {
            return LocalDate.parse(s).atStartOfDay();
        }
        if (s.endsWith("Z")) {
            s = s.substring(0, s.length() - 1);
        }
        if (s.length() == 16) {
            return LocalDateTime.parse(s + ":00");
        }
        return LocalDateTime.parse(s);
    }

    public static LocalDate parseDate(Object value, LocalDate fallback) {
        if (value == null) {
            return fallback;
        }
        String s = String.valueOf(value).trim();
        if (s.length() >= 10) {
            return LocalDate.parse(s.substring(0, 10));
        }
        return LocalDate.parse(s);
    }

    private LocalDateTime dayStart(LocalDate date) {
        return date.atStartOfDay();
    }

    private LocalDateTime dayEnd(LocalDate date) {
        return date.plusDays(1).atStartOfDay();
    }

    // --- Schedules ---

    public List<Map<String, Object>> listSchedules(LocalDate date) {
        return loadDaySchedules(date).stream()
            .map(this::toScheduleDto)
            .collect(Collectors.toList());
    }

    /** Single payload for the scheduling page — one schedule query for slots, summary, and conflicts. */
    public Map<String, Object> getDayOverview(LocalDate date) {
        List<Schedule> schedules = loadDaySchedules(date);
        Map<String, Object> overview = new LinkedHashMap<>();
        overview.put("schedules", schedules.stream().map(this::toScheduleDto).collect(Collectors.toList()));
        overview.put("summary", scheduleSummary(date, schedules));
        overview.put("conflicts", detectConflicts(date, schedules));
        overview.put("leave", listLeave(300));
        overview.put("onCall", listOnCall(date));
        return overview;
    }

    public Map<String, Object> getSchedulingMeta() {
        List<String> shiftTypes = settingsService.getShiftTypes();
        String defaultShift = shiftTypes.isEmpty() ? "Day" : shiftTypes.get(0);
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("constraints", settingsService.getSchedulingConstraints());
        meta.put("preferences", listSchedulingPreferences(defaultShift));
        meta.put("shiftTypes", shiftTypes);
        meta.put("departments", departmentRepository.findAllOrderByName().stream()
            .filter(Department::isActive)
            .map(d -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", d.getId());
                row.put("name", d.getName());
                row.put("code", d.getCode() != null ? d.getCode() : "");
                return row;
            })
            .collect(Collectors.toList()));
        return meta;
    }

    public List<Map<String, Object>> listSchedulingPreferences(String defaultShift) {
        Map<String, Map<String, Object>> stored = settingsService.getStaffSchedulingPreferences();
        List<User> linkedUsers = userRepository.findByStaffIdIsNotNull();
        Set<String> staffIds = linkedUsers.stream()
            .map(User::getStaffId)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
        Map<String, Staff> staffById = staffRepository.findAllById(staffIds).stream()
            .collect(Collectors.toMap(Staff::getId, s -> s, (a, b) -> a));

        return linkedUsers.stream()
            .map(user -> {
                if (user.getStaffId() == null) return null;
                Staff staff = staffById.get(user.getStaffId());
                if (staff == null) return null;
                Map<String, Object> saved = stored.get(staff.getId());
                List<String> preferredShifts = preferenceShiftList(saved, "preferredShifts", defaultShift);
                List<String> avoidDates = preferenceStringList(saved, "avoidDates");
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
    }

    private List<Schedule> loadDaySchedules(LocalDate date) {
        return scheduleRepository.findDaySchedulesWithDetails(dayStart(date), dayEnd(date));
    }

    @SuppressWarnings("unchecked")
    private List<String> preferenceShiftList(Map<String, Object> saved, String key, String fallback) {
        if (saved == null) return List.of(fallback);
        Object value = saved.get(key);
        if (value instanceof List<?> list && !list.isEmpty()) {
            return list.stream().map(String::valueOf).toList();
        }
        return List.of(fallback);
    }

    @SuppressWarnings("unchecked")
    private List<String> preferenceStringList(Map<String, Object> saved, String key) {
        if (saved == null) return List.of();
        Object value = saved.get(key);
        if (value instanceof List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        return List.of();
    }

    public Optional<Map<String, Object>> getSchedule(String id) {
        return scheduleRepository.findById(id).map(this::toScheduleDto);
    }

    public Map<String, Object> createSchedule(Map<String, Object> body) {
        String staffId = stringValue(body.get("staffId"));
        String shift = stringValue(body.get("shift"));
        if (staffId == null || shift == null) {
            throw new IllegalArgumentException("staffId and shift are required");
        }
        Staff staff = staffRepository.findById(staffId)
            .orElseThrow(() -> new IllegalArgumentException("Staff member not found"));
        validateShiftType(shift);

        LocalDate date = body.containsKey("date")
            ? parseDate(body.get("date"), LocalDate.now())
            : LocalDate.now();
        LocalDateTime scheduleDate = date.atStartOfDay();

        validateNoDoubleBooking(staffId, date, null);
        validateNotOnLeave(staffId, date);

        Schedule schedule = new Schedule();
        schedule.setId(UUID.randomUUID().toString());
        schedule.setStaffId(staff.getId());
        if (body.containsKey("departmentId")) {
            String departmentId = stringValue(body.get("departmentId"));
            if (departmentId != null) {
                schedule.setDepartmentId(departmentId);
            } else {
                schedule.setDepartmentId(staff.getDepartmentId());
            }
        } else {
            schedule.setDepartmentId(staff.getDepartmentId());
        }
        schedule.setDate(scheduleDate);
        schedule.setShift(shift);
        schedule.setStatus(stringValue(body.get("status"), "scheduled"));
        schedule.setSwapRequested(false);
        return toScheduleDto(scheduleRepository.save(schedule));
    }

    public Map<String, Object> updateSchedule(String id, Map<String, Object> body) {
        Schedule schedule = scheduleRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Schedule not found"));

        if (body.containsKey("staffId")) {
            String staffId = stringValue(body.get("staffId"));
            if (staffId == null) {
                throw new IllegalArgumentException("staffId cannot be empty");
            }
            Staff staffMember = staffRepository.findById(staffId)
                .orElseThrow(() -> new IllegalArgumentException("Staff member not found"));
            schedule.setStaffId(staffMember.getId());
            schedule.setDepartmentId(staffMember.getDepartmentId());
        }
        if (body.containsKey("shift")) {
            String shift = stringValue(body.get("shift"));
            if (shift == null) {
                throw new IllegalArgumentException("shift cannot be empty");
            }
            validateShiftType(shift);
            schedule.setShift(shift);
        }
        LocalDate targetDate = schedule.getDate() != null
            ? schedule.getDate().toLocalDate()
            : LocalDate.now();
        if (body.containsKey("date")) {
            targetDate = parseDate(body.get("date"), targetDate);
            schedule.setDate(targetDate.atStartOfDay());
        }
        if (body.containsKey("status")) {
            schedule.setStatus(stringValue(body.get("status")));
        }
        if (body.containsKey("swapRequested")) {
            schedule.setSwapRequested(Boolean.TRUE.equals(body.get("swapRequested")));
        }

        if (schedule.getStaffId() != null && !schedule.getStaffId().isBlank()) {
            validateNoDoubleBooking(schedule.getStaffId(), targetDate, schedule.getId());
            validateNotOnLeave(schedule.getStaffId(), targetDate);
            if ("open".equals(schedule.getStatus())) {
                schedule.setStatus("scheduled");
            }
        }

        return toScheduleDto(scheduleRepository.save(schedule));
    }

    public void deleteSchedule(String id) {
        if (!scheduleRepository.existsById(id)) {
            throw new IllegalArgumentException("Schedule not found");
        }
        scheduleRepository.deleteById(id);
    }

    public Map<String, Object> publishSchedule(LocalDate date) {
        List<Schedule> schedules = scheduleRepository.findByDateBetween(dayStart(date), dayEnd(date));
        int published = 0;
        int openSlots = 0;
        for (Schedule schedule : schedules) {
            if (schedule.getStaffId() == null || schedule.getStaffId().isBlank()) {
                openSlots++;
                continue;
            }
            schedule.setStatus("published");
            scheduleRepository.save(schedule);
            published++;
        }
        String message = published > 0
            ? published + " shift(s) published. Staff will be notified."
            : "No assigned shifts to publish.";
        if (openSlots > 0) {
            message += " " + openSlots + " open slot(s) still need a replacement.";
        }
        return Map.of(
            "success", true,
            "message", message,
            "date", date.toString(),
            "published", published,
            "openSlots", openSlots
        );
    }

    public Map<String, Object> requestSwap(String scheduleId) {
        Schedule schedule = scheduleRepository.findById(scheduleId)
            .orElseThrow(() -> new IllegalArgumentException("Schedule not found"));
        return requestSwap(schedule);
    }

    /** Staff may request swap only on shifts assigned to their workforce profile. */
    public boolean isScheduleOwnedByStaff(String scheduleId, String staffId) {
        if (staffId == null || staffId.isBlank()) return false;
        return scheduleRepository.findById(scheduleId)
            .map(s -> staffId.equals(s.getStaffId()))
            .orElse(false);
    }

    private Map<String, Object> requestSwap(Schedule schedule) {
        if (schedule.getStaffId() == null || schedule.getStaffId().isBlank()) {
            throw new IllegalArgumentException("Cannot request swap on an open shift");
        }
        if ("open".equals(schedule.getStatus())) {
            throw new IllegalArgumentException("Shift is already open for assignment");
        }
        if (schedule.isSwapRequested()) {
            throw new IllegalArgumentException("Swap already requested for this shift");
        }
        if ("published".equals(schedule.getStatus())) {
            throw new IllegalArgumentException("Cannot request swap on a published shift without manager approval");
        }
        schedule.setSwapRequested(true);
        schedule.setStatus("swap_pending");
        scheduleRepository.save(schedule);
        return Map.of("success", true, "status", "swap requested");
    }

    public Map<String, Object> resolveSwap(String scheduleId, String action, String staffId) {
        Schedule schedule = scheduleRepository.findById(scheduleId)
            .orElseThrow(() -> new IllegalArgumentException("Schedule not found"));
        String normalized = action != null ? action.toLowerCase(Locale.ROOT) : "";
        switch (normalized) {
            case "assign" -> {
                if (staffId == null || staffId.isBlank()) {
                    throw new IllegalArgumentException("staffId required for assign action");
                }
                if (!"open".equals(schedule.getStatus()) && !"swap_pending".equals(schedule.getStatus())) {
                    throw new IllegalArgumentException("Can only assign partners to open or swap-pending shifts");
                }
                Staff staffMember = staffRepository.findById(staffId)
                    .orElseThrow(() -> new IllegalArgumentException("Staff member not found"));
                LocalDate targetDate = schedule.getDate() != null
                    ? schedule.getDate().toLocalDate()
                    : LocalDate.now();
                validateNoDoubleBooking(staffMember.getId(), targetDate, schedule.getId());
                validateNotOnLeave(staffMember.getId(), targetDate);
                schedule.setStaffId(staffMember.getId());
                schedule.setDepartmentId(staffMember.getDepartmentId());
                schedule.setSwapRequested(false);
                schedule.setStatus("scheduled");
                scheduleRepository.save(schedule);
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("success", true);
                result.put("status", "scheduled");
                result.put("message", staffMember.getName() + " assigned as swap partner");
                result.put("schedule", toScheduleDto(schedule));
                return result;
            }
            case "approve" -> {
                String previousStaff = schedule.getStaff() != null ? schedule.getStaff().getName() : "Staff member";
                if (schedule.getStaff() != null && schedule.getStaff().getDepartmentId() != null) {
                    schedule.setDepartmentId(schedule.getStaff().getDepartmentId());
                }
                schedule.setSwapRequested(false);
                schedule.setStaffId(null);
                schedule.setStatus("open");
                scheduleRepository.save(schedule);
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("success", true);
                result.put("status", "open");
                result.put("message", previousStaff + " removed from shift — assign a replacement");
                result.put("schedule", toScheduleDto(schedule));
                return result;
            }
            case "reject", "deny" -> {
                schedule.setSwapRequested(false);
                if ("swap_pending".equals(schedule.getStatus())) {
                    schedule.setStatus("scheduled");
                }
                scheduleRepository.save(schedule);
                return Map.of("success", true, "status", "swap rejected");
            }
            case "cancel" -> {
                schedule.setSwapRequested(false);
                if ("swap_pending".equals(schedule.getStatus())) {
                    schedule.setStatus("scheduled");
                }
                scheduleRepository.save(schedule);
                return Map.of("success", true, "status", "swap cancelled");
            }
            default -> throw new IllegalArgumentException("action must be approve, reject, assign, or cancel");
        }
    }

    public Map<String, Object> scheduleSummary(LocalDate date) {
        return scheduleSummary(date, loadDaySchedules(date));
    }

    public Map<String, Object> scheduleSummary(LocalDate date, List<Schedule> schedules) {
        int scheduled = (int) schedules.stream()
            .filter(s -> s.getStaffId() != null && !s.getStaffId().isBlank())
            .count();
        int swapRequests = (int) schedules.stream().filter(Schedule::isSwapRequested).count();
        int minStaffPerShift = settingsService.getInt("scheduling", "minStaffPerShift");
        List<String> shiftTypes = settingsService.getShiftTypes();
        if (shiftTypes.isEmpty()) {
            shiftTypes = List.of("Day", "Evening", "Night");
        }

        List<Department> departments = departmentRepository.findAll().stream()
            .filter(Department::isActive)
            .sorted(Comparator.comparing(Department::getName, String.CASE_INSENSITIVE_ORDER))
            .collect(Collectors.toList());

        Map<String, Double> multipliers = schedulingAiService.forecastMultipliersHeuristic(date);
        List<Map<String, Object>> forecastByDepartment =
            schedulingAiService.departmentForecastsHeuristic(date, multipliers);

        List<Map<String, Object>> openShiftSlots = buildDepartmentOpenShiftSlots(
            date, schedules, departments, shiftTypes, minStaffPerShift, multipliers, forecastByDepartment);

        int targetShifts = 0;
        for (Department department : departments) {
            double mult = multipliers.getOrDefault(department.getId(), 1.0);
            int effectiveMin = (int) Math.ceil(minStaffPerShift * mult);
            targetShifts += effectiveMin * shiftTypes.size();
        }
        int openShifts = openShiftSlots.size();
        int coverage = targetShifts > 0 ? Math.min(100, (int) Math.round((scheduled * 100.0) / targetShifts)) : 0;

        List<Map<String, Object>> recommendations = buildDepartmentRecommendations(
            date, schedules, departments, shiftTypes, minStaffPerShift, multipliers,
            scheduled, targetShifts, openShifts, forecastByDepartment);

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("coverage", coverage);
        summary.put("openShifts", openShifts);
        summary.put("swapRequests", swapRequests);
        summary.put("targetShifts", targetShifts);
        summary.put("scheduled", scheduled);
        summary.put("minStaffPerShift", minStaffPerShift);
        summary.put("openShiftSlots", openShiftSlots);
        summary.put("recommendations", recommendations);
        summary.put("forecastByDepartment", forecastByDepartment);
        summary.put("aiAssisted", schedulingAiService.isSchedulingAiActive());
        summary.put("modelHealth", schedulingAiService.schedulingModelHealth());
        summary.put("globalForecastBoost", 0.0);
        return summary;
    }

    /**
     * Fills open and forecast-gap shifts using AI-ranked assignee suggestions and prediction-driven staffing targets.
     */
    public Map<String, Object> autoSchedule(LocalDate date) {
        Map<String, Double> multipliers = schedulingAiService.forecastMultipliersHeuristic(date);
        int minStaffPerShift = settingsService.getInt("scheduling", "minStaffPerShift");
        List<String> shiftTypes = settingsService.getShiftTypes();
        if (shiftTypes.isEmpty()) {
            shiftTypes = List.of("Day", "Evening", "Night");
        }
        List<Department> departments = departmentRepository.findAll().stream()
            .filter(Department::isActive)
            .sorted(Comparator.comparing(Department::getName, String.CASE_INSENSITIVE_ORDER))
            .collect(Collectors.toList());

        SchedulingAiService.SchedulingContext ctx = schedulingAiService.loadSchedulingContext(date);
        int coverageBefore = computeCoverage(ctx.daySchedules(), departments, shiftTypes, minStaffPerShift, multipliers);
        int openBefore = countOpenShiftGaps(date, ctx.daySchedules(), departments, shiftTypes, minStaffPerShift, multipliers, List.of());

        int assigned = 0;
        int skipped = 0;
        List<Map<String, Object>> assignmentDetails = new ArrayList<>();
        List<String> skippedReasons = new ArrayList<>();
        List<Map<String, Object>> forecastByDepartment = List.of();

        List<Schedule> vacantSchedules = ctx.daySchedules().stream()
            .filter(s -> s.getShift() != null && !s.getShift().isBlank())
            .filter(s -> s.getStaffId() == null || s.getStaffId().isBlank()
                || "open".equals(s.getStatus()) || "swap_pending".equals(s.getStatus()))
            .sorted(Comparator.comparingDouble((Schedule s) ->
                multipliers.getOrDefault(resolveScheduleDepartmentId(s), 1.0)).reversed())
            .collect(Collectors.toList());

        for (Schedule schedule : vacantSchedules) {
            String deptId = resolveScheduleDepartmentId(schedule);
            String shift = schedule.getShift();
            Optional<Map<String, Object>> detail = tryAutoAssign(ctx, deptId, shift,
                staffId -> assignStaffToOpenSchedule(schedule, staffId));
            if (detail.isPresent()) {
                assigned++;
                schedulingAiService.registerAssignment(ctx, schedule);
                Map<String, Object> row = detail.get();
                row.put("type", "replacement");
                row.put("scheduleId", schedule.getId());
                row.put("department", resolveScheduleDepartmentName(schedule));
                assignmentDetails.add(row);
            } else {
                skipped++;
                skippedReasons.add("No eligible staff for open " + shift + " shift"
                    + (deptId != null ? " (" + resolveScheduleDepartmentName(schedule) + ")" : ""));
            }
        }

        List<Map<String, Object>> openSlots = buildDepartmentOpenShiftSlots(
            date, ctx.daySchedules(), departments, shiftTypes, minStaffPerShift, multipliers, forecastByDepartment);

        List<Map<String, Object>> sortedSlots = new ArrayList<>(openSlots);
        sortedSlots.sort(Comparator
            .comparing((Map<String, Object> slot) -> Boolean.TRUE.equals(slot.get("surge")) ? 1 : 0).reversed()
            .thenComparing(slot -> String.valueOf(slot.getOrDefault("department", ""))));

        int staffCapacity = (int) ctx.allStaff().stream()
            .filter(s -> !ctx.bookedStaffIds().contains(s.getId()))
            .count();

        int slotsToTry = Math.min(sortedSlots.size(), staffCapacity);
        for (int slotIndex = 0; slotIndex < slotsToTry; slotIndex++) {
            Map<String, Object> slot = sortedSlots.get(slotIndex);
            if (staffCapacity <= 0) {
                skipped++;
                skippedReasons.add("All staff already scheduled for " + date + " — cannot fill additional forecast gaps");
                break;
            }
            String deptId = stringValue(slot.get("departmentId"));
            String shift = stringValue(slot.get("shift"));
            if (shift == null) {
                skipped++;
                continue;
            }
            Optional<Map<String, Object>> detail = tryAutoAssign(ctx, deptId, shift, staffId -> {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("staffId", staffId);
                body.put("shift", shift);
                body.put("date", date.toString());
                if (deptId != null) {
                    body.put("departmentId", deptId);
                }
                Map<String, Object> created = createSchedule(body);
                Schedule createdSchedule = new Schedule();
                createdSchedule.setId(String.valueOf(created.get("id")));
                createdSchedule.setStaffId(staffId);
                createdSchedule.setDepartmentId(deptId != null ? deptId : stringValue(created.get("departmentId")));
                createdSchedule.setDate(date.atStartOfDay());
                createdSchedule.setShift(shift);
                schedulingAiService.registerAssignment(ctx, createdSchedule);
            });
            if (detail.isPresent()) {
                assigned++;
                staffCapacity--;
                Map<String, Object> row = detail.get();
                row.put("type", "new");
                row.put("department", stringValue(slot.get("department")));
                row.put("surge", slot.get("surge"));
                row.put("forecastReason", slot.get("forecastReason"));
                assignmentDetails.add(row);
            } else {
                skipped++;
                skippedReasons.add("No eligible staff for forecast gap: "
                    + stringValue(slot.get("department")) + " · " + shift);
            }
        }

        int coverageAfter = computeCoverage(ctx.daySchedules(), departments, shiftTypes, minStaffPerShift, multipliers);
        int openAfter = countOpenShiftGaps(date, ctx.daySchedules(), departments, shiftTypes, minStaffPerShift, multipliers, forecastByDepartment);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("date", date.toString());
        result.put("assigned", assigned);
        result.put("skipped", skipped);
        result.put("coverageBefore", coverageBefore);
        result.put("coverageAfter", coverageAfter);
        result.put("openShiftsBefore", openBefore);
        result.put("openShiftsAfter", openAfter);
        result.put("aiAssisted", schedulingAiService.isSchedulingAiActive());
        result.put("assignments", assignmentDetails.stream().limit(50).collect(Collectors.toList()));
        if (assignmentDetails.size() > 50) {
            result.put("assignmentsTruncated", true);
            result.put("totalAssignments", assignmentDetails.size());
        }
        if (!skippedReasons.isEmpty()) {
            result.put("skippedReasons", skippedReasons.stream().limit(10).collect(Collectors.toList()));
        }
        result.put("message", assigned > 0
            ? "Auto-scheduled " + assigned + " shift(s). Coverage " + coverageBefore + "% → " + coverageAfter + "%."
            : buildAutoScheduleEmptyMessage(date, skippedReasons));
        return result;
    }

    private String buildAutoScheduleEmptyMessage(LocalDate date, List<String> skippedReasons) {
        if (skippedReasons.stream().anyMatch(r -> r.contains("already scheduled"))) {
            return "No shifts assigned — all staff are already scheduled for "
                + date + ". Clear open shifts or pick another date.";
        }
        if (skippedReasons.stream().anyMatch(r -> r.contains("certification") || r.contains("eligible"))) {
            return "No shifts could be auto-assigned — staff may lack required certifications or be unavailable. "
                + "Try disabling strict skill mix in scheduling constraints, or add certified staff.";
        }
        return "No shifts could be auto-assigned — check staff availability, certifications, and open shift gaps.";
    }

    private Optional<Map<String, Object>> tryAutoAssign(SchedulingAiService.SchedulingContext ctx,
                                                        String departmentId, String shift,
                                                        java.util.function.Consumer<String> assignAction) {
        Optional<Map<String, Object>> detail = tryAutoAssignPass(ctx, departmentId, shift, false, false, assignAction);
        if (detail.isPresent()) return detail;
        return tryAutoAssignPass(ctx, departmentId, shift, true, true, assignAction);
    }

    private Optional<Map<String, Object>> tryAutoAssignPass(SchedulingAiService.SchedulingContext ctx,
                                                              String departmentId, String shift,
                                                              boolean crossDepartment, boolean relaxCerts,
                                                              java.util.function.Consumer<String> assignAction) {
        List<Map<String, Object>> suggestions = schedulingAiService.suggestAssignees(
            ctx, departmentId, shift, null, 25, crossDepartment, relaxCerts);
        for (Map<String, Object> suggestion : suggestions) {
            String staffId = stringValue(suggestion.get("staffId"));
            if (staffId == null) continue;
            try {
                assignAction.accept(staffId);
                Map<String, Object> detail = new LinkedHashMap<>();
                detail.put("staffId", staffId);
                detail.put("staffName", suggestion.get("name"));
                detail.put("shift", shift);
                detail.put("departmentId", departmentId);
                detail.put("score", suggestion.get("score"));
                detail.put("aiRanked", suggestion.get("aiRanked"));
                detail.put("reasons", suggestion.get("reasons"));
                detail.put("crossDepartment", crossDepartment);
                detail.put("relaxedCerts", relaxCerts);
                return Optional.of(detail);
            } catch (IllegalArgumentException ignored) {
                // Try next ranked candidate
            }
        }
        return Optional.empty();
    }

    private Optional<Map<String, Object>> tryAutoAssign(LocalDate date, String departmentId, String shift,
                                                        java.util.function.Consumer<String> assignAction) {
        return tryAutoAssign(schedulingAiService.loadSchedulingContext(date), departmentId, shift, assignAction);
    }

    private void assignStaffToOpenSchedule(Schedule schedule, String staffId) {
        Staff staffMember = staffRepository.findById(staffId)
            .orElseThrow(() -> new IllegalArgumentException("Staff member not found"));
        LocalDate targetDate = schedule.getDate() != null
            ? schedule.getDate().toLocalDate()
            : LocalDate.now();
        validateNoDoubleBooking(staffMember.getId(), targetDate, schedule.getId());
        validateNotOnLeave(staffMember.getId(), targetDate);
        schedule.setStaffId(staffMember.getId());
        if (schedule.getDepartmentId() == null || schedule.getDepartmentId().isBlank()) {
            schedule.setDepartmentId(staffMember.getDepartmentId());
        }
        schedule.setSwapRequested(false);
        schedule.setStatus("scheduled");
        scheduleRepository.save(schedule);
    }

    private int computeCoverage(List<Schedule> schedules, List<Department> departments,
                                List<String> shiftTypes, int minStaffPerShift,
                                Map<String, Double> multipliers) {
        int scheduled = (int) schedules.stream()
            .filter(s -> s.getStaffId() != null && !s.getStaffId().isBlank())
            .count();
        int targetShifts = 0;
        for (Department department : departments) {
            double mult = multipliers.getOrDefault(department.getId(), 1.0);
            int effectiveMin = (int) Math.ceil(minStaffPerShift * mult);
            targetShifts += effectiveMin * shiftTypes.size();
        }
        return targetShifts > 0 ? Math.min(100, (int) Math.round((scheduled * 100.0) / targetShifts)) : 0;
    }

    private int countOpenShiftGaps(LocalDate date, List<Schedule> schedules, List<Department> departments,
                                   List<String> shiftTypes, int minStaffPerShift,
                                   Map<String, Double> multipliers,
                                   List<Map<String, Object>> forecastByDepartment) {
        return buildDepartmentOpenShiftSlots(
            date, schedules, departments, shiftTypes, minStaffPerShift, multipliers, forecastByDepartment
        ).size();
    }

    private int asInt(Object value, int fallback) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return value != null ? Integer.parseInt(String.valueOf(value)) : fallback;
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private List<Map<String, Object>> buildDepartmentOpenShiftSlots(
            LocalDate date,
            List<Schedule> schedules,
            List<Department> departments,
            List<String> shiftTypes,
            int minStaffPerShift,
            Map<String, Double> multipliers,
            List<Map<String, Object>> forecastByDepartment) {
        Map<String, Map<String, Object>> forecastById = forecastByDepartment.stream()
            .collect(Collectors.toMap(f -> String.valueOf(f.get("departmentId")), f -> f, (a, b) -> a));
        Map<String, Integer> filledByDeptShift = new HashMap<>();
        Map<String, Integer> vacantByDeptShift = new HashMap<>();

        for (Schedule schedule : schedules) {
            String deptId = resolveScheduleDepartmentId(schedule);
            if (deptId == null || schedule.getShift() == null) continue;
            String key = deptShiftKey(deptId, schedule.getShift());
            if (schedule.getStaffId() == null || schedule.getStaffId().isBlank() || "open".equals(schedule.getStatus())) {
                vacantByDeptShift.merge(key, 1, Integer::sum);
            } else {
                filledByDeptShift.merge(key, 1, Integer::sum);
            }
        }

        List<Map<String, Object>> openShiftSlots = new ArrayList<>();
        int slotIndex = 1;
        for (Department department : departments) {
            double mult = multipliers.getOrDefault(department.getId(), 1.0);
            int deptMin = (int) Math.ceil(minStaffPerShift * mult);
            Map<String, Object> forecast = forecastById.get(department.getId());
            boolean surge = mult > 1.0;
            for (String shiftType : shiftTypes) {
                String key = deptShiftKey(department.getId(), shiftType);
                int filled = filledByDeptShift.getOrDefault(key, 0);
                int vacant = vacantByDeptShift.getOrDefault(key, 0);
                int gap = Math.max(0, deptMin - filled - vacant);
                for (int i = 0; i < gap; i++) {
                    Map<String, Object> slot = new LinkedHashMap<>();
                    slot.put("id", "open-" + department.getId() + "-" + shiftType + "-" + slotIndex++);
                    slot.put("departmentId", department.getId());
                    slot.put("department", department.getName());
                    slot.put("shift", shiftType);
                    slot.put("status", "unfilled");
                    slot.put("date", date.toString());
                    slot.put("required", deptMin);
                    slot.put("baseRequired", minStaffPerShift);
                    slot.put("filled", filled);
                    slot.put("vacant", vacant);
                    slot.put("surge", surge);
                    slot.put("forecastMultiplier", mult);
                    if (forecast != null) {
                        slot.put("forecastReason", forecast.get("reason"));
                    }
                    openShiftSlots.add(slot);
                }
            }
        }
        return openShiftSlots;
    }

    private List<Map<String, Object>> buildDepartmentRecommendations(
            LocalDate date,
            List<Schedule> schedules,
            List<Department> departments,
            List<String> shiftTypes,
            int minStaffPerShift,
            Map<String, Double> multipliers,
            int scheduled,
            int targetShifts,
            int openShifts,
            List<Map<String, Object>> forecastByDepartment) {
        List<Map<String, Object>> recommendations = new ArrayList<>();

        if (scheduled == 0 && schedules.stream().noneMatch(s -> "open".equals(s.getStatus()))) {
            Map<String, Object> overall = new LinkedHashMap<>();
            overall.put("department", "All departments");
            overall.put("action", "Fill " + openShifts + " open shifts");
            overall.put("priority", "high");
            overall.put("detail", scheduled + " of " + targetShifts + " department shift targets assigned for " + date);
            recommendations.add(overall);
        }

        long vacantFromSwaps = schedules.stream()
            .filter(s -> s.getStaffId() == null || s.getStaffId().isBlank() || "open".equals(s.getStatus()))
            .count();
        if (vacantFromSwaps > 0) {
            Map<String, Object> swapOpen = new LinkedHashMap<>();
            swapOpen.put("department", "Open shifts");
            swapOpen.put("action", "Assign " + vacantFromSwaps + " replacement(s)");
            swapOpen.put("priority", "high");
            swapOpen.put("detail", "Vacated after approved swap — assign staff in the schedule table");
            recommendations.add(swapOpen);
        }

        for (Map<String, Object> forecast : forecastByDepartment) {
            if (Boolean.TRUE.equals(forecast.get("surge"))) {
                Map<String, Object> surge = new LinkedHashMap<>();
                surge.put("department", String.valueOf(forecast.get("department")));
                surge.put("action", "Raise staffing target");
                surge.put("priority", "high");
                surge.put("detail", String.valueOf(forecast.get("reason")));
                surge.put("ai", true);
                recommendations.add(surge);
            }
        }

        if (openShifts > 0 && scheduled > 0) {
            Map<String, Object> gap = new LinkedHashMap<>();
            gap.put("department", "Coverage gap");
            gap.put("action", "Fill " + openShifts + " department slot(s)");
            gap.put("priority", "high");
            gap.put("detail", scheduled + " of " + targetShifts + " forecast-adjusted targets met");
            recommendations.add(gap);
        }

        for (Department department : departments) {
            double mult = multipliers.getOrDefault(department.getId(), 1.0);
            int deptMin = (int) Math.ceil(minStaffPerShift * mult);
            int deptFilled = 0;
            int deptGap = 0;
            for (String shiftType : shiftTypes) {
                int filled = (int) schedules.stream()
                    .filter(s -> shiftType.equals(s.getShift()))
                    .filter(s -> department.getId().equals(resolveScheduleDepartmentId(s)))
                    .filter(s -> s.getStaffId() != null && !s.getStaffId().isBlank())
                    .count();
                int vacant = (int) schedules.stream()
                    .filter(s -> shiftType.equals(s.getShift()))
                    .filter(s -> department.getId().equals(resolveScheduleDepartmentId(s)))
                    .filter(s -> s.getStaffId() == null || s.getStaffId().isBlank() || "open".equals(s.getStatus()))
                    .count();
                deptFilled += filled;
                deptGap += Math.max(0, deptMin - filled - vacant);
            }
            Map<String, Object> rec = new LinkedHashMap<>();
            rec.put("department", department.getName());
            if (deptGap > 0) {
                rec.put("action", "Fill " + deptGap + " slot(s)");
                rec.put("priority", "high");
                String minLabel = mult > 1.0 ? deptMin + " (forecast-adjusted)" : String.valueOf(deptMin);
                rec.put("detail", deptFilled + " assigned — need " + minLabel + " per shift type (" +
                    String.join(", ", shiftTypes) + ")");
            } else if (deptFilled == 0) {
                rec.put("action", "Assign staff");
                rec.put("priority", "high");
                rec.put("detail", "No coverage scheduled for this department");
            } else {
                rec.put("action", "Optimal");
                rec.put("priority", "low");
                rec.put("detail", deptFilled + " staff scheduled across shift types");
            }
            recommendations.add(rec);
        }

        return recommendations;
    }

    private String deptShiftKey(String departmentId, String shift) {
        return departmentId + "|" + shift;
    }

    private String resolveScheduleDepartmentId(Schedule schedule) {
        if (schedule.getDepartmentId() != null && !schedule.getDepartmentId().isBlank()) {
            return schedule.getDepartmentId();
        }
        if (schedule.getStaff() != null && schedule.getStaff().getDepartmentId() != null) {
            return schedule.getStaff().getDepartmentId();
        }
        if (schedule.getDepartment() != null) {
            return schedule.getDepartment().getId();
        }
        return null;
    }

    private String resolveScheduleDepartmentName(Schedule schedule) {
        if (schedule.getStaff() != null && schedule.getStaff().getDepartment() != null) {
            return schedule.getStaff().getDepartment().getName();
        }
        if (schedule.getDepartment() != null) {
            return schedule.getDepartment().getName();
        }
        if (schedule.getDepartmentId() != null) {
            return departmentRepository.findById(schedule.getDepartmentId())
                .map(Department::getName)
                .orElse("");
        }
        return "";
    }

    public List<Map<String, Object>> detectConflicts(LocalDate date) {
        return detectConflicts(date, loadDaySchedules(date));
    }

    public List<Map<String, Object>> detectConflicts(LocalDate date, List<Schedule> schedules) {
        List<Map<String, Object>> conflicts = new ArrayList<>();
        Set<String> staffOnLeave = staffIdsOnApprovedLeave(date);

        schedules.stream()
            .filter(s -> s.getStaffId() != null && !s.getStaffId().isBlank())
            .collect(Collectors.groupingBy(Schedule::getStaffId, Collectors.counting()))
            .forEach((staffId, count) -> {
                if (count > 1) {
                    schedules.stream()
                        .filter(s -> staffId.equals(s.getStaffId()))
                        .map(Schedule::getStaff)
                        .filter(Objects::nonNull)
                        .findFirst()
                        .ifPresent(s -> conflicts.add(Map.of(
                            "type", "double-booking",
                            "staff", s.getName(),
                            "detail", count + " shifts on same day"
                        )));
                }
            });

        for (Schedule schedule : schedules) {
            Staff staff = schedule.getStaff();
            if (staff == null) continue;
            if (staffOnLeave.contains(staff.getId())) {
                conflicts.add(Map.of(
                    "type", "leave-overlap",
                    "staff", staff.getName(),
                    "detail", "Assigned to " + schedule.getShift() + " shift while on leave"
                ));
            }
        }

        boolean respectPreferences = settingsService.getBoolean("scheduling", "respectPreferences", true);
        if (respectPreferences) {
            Map<String, Map<String, Object>> preferences = settingsService.getStaffSchedulingPreferences();
            for (Schedule schedule : schedules) {
                Map<String, Object> pref = preferences.get(schedule.getStaffId());
                if (pref == null) continue;
                List<String> avoidDates = stringList(pref.get("avoidDates"));
                if (avoidDates.contains(date.toString())) {
                    String name = schedule.getStaff() != null ? schedule.getStaff().getName() : schedule.getStaffId();
                    conflicts.add(Map.of(
                        "type", "preference",
                        "staff", name,
                        "detail", "Staff marked " + date + " as unavailable"
                    ));
                }
            }
        }

        if (settingsService.getBoolean("scheduling", "skillMixRequired", true)) {
            Set<String> staffIds = schedules.stream()
                .map(Schedule::getStaffId)
                .filter(id -> id != null && !id.isBlank())
                .collect(Collectors.toSet());
            Map<String, List<com.hwo.entity.Certification>> certsByStaff =
                schedulingAiService.certificationsForStaffIds(staffIds);

            for (Schedule schedule : schedules) {
                if (schedule.getStaffId() == null || schedule.getStaffId().isBlank()) continue;
                String deptName = resolveScheduleDepartmentName(schedule);
                List<String> gaps = schedulingAiService.staffSkillGaps(
                    schedule.getStaffId(), deptName, schedule.getShift(), certsByStaff);
                if (!gaps.isEmpty()) {
                    String name = schedule.getStaff() != null ? schedule.getStaff().getName() : schedule.getStaffId();
                    Map<String, Object> conflict = new LinkedHashMap<>();
                    conflict.put("type", "skill-mix");
                    conflict.put("staff", name);
                    conflict.put("detail", "Missing certifications for " + deptName + " "
                        + schedule.getShift() + ": " + String.join(", ", gaps));
                    conflicts.add(conflict);
                }
            }
        }

        return conflicts;
    }

    // --- Leave ---

    public List<Map<String, Object>> listLeave(Integer limit) {
        List<LeaveRequest> rows = limit != null && limit > 0
            ? leaveRequestRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, limit))
            : leaveRequestRepository.findAllByOrderByCreatedAtDesc();
        return rows.stream()
            .map(this::toLeaveDto)
            .collect(Collectors.toList());
    }

    public Map<String, Object> createLeave(Map<String, Object> body) {
        String staffId = stringValue(body.get("staffId"));
        String type = stringValue(body.get("type"));
        if (staffId == null || type == null || body.get("startDate") == null || body.get("endDate") == null) {
            throw new IllegalArgumentException("staffId, startDate, endDate, and type are required");
        }
        staffRepository.findById(staffId)
            .orElseThrow(() -> new IllegalArgumentException("Staff member not found"));

        LocalDateTime startDate = parseDateTime(body.get("startDate"));
        LocalDateTime endDate = parseDateTime(body.get("endDate"));
        if (endDate.isBefore(startDate)) {
            throw new IllegalArgumentException("endDate must be on or after startDate");
        }

        LeaveRequest leave = new LeaveRequest();
        leave.setId(UUID.randomUUID().toString());
        leave.setStaffId(staffId);
        leave.setStartDate(startDate);
        leave.setEndDate(endDate);
        leave.setType(type);
        leave.setStatus(stringValue(body.get("status"), "pending"));
        leave.setCreatedAt(LocalDateTime.now());
        return toLeaveDto(leaveRequestRepository.save(leave));
    }

    public Map<String, Object> updateLeave(String id, Map<String, Object> body) {
        LeaveRequest leave = leaveRequestRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Leave request not found"));

        if (body.containsKey("staffId")) {
            String staffId = stringValue(body.get("staffId"));
            staffRepository.findById(staffId)
                .orElseThrow(() -> new IllegalArgumentException("Staff member not found"));
            leave.setStaffId(staffId);
        }
        if (body.containsKey("type")) {
            leave.setType(stringValue(body.get("type")));
        }
        if (body.containsKey("status")) {
            String status = stringValue(body.get("status"));
            if (status != null && !List.of("pending", "approved", "rejected").contains(status)) {
                throw new IllegalArgumentException("status must be pending, approved, or rejected");
            }
            leave.setStatus(status);
        }
        if (body.containsKey("startDate")) {
            leave.setStartDate(parseDateTime(body.get("startDate")));
        }
        if (body.containsKey("endDate")) {
            leave.setEndDate(parseDateTime(body.get("endDate")));
        }
        if (leave.getEndDate().isBefore(leave.getStartDate())) {
            throw new IllegalArgumentException("endDate must be on or after startDate");
        }
        return toLeaveDto(leaveRequestRepository.save(leave));
    }

    public void deleteLeave(String id) {
        if (!leaveRequestRepository.existsById(id)) {
            throw new IllegalArgumentException("Leave request not found");
        }
        leaveRequestRepository.deleteById(id);
    }

    // --- On-call ---

    public List<Map<String, Object>> listOnCall(LocalDate date) {
        return onCallScheduleRepository.findByDateBetween(dayStart(date), dayEnd(date)).stream()
            .map(this::toOnCallDto)
            .collect(Collectors.toList());
    }

    public Map<String, Object> createOnCall(Map<String, Object> body) {
        String staffId = stringValue(body.get("staffId"));
        String startTime = stringValue(body.get("startTime"));
        String endTime = stringValue(body.get("endTime"));
        if (staffId == null || startTime == null || endTime == null || body.get("date") == null) {
            throw new IllegalArgumentException("staffId, date, startTime, and endTime are required");
        }
        staffRepository.findById(staffId)
            .orElseThrow(() -> new IllegalArgumentException("Staff member not found"));

        OnCallSchedule onCall = new OnCallSchedule();
        onCall.setId(UUID.randomUUID().toString());
        onCall.setStaffId(staffId);
        onCall.setDate(parseDateTime(body.get("date")));
        onCall.setStartTime(startTime);
        onCall.setEndTime(endTime);
        onCall.setStatus(stringValue(body.get("status"), "scheduled"));
        return toOnCallDto(onCallScheduleRepository.save(onCall));
    }

    public Map<String, Object> updateOnCall(String id, Map<String, Object> body) {
        OnCallSchedule onCall = onCallScheduleRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("On-call assignment not found"));

        if (body.containsKey("staffId")) {
            String staffId = stringValue(body.get("staffId"));
            staffRepository.findById(staffId)
                .orElseThrow(() -> new IllegalArgumentException("Staff member not found"));
            onCall.setStaffId(staffId);
        }
        if (body.containsKey("date")) {
            onCall.setDate(parseDateTime(body.get("date")));
        }
        if (body.containsKey("startTime")) {
            onCall.setStartTime(stringValue(body.get("startTime")));
        }
        if (body.containsKey("endTime")) {
            onCall.setEndTime(stringValue(body.get("endTime")));
        }
        if (body.containsKey("status")) {
            onCall.setStatus(stringValue(body.get("status")));
        }
        return toOnCallDto(onCallScheduleRepository.save(onCall));
    }

    public void deleteOnCall(String id) {
        if (!onCallScheduleRepository.existsById(id)) {
            throw new IllegalArgumentException("On-call assignment not found");
        }
        onCallScheduleRepository.deleteById(id);
    }

    // --- Helpers ---

    private void validateShiftType(String shift) {
        List<String> shiftTypes = settingsService.getShiftTypes();
        if (!shiftTypes.isEmpty() && !shiftTypes.contains(shift)) {
            throw new IllegalArgumentException("Invalid shift type. Allowed: " + String.join(", ", shiftTypes));
        }
    }

    private void validateNoDoubleBooking(String staffId, LocalDate date, String excludeId) {
        List<Schedule> existing = scheduleRepository.findByStaffIdAndDateBetween(
            staffId, dayStart(date), dayEnd(date));
        boolean conflict = existing.stream()
            .anyMatch(s -> excludeId == null || !excludeId.equals(s.getId()));
        if (conflict) {
            throw new IllegalArgumentException("Staff member already has a shift on this date");
        }
    }

    private void validateNotOnLeave(String staffId, LocalDate date) {
        if (isOnLeave(staffId, date)) {
            throw new IllegalArgumentException("Staff member is on approved leave for this date");
        }
    }

    private Set<String> staffIdsOnApprovedLeave(LocalDate date) {
        return leaveRequestRepository.findApprovedOverlapping(dayStart(date), dayEnd(date)).stream()
            .map(LeaveRequest::getStaffId)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
    }

    private boolean isOnLeave(String staffId, LocalDate date) {
        return leaveRequestRepository.findApprovedOverlapping(dayStart(date), dayEnd(date)).stream()
            .anyMatch(l -> staffId.equals(l.getStaffId()));
    }

    private Map<String, Object> toScheduleDto(Schedule s) {
        boolean isOpen = "open".equals(s.getStatus())
            || s.getStaffId() == null
            || s.getStaffId().isBlank();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", s.getId());
        m.put("staffId", s.getStaffId());
        m.put("departmentId", resolveScheduleDepartmentId(s));
        m.put("staff", isOpen ? "" : (s.getStaff() != null ? s.getStaff().getName() : ""));
        m.put("role", isOpen ? "" : (s.getStaff() != null ? s.getStaff().getRole() : ""));
        m.put("shift", s.getShift());
        m.put("dept", resolveScheduleDepartmentName(s));
        m.put("date", s.getDate() != null ? s.getDate().toLocalDate().toString() : "");
        m.put("status", isOpen ? "open" : (s.getStatus() != null ? s.getStatus() : "scheduled"));
        m.put("swapRequested", s.isSwapRequested());
        m.put("needsAssignment", isOpen);
        m.put("canSwap", !isOpen && !"published".equals(s.getStatus()) && !s.isSwapRequested());
        return m;
    }

    private Map<String, Object> toLeaveDto(LeaveRequest l) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", l.getId());
        m.put("staffId", l.getStaffId());
        Map<String, Object> staff = new LinkedHashMap<>();
        if (l.getStaff() != null) {
            staff.put("id", l.getStaff().getId());
            staff.put("name", l.getStaff().getName());
        } else {
            staff.put("name", "");
        }
        m.put("staff", staff);
        m.put("startDate", l.getStartDate() != null ? l.getStartDate().toLocalDate().toString() : "");
        m.put("endDate", l.getEndDate() != null ? l.getEndDate().toLocalDate().toString() : "");
        m.put("type", l.getType());
        m.put("status", l.getStatus());
        m.put("createdAt", l.getCreatedAt() != null ? l.getCreatedAt().toString() : "");
        return m;
    }

    private Map<String, Object> toOnCallDto(OnCallSchedule o) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", o.getId());
        m.put("staffId", o.getStaffId());
        Map<String, Object> staff = new LinkedHashMap<>();
        if (o.getStaff() != null) {
            staff.put("id", o.getStaff().getId());
            staff.put("name", o.getStaff().getName());
        } else {
            staff.put("name", "");
        }
        m.put("staff", staff);
        m.put("date", o.getDate() != null ? o.getDate().toLocalDate().toString() : "");
        m.put("startTime", o.getStartTime());
        m.put("endTime", o.getEndTime());
        m.put("status", o.getStatus());
        return m;
    }

    private String stringValue(Object value) {
        if (value == null) return null;
        String s = String.valueOf(value).trim();
        return s.isEmpty() ? null : s;
    }

    private String stringValue(Object value, String fallback) {
        String s = stringValue(value);
        return s != null ? s : fallback;
    }

    @SuppressWarnings("unchecked")
    private List<String> stringList(Object value) {
        if (value instanceof List<?> list) {
            return list.stream().map(String::valueOf).collect(Collectors.toList());
        }
        return List.of();
    }
}
