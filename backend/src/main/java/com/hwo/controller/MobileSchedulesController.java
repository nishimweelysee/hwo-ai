package com.hwo.controller;

import com.hwo.entity.Schedule;
import com.hwo.entity.User;
import com.hwo.repository.ScheduleRepository;
import com.hwo.service.CurrentUserService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/mobile")
public class MobileSchedulesController {

    private final ScheduleRepository scheduleRepository;
    private final CurrentUserService currentUserService;

    public MobileSchedulesController(ScheduleRepository scheduleRepository,
                                     CurrentUserService currentUserService) {
        this.scheduleRepository = scheduleRepository;
        this.currentUserService = currentUserService;
    }

    @GetMapping("/schedules")
    public ResponseEntity<Map<String, Object>> getSchedules(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(defaultValue = "7") int days) {
        LocalDate startDate = date != null ? date : LocalDate.now();
        LocalDateTime start = startDate.atStartOfDay();
        LocalDateTime end = startDate.plusDays(days).atStartOfDay();

        Optional<User> user = currentUserService.currentUser();
        String staffId = user.map(User::getStaffId).orElse(null);
        boolean guest = staffId == null || staffId.isBlank();
        List<Schedule> all = guest
            ? List.of()
            : scheduleRepository.findByStaffIdAndDateBetween(staffId, start, end);

        Map<String, List<Map<String, Object>>> byDate = new HashMap<>();
        for (Schedule s : all) {
            String dateStr = s.getDate().toLocalDate().toString();
            byDate.computeIfAbsent(dateStr, k -> new ArrayList<>()).add(Map.of(
                "id", s.getId(),
                "shift", s.getShift() != null ? s.getShift() : "",
                "department", s.getStaff() != null && s.getStaff().getDepartment() != null
                    ? s.getStaff().getDepartment().getName() : ""
            ));
        }
        List<Map<String, Object>> schedules = new ArrayList<>();
        for (int i = 0; i < days; i++) {
            LocalDate d = startDate.plusDays(i);
            String dateStr = d.toString();
            List<Map<String, Object>> shifts = byDate.getOrDefault(dateStr, List.of());
            schedules.add(Map.of("date", dateStr, "shifts", shifts));
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("schedules", schedules);
        response.put("staffId", staffId != null ? staffId : "");
        response.put("guest", guest);
        return ResponseEntity.ok(response);
    }
}
