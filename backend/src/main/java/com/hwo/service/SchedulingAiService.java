package com.hwo.service;

import com.hwo.entity.Certification;
import com.hwo.entity.Department;
import com.hwo.entity.LeaveRequest;
import com.hwo.entity.Schedule;
import com.hwo.entity.Staff;
import com.hwo.entity.WellnessRecord;
import com.hwo.entity.WorkloadRecord;
import com.hwo.repository.CertificationRepository;
import com.hwo.repository.DepartmentRepository;
import com.hwo.repository.LeaveRequestRepository;
import com.hwo.repository.ScheduleRepository;
import com.hwo.repository.StaffRepository;
import com.hwo.repository.WellnessRecordRepository;
import com.hwo.repository.WorkloadRecordRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class SchedulingAiService {

    private final StaffRepository staffRepository;
    private final ScheduleRepository scheduleRepository;
    private final LeaveRequestRepository leaveRequestRepository;
    private final DepartmentRepository departmentRepository;
    private final WellnessRecordRepository wellnessRecordRepository;
    private final WorkloadRecordRepository workloadRecordRepository;
    private final CertificationRepository certificationRepository;
    private final SettingsService settingsService;
    private final PredictionService predictionService;
    private final AiServiceClient aiServiceClient;

    public SchedulingAiService(StaffRepository staffRepository,
                               ScheduleRepository scheduleRepository,
                               LeaveRequestRepository leaveRequestRepository,
                               DepartmentRepository departmentRepository,
                               WellnessRecordRepository wellnessRecordRepository,
                               WorkloadRecordRepository workloadRecordRepository,
                               CertificationRepository certificationRepository,
                               SettingsService settingsService,
                               PredictionService predictionService,
                               AiServiceClient aiServiceClient) {
        this.staffRepository = staffRepository;
        this.scheduleRepository = scheduleRepository;
        this.leaveRequestRepository = leaveRequestRepository;
        this.departmentRepository = departmentRepository;
        this.wellnessRecordRepository = wellnessRecordRepository;
        this.workloadRecordRepository = workloadRecordRepository;
        this.certificationRepository = certificationRepository;
        this.settingsService = settingsService;
        this.predictionService = predictionService;
        this.aiServiceClient = aiServiceClient;
    }

    public List<Map<String, Object>> suggestAssignees(LocalDate date, String departmentId, String shift,
                                                       String excludeStaffId, Integer limit) {
        return suggestAssignees(loadSchedulingContext(date), departmentId, shift, excludeStaffId, limit,
            false, false);
    }

    /**
     * AI-ranked assignee suggestions using preloaded scheduling context (for batch auto-schedule).
     */
    public List<Map<String, Object>> suggestAssignees(SchedulingContext ctx, String departmentId, String shift,
                                                       String excludeStaffId, Integer limit,
                                                       boolean crossDepartment, boolean relaxCertRequirements) {
        if (shift == null || shift.isBlank()) {
            throw new IllegalArgumentException("shift is required");
        }
        int max = limit != null && limit > 0 ? Math.min(limit, 50) : 8;
        String effectiveDeptId = crossDepartment ? null : departmentId;
        String departmentName = resolveDepartmentName(effectiveDeptId != null ? effectiveDeptId : departmentId);
        List<String> requiredCerts = requiredCertsFor(departmentName, shift);

        List<Staff> candidates = ctx.allStaff().stream()
            .filter(s -> effectiveDeptId == null || effectiveDeptId.isBlank() || effectiveDeptId.equals(s.getDepartmentId()))
            .filter(s -> excludeStaffId == null || !excludeStaffId.equals(s.getId()))
            .collect(Collectors.toList());

        boolean skillMixRequired = relaxCertRequirements ? false : ctx.skillMixRequired();

        List<ScoredStaff> scored = new ArrayList<>();
        for (Staff staff : candidates) {
            ScoreResult result = scoreStaff(
                staff, ctx.date(), shift, effectiveDeptId, departmentName, requiredCerts,
                ctx.daySchedules(), ctx.weekSchedules(), ctx.preferences(), ctx.wellnessByStaff(),
                ctx.certsByStaff(), ctx.staffOnLeave(), ctx.respectPreferences(), skillMixRequired,
                ctx.maxHoursPerWeek(), ctx.restBetweenShifts(), ctx.weekHoursByStaff(), ctx.bookedStaffIds(),
                ctx.previousDayShiftByStaff());
            if (!result.eligible()) continue;
            scored.add(new ScoredStaff(staff, result));
        }

        boolean aiRanked = applyAiRanking(scored, departmentName, shift);
        scored.sort(Comparator.comparingInt((ScoredStaff s) -> s.result().score()).reversed());
        return scored.stream().limit(max).map(s -> toSuggestionDto(s, aiRanked)).collect(Collectors.toList());
    }

    public SchedulingContext loadSchedulingContext(LocalDate date) {
        List<Schedule> daySchedules = new ArrayList<>(
            scheduleRepository.findByDateBetween(dayStart(date), dayEnd(date)));
        List<Schedule> weekSchedules = scheduleRepository.findByDateBetween(
            date.minusDays(6).atStartOfDay(), date.plusDays(1).atStartOfDay());
        Set<String> staffOnLeave = loadStaffOnLeave(date);
        Map<String, Double> weekHoursByStaff = computeWeekHoursByStaff(date, weekSchedules);
        Map<String, String> previousDayShiftByStaff = computePreviousDayShifts(date, weekSchedules);
        Set<String> bookedStaffIds = daySchedules.stream()
            .map(Schedule::getStaffId)
            .filter(id -> id != null && !id.isBlank())
            .collect(Collectors.toCollection(HashSet::new));
        return new SchedulingContext(
            date,
            daySchedules,
            weekSchedules,
            settingsService.getStaffSchedulingPreferences(),
            loadLatestWellness(),
            loadCertificationsByStaff(),
            staffOnLeave,
            staffRepository.findAll(),
            settingsService.getBoolean("scheduling", "respectPreferences", true),
            settingsService.getBoolean("scheduling", "skillMixRequired", true),
            settingsService.getInt("scheduling", "maxHoursPerWeek"),
            settingsService.getInt("scheduling", "restBetweenShifts"),
            weekHoursByStaff,
            bookedStaffIds,
            previousDayShiftByStaff
        );
    }

    private Map<String, String> computePreviousDayShifts(LocalDate date, List<Schedule> weekSchedules) {
        LocalDate prev = date.minusDays(1);
        Map<String, String> shifts = new HashMap<>();
        for (Schedule schedule : weekSchedules) {
            if (schedule.getStaffId() == null || schedule.getDate() == null || schedule.getShift() == null) {
                continue;
            }
            if (schedule.getDate().toLocalDate().equals(prev)) {
                shifts.putIfAbsent(schedule.getStaffId(), schedule.getShift());
            }
        }
        return shifts;
    }

    public void registerAssignment(SchedulingContext ctx, Schedule schedule) {
        ctx.daySchedules().add(schedule);
        ctx.weekSchedules().add(schedule);
        if (schedule.getStaffId() != null && !schedule.getStaffId().isBlank()) {
            ctx.bookedStaffIds().add(schedule.getStaffId());
            ctx.weekHoursByStaff().merge(schedule.getStaffId(), 8.0, Double::sum);
        }
    }

    private Map<String, Double> computeWeekHoursByStaff(LocalDate date, List<Schedule> weekSchedules) {
        LocalDate weekStart = date.minusDays(date.getDayOfWeek().getValue() - 1L);
        LocalDate weekEnd = weekStart.plusDays(6);
        Map<String, Double> hours = new HashMap<>();
        for (Schedule schedule : weekSchedules) {
            if (schedule.getStaffId() == null || schedule.getStaffId().isBlank() || schedule.getDate() == null) {
                continue;
            }
            LocalDate scheduleDate = schedule.getDate().toLocalDate();
            if (scheduleDate.isBefore(weekStart) || scheduleDate.isAfter(weekEnd)) {
                continue;
            }
            hours.merge(schedule.getStaffId(), 8.0, Double::sum);
        }
        return hours;
    }

    public List<Map<String, Object>> suggestSwapPartners(String scheduleId) {
        Schedule schedule = scheduleRepository.findById(scheduleId)
            .orElseThrow(() -> new IllegalArgumentException("Schedule not found"));
        LocalDate date = schedule.getDate() != null ? schedule.getDate().toLocalDate() : LocalDate.now();
        String departmentId = resolveDepartmentId(schedule);
        String shift = schedule.getShift();
        String excludeStaffId = schedule.getStaffId();
        return suggestAssignees(date, departmentId, shift, excludeStaffId, 6);
    }

    public Map<String, Object> departmentForecasts(LocalDate date) {
        List<Department> departments = departmentRepository.findAll().stream()
            .filter(Department::isActive)
            .sorted(Comparator.comparing(Department::getName, String.CASE_INSENSITIVE_ORDER))
            .collect(Collectors.toList());
        double globalBoost = globalForecastBoost();
        int baseMin = settingsService.getInt("scheduling", "minStaffPerShift");
        Map<String, List<Certification>> certsByStaff = loadCertificationsByStaff();

        List<Map<String, Object>> forecasts = new ArrayList<>();
        for (Department department : departments) {
            forecasts.add(buildDepartmentForecast(department, date, globalBoost, baseMin, certsByStaff));
        }

        boolean anyMl = forecasts.stream()
            .anyMatch(f -> isMlForecastSource(String.valueOf(f.get("forecastSource"))));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("date", date.toString());
        result.put("globalForecastBoost", globalBoost);
        result.put("forecasts", forecasts);
        result.put("aiModelActive", predictionService.isSchedulingAiActive());
        result.put("modelHealth", predictionService.getModelHealth());
        return result;
    }

    public boolean isSchedulingAiActive() {
        return predictionService.isSchedulingAiActive();
    }

    public Map<String, Object> schedulingModelHealth() {
        return predictionService.getModelHealth();
    }

    public Map<String, Double> forecastMultipliers(LocalDate date) {
        Map<String, Double> multipliers = new LinkedHashMap<>();
        double globalBoost = globalForecastBoost();
        for (Department department : departmentRepository.findAll()) {
            if (!department.isActive()) continue;
            multipliers.put(department.getId(), computeMultiplier(department, date, globalBoost));
        }
        return multipliers;
    }

    /** Fast staffing multipliers for batch auto-schedule (skips AI predict-point calls). */
    public Map<String, Double> forecastMultipliersHeuristic(LocalDate date) {
        Map<String, Double> trends = departmentTrends(date);
        Map<String, Double> multipliers = new LinkedHashMap<>();
        for (Department department : departmentRepository.findAll()) {
            if (!department.isActive()) continue;
            double loadFactor = department.getWorkload() / 100.0;
            double trend = trends.getOrDefault(department.getId(), 0.0);
            double score = loadFactor + trend;
            double multiplier = score >= 0.95 ? 1.75 : score >= 0.8 ? 1.5 : score >= 0.65 ? 1.25 : 1.0;
            multipliers.put(department.getId(), multiplier);
        }
        return multipliers;
    }

    public int effectiveMinStaff(String departmentId, int baseMin, LocalDate date) {
        Department department = departmentRepository.findById(departmentId).orElse(null);
        if (department == null) return baseMin;
        double multiplier = computeMultiplier(department, date, globalForecastBoost());
        return (int) Math.ceil(baseMin * multiplier);
    }

    public Map<String, Object> whatIf(LocalDate date, List<Map<String, Object>> additions) {
        int minStaffPerShift = settingsService.getInt("scheduling", "minStaffPerShift");
        List<String> shiftTypes = settingsService.getShiftTypes();
        if (shiftTypes.isEmpty()) shiftTypes = List.of("Day", "Evening", "Night");

        List<Department> departments = departmentRepository.findAll().stream()
            .filter(Department::isActive).collect(Collectors.toList());
        List<Schedule> schedules = scheduleRepository.findDaySchedulesWithDetails(dayStart(date), dayEnd(date));
        Map<String, Double> multipliers = forecastMultipliers(date);
        List<Map<String, Object>> forecastByDepartment = departmentForecastsHeuristic(date, multipliers);
        Map<String, Map<String, Object>> forecastById = forecastByDepartment.stream()
            .collect(Collectors.toMap(f -> String.valueOf(f.get("departmentId")), f -> f, (a, b) -> a));

        int targetShifts = 0;
        for (Department d : departments) {
            int eff = (int) Math.ceil(minStaffPerShift * multipliers.getOrDefault(d.getId(), 1.0));
            targetShifts += eff * shiftTypes.size();
        }

        int currentScheduled = (int) schedules.stream()
            .filter(s -> s.getStaffId() != null && !s.getStaffId().isBlank())
            .count();

        int hypotheticalAdds = 0;
        List<Map<String, Object>> scenarioDetails = new ArrayList<>();
        if (additions != null) {
            for (Map<String, Object> addition : additions) {
                String departmentId = stringValue(addition.get("departmentId"));
                String shift = stringValue(addition.get("shift"));
                int count = Math.max(0, asInt(addition.get("count"), 1));
                if (departmentId == null || shift == null || count <= 0) continue;

                Department department = departments.stream()
                    .filter(d -> d.getId().equals(departmentId))
                    .findFirst()
                    .orElse(null);
                if (department == null) continue;

                double mult = multipliers.getOrDefault(departmentId, 1.0);
                int requiredMin = (int) Math.ceil(minStaffPerShift * mult);
                int filled = countDeptShiftFilled(schedules, departmentId, shift);
                int vacant = countDeptShiftVacant(schedules, departmentId, shift);
                int gapBefore = Math.max(0, requiredMin - filled - vacant);
                int filledAfter = filled + count;
                int gapAfter = Math.max(0, requiredMin - filledAfter - vacant);

                hypotheticalAdds += count;

                Map<String, Object> forecast = forecastById.get(departmentId);
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("departmentId", departmentId);
                row.put("department", department.getName());
                row.put("shift", shift);
                row.put("count", count);
                row.put("requiredMin", requiredMin);
                row.put("baseMinStaff", minStaffPerShift);
                row.put("forecastMultiplier", mult);
                row.put("filledBefore", filled);
                row.put("filledAfter", filledAfter);
                row.put("vacantSlots", vacant);
                row.put("gapBefore", gapBefore);
                row.put("gapAfter", gapAfter);
                row.put("closesGap", gapAfter == 0 && gapBefore > 0);
                row.put("meetsTarget", filledAfter >= requiredMin);
                if (forecast != null) {
                    row.put("predictedLoad", forecast.get("predictedLoad"));
                    row.put("forecastReason", forecast.get("reason"));
                    row.put("surge", forecast.get("surge"));
                }
                scenarioDetails.add(row);
            }
        }

        int projectedScheduled = currentScheduled + hypotheticalAdds;
        int currentCoverage = targetShifts > 0
            ? Math.min(100, (int) Math.round((currentScheduled * 100.0) / targetShifts)) : 0;
        int projectedCoverage = targetShifts > 0
            ? Math.min(100, (int) Math.round((projectedScheduled * 100.0) / targetShifts)) : 0;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("date", date.toString());
        result.put("currentScheduled", currentScheduled);
        result.put("projectedScheduled", projectedScheduled);
        result.put("targetShifts", targetShifts);
        result.put("currentCoverage", currentCoverage);
        result.put("projectedCoverage", projectedCoverage);
        result.put("coverageDelta", projectedCoverage - currentCoverage);
        result.put("additions", scenarioDetails);
        result.put("scenarios", scenarioDetails);
        result.put("recommendation", buildWhatIfRecommendation(scenarioDetails, projectedCoverage, currentCoverage));
        result.put("message", buildWhatIfMessage(currentCoverage, projectedCoverage, hypotheticalAdds, scenarioDetails));
        result.put("purpose",
            "Estimate how extra shift assignments affect hospital-wide coverage and department staffing gaps "
                + "before you commit staff, approve overtime, or request agency cover.");
        return result;
    }

    private int countDeptShiftFilled(List<Schedule> schedules, String departmentId, String shift) {
        return (int) schedules.stream()
            .filter(s -> shift.equals(s.getShift()))
            .filter(s -> departmentId.equals(resolveScheduleDepartmentId(s)))
            .filter(s -> s.getStaffId() != null && !s.getStaffId().isBlank())
            .filter(s -> !"open".equals(s.getStatus()))
            .count();
    }

    private int countDeptShiftVacant(List<Schedule> schedules, String departmentId, String shift) {
        return (int) schedules.stream()
            .filter(s -> shift.equals(s.getShift()))
            .filter(s -> departmentId.equals(resolveScheduleDepartmentId(s)))
            .filter(s -> s.getStaffId() == null || s.getStaffId().isBlank() || "open".equals(s.getStatus()))
            .count();
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

    private String buildWhatIfRecommendation(List<Map<String, Object>> scenarios, int projected, int current) {
        if (scenarios.isEmpty()) {
            return "Select a department, shift, and headcount to preview impact.";
        }
        Map<String, Object> primary = scenarios.get(0);
        String dept = String.valueOf(primary.get("department"));
        String shift = String.valueOf(primary.get("shift"));
        int gapAfter = asInt(primary.get("gapAfter"), 0);
        int gapBefore = asInt(primary.get("gapBefore"), 0);
        int count = asInt(primary.get("count"), 0);

        if (Boolean.TRUE.equals(primary.get("closesGap"))) {
            return "Adding " + count + " " + shift + " shift(s) in " + dept + " would close the forecast-adjusted gap for that shift.";
        }
        if (gapAfter > 0 && gapBefore > 0) {
            return "This helps but " + dept + " " + shift + " would still need " + gapAfter + " more assignment(s) to meet the target.";
        }
        if (projected >= 100 && current < 100) {
            return "This scenario would bring hospital-wide coverage to full target — good for surge or high census days.";
        }
        if (projected > current) {
            return "Partial improvement — review open shift slots below and consider auto-schedule or manual assignments.";
        }
        return "Adjust the count or pick a department with open gaps from the forecast panel.";
    }

    private String buildWhatIfMessage(int current, int projected, int adds, List<Map<String, Object>> scenarios) {
        if (adds <= 0 || scenarios.isEmpty()) {
            return "Add hypothetical shifts to preview coverage before changing the live schedule.";
        }
        Map<String, Object> primary = scenarios.get(0);
        return "If you assign " + adds + " extra " + primary.get("shift") + " shift(s) in "
            + primary.get("department") + ", hospital coverage moves from " + current + "% → " + projected + "%.";
    }

    public List<String> requiredCertsFor(String departmentName, String shift) {
        List<String> required = new ArrayList<>();
        Map<String, List<String>> configured = departmentSkillRequirements();
        if (departmentName != null) {
            for (Map.Entry<String, List<String>> entry : configured.entrySet()) {
                if (departmentName.equalsIgnoreCase(entry.getKey())
                    || departmentName.toLowerCase(Locale.ROOT).contains(entry.getKey().toLowerCase(Locale.ROOT))) {
                    required.addAll(entry.getValue());
                }
            }
        }
        Map<String, List<String>> shiftReqs = shiftSkillRequirements();
        List<String> shiftCerts = shiftReqs.getOrDefault(shift, List.of());
        required.addAll(shiftCerts);
        return required.stream().distinct().collect(Collectors.toList());
    }

    public List<String> staffSkillGaps(String staffId, String departmentName, String shift) {
        if (!settingsService.getBoolean("scheduling", "skillMixRequired", true)) {
            return List.of();
        }
        List<String> required = requiredCertsFor(departmentName, shift);
        if (required.isEmpty()) return List.of();
        return missingRequiredCerts(certificationRepository.findByStaffId(staffId), required);
    }

    public List<String> staffSkillGaps(String staffId, String departmentName, String shift,
                                       Map<String, List<Certification>> certsByStaff) {
        if (!settingsService.getBoolean("scheduling", "skillMixRequired", true)) {
            return List.of();
        }
        List<String> required = requiredCertsFor(departmentName, shift);
        if (required.isEmpty()) return List.of();
        return missingRequiredCerts(certsByStaff.getOrDefault(staffId, List.of()), required);
    }

    public Map<String, List<Certification>> certificationsForStaffIds(Collection<String> staffIds) {
        if (staffIds == null || staffIds.isEmpty()) {
            return Map.of();
        }
        Map<String, List<Certification>> map = new HashMap<>();
        for (Certification cert : certificationRepository.findByStaffIdIn(staffIds)) {
            if (cert.getStaffId() == null) continue;
            map.computeIfAbsent(cert.getStaffId(), ignored -> new ArrayList<>()).add(cert);
        }
        return map;
    }

    /** Fast department forecast rows for schedule summary (no ML predict-point calls). */
    public List<Map<String, Object>> departmentForecastsHeuristic(LocalDate date, Map<String, Double> multipliers) {
        List<Department> departments = departmentRepository.findAll().stream()
            .filter(Department::isActive)
            .sorted(Comparator.comparing(Department::getName, String.CASE_INSENSITIVE_ORDER))
            .collect(Collectors.toList());
        int baseMin = settingsService.getInt("scheduling", "minStaffPerShift");
        Map<String, List<Certification>> certsByStaff = loadCertificationsByStaff();
        Map<String, List<Staff>> staffByDepartment = staffRepository.findAll().stream()
            .filter(s -> s.getDepartmentId() != null)
            .collect(Collectors.groupingBy(Staff::getDepartmentId));
        Map<String, Double> trends = departmentTrends(date);

        List<Map<String, Object>> forecasts = new ArrayList<>();
        for (Department department : departments) {
            double multiplier = multipliers.getOrDefault(department.getId(), 1.0);
            int effectiveMin = (int) Math.ceil(baseMin * multiplier);
            double predictedLoad = department.getWorkload();
            double trendValue = trends.getOrDefault(department.getId(), 0.0);
            String trend = trendValue > 0.05 ? "rising" : trendValue < -0.05 ? "falling" : "stable";
            List<String> requiredCerts = requiredCertsFor(department.getName(), "Day");
            int certCoverage = certCoveragePercent(
                staffByDepartment.getOrDefault(department.getId(), List.of()), requiredCerts, certsByStaff);

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("departmentId", department.getId());
            row.put("department", department.getName());
            row.put("baselineLoad", Math.round(department.getWorkload()));
            row.put("predictedLoad", Math.round(predictedLoad));
            row.put("dailyPredictedLoad", Math.round(predictedLoad));
            row.put("trend", trend);
            row.put("multiplier", multiplier);
            row.put("baseMinStaff", baseMin);
            row.put("effectiveMinStaff", effectiveMin);
            row.put("surge", multiplier > 1.0);
            row.put("forecastSource", "heuristic");
            row.put("requiredCerts", requiredCerts);
            row.put("certCoverage", certCoverage);
            row.put("reason", forecastReason(department, multiplier, trend, 0.0, predictedLoad, certCoverage));
            forecasts.add(row);
        }
        return forecasts;
    }

    private Map<String, Object> buildDepartmentForecast(Department department, LocalDate date,
                                                        double globalBoost, int baseMin,
                                                        Map<String, List<Certification>> certsByStaff) {
        Map<String, Object> dailyForecast = predictionService.forecastDepartmentDaily(department.getId(), date);
        double multiplier = computeMultiplier(department, date, globalBoost, dailyForecast);
        int effectiveMin = (int) Math.ceil(baseMin * multiplier);
        double predictedLoad = asDouble(dailyForecast.get("predicted"));
        String trend = String.valueOf(dailyForecast.getOrDefault("trend", "stable"));
        List<String> requiredCerts = requiredCertsFor(department.getName(), "Day");
        int certCoverage = certCoveragePercent(department.getId(), requiredCerts, certsByStaff);

        Map<String, Object> row = new LinkedHashMap<>();
        row.put("departmentId", department.getId());
        row.put("department", department.getName());
        row.put("baselineLoad", Math.round(department.getWorkload()));
        row.put("predictedLoad", Math.round(predictedLoad));
        row.put("dailyPredictedLoad", Math.round(predictedLoad));
        row.put("trend", trend);
        row.put("multiplier", multiplier);
        row.put("baseMinStaff", baseMin);
        row.put("effectiveMinStaff", effectiveMin);
        row.put("surge", multiplier > 1.0);
        row.put("forecastSource", dailyForecast.getOrDefault("source", "heuristic"));
        row.put("requiredCerts", requiredCerts);
        row.put("certCoverage", certCoverage);
        row.put("reason", forecastReason(department, multiplier, trend, globalBoost, predictedLoad, certCoverage));
        return row;
    }

    private int certCoveragePercent(String departmentId, List<String> requiredCerts,
                                    Map<String, List<Certification>> certsByStaff) {
        List<Staff> deptStaff = staffRepository.findByDepartmentId(departmentId);
        return certCoveragePercent(deptStaff, requiredCerts, certsByStaff);
    }

    private int certCoveragePercent(List<Staff> deptStaff, List<String> requiredCerts,
                                    Map<String, List<Certification>> certsByStaff) {
        if (requiredCerts.isEmpty()) return 100;
        if (deptStaff.isEmpty()) return 0;
        long qualified = deptStaff.stream()
            .filter(s -> hasAllRequiredCerts(certsByStaff.getOrDefault(s.getId(), List.of()), requiredCerts))
            .count();
        return (int) Math.round((qualified * 100.0) / deptStaff.size());
    }

    private String forecastReason(Department department, double multiplier, String trend,
                                  double globalBoost, double predictedLoad, int certCoverage) {
        if (multiplier >= 1.5) {
            return department.getName() + " daily forecast " + Math.round(predictedLoad)
                + "% — raise staffing to " + (int) Math.ceil(multiplier * 100) + "% of baseline";
        }
        if (multiplier > 1.0) {
            return "Elevated demand (" + trend + ") — increase open slots for " + department.getName();
        }
        if (certCoverage < 60 && settingsService.getBoolean("scheduling", "skillMixRequired", true)) {
            return "Skill coverage low (" + certCoverage + "%) — prioritize certified staff for " + department.getName();
        }
        if (globalBoost > 0 && isHighAcuityDepartment(department.getName())) {
            return "Hospital-wide forecast up — monitor " + department.getName();
        }
        return "Demand stable — standard staffing target applies";
    }

    private double computeMultiplier(Department department, LocalDate date, double globalBoost) {
        Map<String, Object> dailyForecast = predictionService.forecastDepartmentDaily(department.getId(), date);
        return computeMultiplier(department, date, globalBoost, dailyForecast);
    }

    private double computeMultiplier(Department department, LocalDate date, double globalBoost,
                                     Map<String, Object> dailyForecast) {
        double predictedLoad = asDouble(dailyForecast.get("predicted"));
        double loadFactor = predictedLoad / 100.0;
        String trendLabel = String.valueOf(dailyForecast.getOrDefault("trend", "stable"));
        double trend = "rising".equals(trendLabel) ? 0.15 : "falling".equals(trendLabel) ? -0.05 : departmentTrend(department.getId(), date);
        double acuityBoost = isHighAcuityDepartment(department.getName()) ? globalBoost * 0.5 : 0;
        double score = loadFactor + trend + globalBoost + acuityBoost;

        if (score >= 0.95 || predictedLoad >= 90) return 1.75;
        if (score >= 0.8 || predictedLoad >= 80) return 1.5;
        if (score >= 0.65 || trend > 0.12) return 1.25;
        return 1.0;
    }

    private boolean isHighAcuityDepartment(String name) {
        if (name == null) return false;
        String n = name.toLowerCase(Locale.ROOT);
        return n.contains("icu") || n.contains("emergency") || n.contains("critical");
    }

    /**
     * Trends for every department computed from a single windowed query, instead of
     * re-scanning the full workload table once per department (the old per-department
     * path turned a schedule summary into dozens of full-table scans).
     */
    private Map<String, Double> departmentTrends(LocalDate date) {
        LocalDate priorStart = date.minusDays(14);
        List<WorkloadRecord> windowRecords = workloadRecordRepository.findByDateRange(
            priorStart.atStartOfDay(), date.plusDays(1).atStartOfDay());
        Map<String, List<WorkloadRecord>> byDepartment = windowRecords.stream()
            .filter(r -> r.getDepartmentId() != null && r.getDate() != null)
            .collect(Collectors.groupingBy(WorkloadRecord::getDepartmentId));
        Map<String, Double> trends = new HashMap<>();
        byDepartment.forEach((deptId, records) -> trends.put(deptId, computeTrend(records, date)));
        return trends;
    }

    private double departmentTrend(String departmentId, LocalDate date) {
        LocalDate priorStart = date.minusDays(14);
        List<WorkloadRecord> records = workloadRecordRepository.findByDateRange(
                priorStart.atStartOfDay(), date.plusDays(1).atStartOfDay()).stream()
            .filter(r -> departmentId.equals(r.getDepartmentId()))
            .collect(Collectors.toList());
        return computeTrend(records, date);
    }

    private double computeTrend(List<WorkloadRecord> departmentRecords, LocalDate date) {
        LocalDate recentStart = date.minusDays(7);
        LocalDate priorStart = date.minusDays(14);
        double recentAvg = averageWorkload(departmentRecords, recentStart, date);
        double priorAvg = averageWorkload(departmentRecords, priorStart, recentStart.minusDays(1));
        if (priorAvg <= 0) return 0;
        return (recentAvg - priorAvg) / priorAvg;
    }

    private double averageWorkload(List<WorkloadRecord> departmentRecords, LocalDate start, LocalDate end) {
        List<WorkloadRecord> records = departmentRecords.stream()
            .filter(r -> r.getDate() != null)
            .filter(r -> {
                LocalDate d = r.getDate().toLocalDate();
                return !d.isBefore(start) && !d.isAfter(end);
            })
            .collect(Collectors.toList());
        if (records.isEmpty()) return 0;
        return records.stream().mapToDouble(WorkloadRecord::getWorkload).average().orElse(0) / 100.0;
    }

    private boolean isMlForecastSource(String source) {
        if (source == null || source.isBlank()) return false;
        String normalized = source.toLowerCase(Locale.ROOT);
        return normalized.contains("ridge")
            || normalized.contains("ensemble")
            || normalized.contains("system-model")
            || normalized.contains("ephemeral");
    }

    private Set<String> loadStaffOnLeave(LocalDate date) {
        try {
            LocalDateTime dayStart = date.atStartOfDay();
            LocalDateTime dayEnd = date.plusDays(1).atStartOfDay().minusNanos(1);
            return leaveRequestRepository.findApprovedOverlapping(dayStart, dayEnd).stream()
                .map(LeaveRequest::getStaffId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        } catch (Exception e) {
            return Set.of();
        }
    }

    private double globalForecastBoost() {
        try {
            Map<String, Object> predictions = predictionService.getPredictions(null);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> trend = (List<Map<String, Object>>) predictions.getOrDefault("workloadTrend", List.of());
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> forecast = (List<Map<String, Object>>) predictions.getOrDefault("forecastData", List.of());
            if (trend.isEmpty() || forecast.isEmpty()) return 0;

            double lastActual = asDouble(trend.get(trend.size() - 1).get("actual"));
            double nextPredicted = asDouble(forecast.get(0).get("predicted"));
            if (lastActual <= 0) return 0;
            double change = (nextPredicted - lastActual) / lastActual;
            if (change >= 0.15) return 0.2;
            if (change >= 0.08) return 0.1;
            if (change <= -0.1) return -0.05;
            return 0;
        } catch (Exception e) {
            return 0;
        }
    }

    private ScoreResult scoreStaff(Staff staff, LocalDate date, String shift,
                                   String targetDepartmentId, String targetDepartmentName,
                                   List<String> requiredCerts,
                                   List<Schedule> daySchedules, List<Schedule> weekSchedules,
                                   Map<String, Map<String, Object>> preferences,
                                   Map<String, WellnessRecord> wellnessByStaff,
                                   Map<String, List<Certification>> certsByStaff,
                                   Set<String> staffOnLeave,
                                   boolean respectPreferences, boolean skillMixRequired,
                                   int maxHoursPerWeek, int restBetweenShifts,
                                   Map<String, Double> weekHoursByStaff, Set<String> bookedStaffIds,
                                   Map<String, String> previousDayShiftByStaff) {
        List<String> reasons = new ArrayList<>();
        Map<String, Double> features = new LinkedHashMap<>();
        int score = 50;
        List<Certification> staffCerts = certsByStaff.getOrDefault(staff.getId(), List.of());
        List<String> activeCertNames = activeCertificationNames(staffCerts);
        List<String> skillGaps = missingRequiredCerts(staffCerts, requiredCerts);

        if (staffOnLeave.contains(staff.getId())) {
            return ineligible("On approved leave");
        }
        if (bookedStaffIds.contains(staff.getId())) {
            return ineligible("Already scheduled this date");
        }

        double deptMatch = 0.5;
        if (targetDepartmentId != null && targetDepartmentId.equals(staff.getDepartmentId())) {
            deptMatch = 1.0;
            reasons.add("Department: " + (staff.getDepartment() != null ? staff.getDepartment().getName() : targetDepartmentName));
            score += 15;
        } else if (staff.getDepartment() != null) {
            deptMatch = 0.7;
            reasons.add("Department: " + staff.getDepartment().getName());
            score += 8;
        }
        features.put("department_match", deptMatch);

        double prefMatch = 0.5;
        Map<String, Object> pref = preferences.get(staff.getId());
        if (pref != null) {
            List<String> preferred = stringList(pref.get("preferredShifts"));
            List<String> avoidDates = stringList(pref.get("avoidDates"));
            if (avoidDates.contains(date.toString())) {
                if (respectPreferences) {
                    return ineligible("Marked date as unavailable");
                }
                score -= 20;
                reasons.add("Prefers to avoid this date (soft penalty)");
                prefMatch = 0.2;
            } else if (preferred.contains(shift)) {
                score += 20;
                reasons.add("Prefers " + shift + " shifts");
                prefMatch = 1.0;
            }
        }
        features.put("preference_match", prefMatch);

        double wellnessScore = 0.7;
        WellnessRecord wellness = wellnessByStaff.get(staff.getId());
        if (wellness != null) {
            String risk = wellness.getRiskLevel() != null ? wellness.getRiskLevel() : "low";
            switch (risk) {
                case "high" -> {
                    score -= 25;
                    wellnessScore = 0.2;
                    reasons.add("High burnout risk");
                }
                case "medium" -> {
                    score -= 10;
                    wellnessScore = 0.5;
                    reasons.add("Medium wellness risk");
                }
                default -> {
                    score += 10;
                    wellnessScore = 1.0;
                    reasons.add("Low wellness risk");
                }
            }
        }
        features.put("wellness_score", wellnessScore);

        int maxHours = maxHoursPerWeek > 0 ? maxHoursPerWeek : 40;
        int restHours = restBetweenShifts > 0 ? restBetweenShifts : 8;
        double weekHours = weekHoursByStaff.getOrDefault(staff.getId(), 0.0);
        double hoursHeadroom = Math.max(0, Math.min(1, (maxHours - weekHours) / Math.max(1, maxHours)));
        features.put("hours_headroom", hoursHeadroom);
        if (weekHours + 8 > maxHours) {
            score -= 30;
            reasons.add("Near weekly hour limit (" + Math.round(weekHours) + "h)");
        } else {
            score += 5;
            reasons.add("Within weekly hour limit");
        }

        boolean restOk = meetsRest(staff.getId(), shift, previousDayShiftByStaff, restHours);
        features.put("rest_compliant", restOk ? 1.0 : 0.0);
        if (!restOk) {
            score -= 25;
            reasons.add("Insufficient rest between shifts");
        } else {
            reasons.add("Rest requirement met");
        }

        double skillMatch = skillMatchScore(staffCerts, requiredCerts);
        features.put("skill_match", skillMatch);
        if (!skillGaps.isEmpty()) {
            if (skillMixRequired) {
                return ineligible("Missing required certifications: " + String.join(", ", skillGaps));
            }
            score -= 15;
            reasons.add("Missing certs: " + String.join(", ", skillGaps));
        } else if (!requiredCerts.isEmpty()) {
            score += 20;
            reasons.add("Has required certs: " + String.join(", ", requiredCerts));
        } else if (!activeCertNames.isEmpty()) {
            score += 5;
            reasons.add("Certifications: " + String.join(", ", activeCertNames));
        }

        if (staff.getRole() != null && !staff.getRole().isBlank()) {
            reasons.add("Role: " + staff.getRole());
            score += 5;
        }

        score = Math.max(0, Math.min(100, score));
        return new ScoreResult(score, true, reasons, features, activeCertNames, skillGaps, false);
    }

    private ScoreResult ineligible(String reason) {
        return new ScoreResult(0, false, List.of(reason), Map.of(), List.of(), List.of(), false);
    }

    private boolean applyAiRanking(List<ScoredStaff> scored, String departmentName, String shift) {
        if (!aiServiceClient.isHealthy() || scored.isEmpty()) {
            return false;
        }
        try {
            List<Map<String, Object>> candidates = scored.stream().map(s -> {
                Map<String, Double> f = s.result().features();
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", s.staff().getId());
                row.put("department_match", f.getOrDefault("department_match", 0.5));
                row.put("preference_match", f.getOrDefault("preference_match", 0.5));
                row.put("wellness_score", f.getOrDefault("wellness_score", 0.5));
                row.put("rest_compliant", f.getOrDefault("rest_compliant", 1.0));
                row.put("skill_match", f.getOrDefault("skill_match", 0.5));
                row.put("hours_headroom", f.getOrDefault("hours_headroom", 0.5));
                return row;
            }).collect(Collectors.toList());

            Map<String, Object> request = new LinkedHashMap<>();
            request.put("candidates", candidates);
            request.put("shift_type", shift != null ? shift : "");
            request.put("department", departmentName != null ? departmentName : "");

            Map<String, Object> response = aiServiceClient.rankAssignees(request);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> rankings = (List<Map<String, Object>>) response.get("rankings");
            if (rankings == null) return false;

            Map<String, Double> aiScores = new HashMap<>();
            for (Map<String, Object> ranking : rankings) {
                aiScores.put(String.valueOf(ranking.get("id")), asDouble(ranking.get("score")));
            }

            for (int i = 0; i < scored.size(); i++) {
                ScoredStaff item = scored.get(i);
                double ruleScore = item.result().score();
                double aiScore = aiScores.getOrDefault(item.staff().getId(), ruleScore);
                int blended = (int) Math.round(ruleScore * 0.4 + aiScore * 0.6);
                List<String> reasons = new ArrayList<>(item.result().reasons());
                reasons.add("AI-optimized rank (blended score)");
                ScoreResult updated = new ScoreResult(
                    Math.max(0, Math.min(100, blended)),
                    true,
                    reasons,
                    item.result().features(),
                    item.result().certifications(),
                    item.result().skillGaps(),
                    true
                );
                scored.set(i, new ScoredStaff(item.staff(), updated));
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private Map<String, Object> toSuggestionDto(ScoredStaff scored, boolean aiServiceUsed) {
        Staff staff = scored.staff();
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("staffId", staff.getId());
        row.put("name", staff.getName());
        row.put("role", staff.getRole());
        row.put("departmentId", staff.getDepartmentId());
        row.put("department", staff.getDepartment() != null ? staff.getDepartment().getName() : "");
        row.put("score", scored.result().score());
        row.put("reasons", scored.result().reasons());
        row.put("recommended", scored.result().score() >= 70);
        row.put("certifications", scored.result().certifications());
        row.put("skillGaps", scored.result().skillGaps());
        row.put("aiRanked", scored.result().aiRanked() && aiServiceUsed);
        return row;
    }

    private Map<String, List<Certification>> loadCertificationsByStaff() {
        Map<String, List<Certification>> map = new HashMap<>();
        for (Certification cert : certificationRepository.findAll()) {
            if (cert.getStaffId() == null) continue;
            map.computeIfAbsent(cert.getStaffId(), ignored -> new ArrayList<>()).add(cert);
        }
        return map;
    }

    private List<String> activeCertificationNames(List<Certification> certs) {
        LocalDateTime now = LocalDateTime.now();
        return certs.stream()
            .filter(c -> isCertActive(c, now))
            .map(Certification::getName)
            .distinct()
            .collect(Collectors.toList());
    }

    private boolean isCertActive(Certification cert, LocalDateTime now) {
        if (cert == null) return false;
        if (cert.getStatus() != null && !"active".equalsIgnoreCase(cert.getStatus())) return false;
        return cert.getExpiryDate() == null || !cert.getExpiryDate().isBefore(now);
    }

    private List<String> missingRequiredCerts(List<Certification> certs, List<String> required) {
        if (required.isEmpty()) return List.of();
        LocalDateTime now = LocalDateTime.now();
        Set<String> held = certs.stream()
            .filter(c -> isCertActive(c, now))
            .map(c -> c.getName().toUpperCase(Locale.ROOT))
            .collect(Collectors.toSet());
        return required.stream()
            .filter(req -> !held.contains(req.toUpperCase(Locale.ROOT)))
            .collect(Collectors.toList());
    }

    private boolean hasAllRequiredCerts(List<Certification> certs, List<String> required) {
        return missingRequiredCerts(certs, required).isEmpty();
    }

    private double skillMatchScore(List<Certification> certs, List<String> required) {
        if (required.isEmpty()) return 0.6;
        List<String> missing = missingRequiredCerts(certs, required);
        if (missing.isEmpty()) return 1.0;
        double ratio = (required.size() - missing.size()) / (double) required.size();
        return Math.max(0, ratio);
    }

    private Map<String, List<String>> cachedDepartmentSkillRequirements;
    private Map<String, List<String>> cachedShiftSkillRequirements;

    private Map<String, List<String>> departmentSkillRequirements() {
        if (cachedDepartmentSkillRequirements == null) {
            cachedDepartmentSkillRequirements = parseDepartmentSkillRequirements();
        }
        return cachedDepartmentSkillRequirements;
    }

    private Map<String, List<String>> shiftSkillRequirements() {
        if (cachedShiftSkillRequirements == null) {
            cachedShiftSkillRequirements = parseShiftSkillRequirements();
        }
        return cachedShiftSkillRequirements;
    }

    @SuppressWarnings("unchecked")
    private Map<String, List<String>> parseDepartmentSkillRequirements() {
        Object raw = settingsService.getSchedulingConstraints().get("departmentSkillRequirements");
        if (!(raw instanceof Map<?, ?> map)) {
            return Map.of();
        }
        Map<String, List<String>> result = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (entry.getValue() instanceof List<?> list) {
                result.put(String.valueOf(entry.getKey()), list.stream().map(String::valueOf).collect(Collectors.toList()));
            }
        }
        return result;
    }

    private Map<String, List<String>> parseShiftSkillRequirements() {
        Object raw = settingsService.getSchedulingConstraints().get("shiftSkillRequirements");
        if (!(raw instanceof Map<?, ?> map)) {
            return Map.of();
        }
        Map<String, List<String>> result = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (entry.getValue() instanceof List<?> list) {
                result.put(String.valueOf(entry.getKey()), list.stream().map(String::valueOf).collect(Collectors.toList()));
            }
        }
        return result;
    }

    private Map<String, WellnessRecord> loadLatestWellness() {
        Map<String, WellnessRecord> map = new HashMap<>();
        for (WellnessRecord record : wellnessRecordRepository.findAllWithStaffAndDepartment()) {
            if (record.getStaffId() == null) continue;
            WellnessRecord existing = map.get(record.getStaffId());
            if (existing == null || (record.getDate() != null && existing.getDate() != null
                && record.getDate().isAfter(existing.getDate()))) {
                map.put(record.getStaffId(), record);
            }
        }
        return map;
    }

    private boolean isOnLeave(String staffId, LocalDate date) {
        LocalDateTime day = date.atStartOfDay();
        return leaveRequestRepository.findAllByOrderByCreatedAtDesc().stream()
            .filter(l -> staffId.equals(l.getStaffId()))
            .filter(l -> "approved".equals(l.getStatus()))
            .anyMatch(l -> !day.isBefore(l.getStartDate()) && !day.isAfter(l.getEndDate()));
    }

    private boolean isDoubleBooked(String staffId, LocalDate date, List<Schedule> daySchedules) {
        return daySchedules.stream()
            .filter(s -> staffId.equals(s.getStaffId()))
            .filter(s -> s.getStaffId() != null && !s.getStaffId().isBlank())
            .count() > 0;
    }

    private double weekHours(String staffId, LocalDate date, List<Schedule> weekSchedules) {
        LocalDate weekStart = date.minusDays(date.getDayOfWeek().getValue() - 1L);
        LocalDate weekEnd = weekStart.plusDays(6);
        return weekSchedules.stream()
            .filter(s -> staffId.equals(s.getStaffId()))
            .filter(s -> s.getDate() != null)
            .filter(s -> {
                LocalDate d = s.getDate().toLocalDate();
                return !d.isBefore(weekStart) && !d.isAfter(weekEnd);
            })
            .count() * 8.0;
    }

    private boolean meetsRest(String staffId, String newShift,
                              Map<String, String> previousDayShiftByStaff, int restHoursRequired) {
        String prevType = previousDayShiftByStaff.get(staffId);
        if (prevType == null) return true;
        if ("Night".equals(prevType) && "Day".equals(newShift)) return restHoursRequired <= 8;
        if ("Evening".equals(prevType) && "Day".equals(newShift)) return restHoursRequired <= 10;
        return true;
    }

    private String resolveDepartmentId(Schedule schedule) {
        if (schedule.getDepartmentId() != null && !schedule.getDepartmentId().isBlank()) {
            return schedule.getDepartmentId();
        }
        if (schedule.getStaff() != null && schedule.getStaff().getDepartmentId() != null) {
            return schedule.getStaff().getDepartmentId();
        }
        return null;
    }

    private String resolveDepartmentName(String departmentId) {
        if (departmentId == null) return "";
        return departmentRepository.findById(departmentId).map(Department::getName).orElse("");
    }

    private LocalDateTime dayStart(LocalDate date) {
        return date.atStartOfDay();
    }

    private LocalDateTime dayEnd(LocalDate date) {
        return date.plusDays(1).atStartOfDay();
    }

    private double asDouble(Object value) {
        if (value == null) return 0;
        if (value instanceof Number n) return n.doubleValue();
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private int asInt(Object value, int fallback) {
        if (value == null) return fallback;
        if (value instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private String stringValue(Object value) {
        if (value == null) return null;
        String s = String.valueOf(value).trim();
        return s.isEmpty() ? null : s;
    }

    @SuppressWarnings("unchecked")
    private List<String> stringList(Object value) {
        if (value instanceof List<?> list) {
            return list.stream().map(String::valueOf).collect(Collectors.toList());
        }
        return List.of();
    }

    private record ScoreResult(int score, boolean eligible, List<String> reasons,
                               Map<String, Double> features, List<String> certifications,
                               List<String> skillGaps, boolean aiRanked) {}
    private record ScoredStaff(Staff staff, ScoreResult result) {}

    public record SchedulingContext(
        LocalDate date,
        List<Schedule> daySchedules,
        List<Schedule> weekSchedules,
        Map<String, Map<String, Object>> preferences,
        Map<String, WellnessRecord> wellnessByStaff,
        Map<String, List<Certification>> certsByStaff,
        Set<String> staffOnLeave,
        List<Staff> allStaff,
        boolean respectPreferences,
        boolean skillMixRequired,
        int maxHoursPerWeek,
        int restBetweenShifts,
        Map<String, Double> weekHoursByStaff,
        Set<String> bookedStaffIds,
        Map<String, String> previousDayShiftByStaff
    ) {}
}
