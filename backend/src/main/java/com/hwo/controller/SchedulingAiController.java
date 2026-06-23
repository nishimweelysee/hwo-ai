package com.hwo.controller;

import com.hwo.service.CurrentUserService;
import com.hwo.service.SchedulingAiService;
import com.hwo.service.SchedulingService;
import com.hwo.web.PermissionResponses;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/scheduling/ai")
public class SchedulingAiController {

    private final SchedulingAiService schedulingAiService;
    private final SchedulingService schedulingService;
    private final CurrentUserService currentUserService;

    public SchedulingAiController(SchedulingAiService schedulingAiService,
                                  SchedulingService schedulingService,
                                  CurrentUserService currentUserService) {
        this.schedulingAiService = schedulingAiService;
        this.schedulingService = schedulingService;
        this.currentUserService = currentUserService;
    }

    @GetMapping("/health")
    public ResponseEntity<?> modelHealth() {
        if (!currentUserService.canAccessMenu("scheduling")) {
            return PermissionResponses.forbidden("scheduling menu access");
        }
        return ResponseEntity.ok(schedulingAiService.schedulingModelHealth());
    }

    @GetMapping("/suggestions")
    public ResponseEntity<?> suggestAssignees(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam String shift,
            @RequestParam(required = false) String departmentId,
            @RequestParam(required = false) String excludeStaffId,
            @RequestParam(required = false) Integer limit) {
        if (!currentUserService.canAccessMenu("scheduling")) {
            return PermissionResponses.forbidden("scheduling menu access");
        }
        try {
            return ResponseEntity.ok(Map.of(
                "suggestions",
                schedulingAiService.suggestAssignees(date, departmentId, shift, excludeStaffId, limit)
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/forecast")
    public ResponseEntity<?> departmentForecast(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        if (!currentUserService.canAccessMenu("scheduling")) {
            return PermissionResponses.forbidden("scheduling menu access");
        }
        LocalDate d = date != null ? date : LocalDate.now();
        return ResponseEntity.ok(schedulingAiService.departmentForecasts(d));
    }

    @GetMapping("/swap-partners/{scheduleId}")
    public ResponseEntity<?> suggestSwapPartners(@PathVariable String scheduleId) {
        if (!currentUserService.canAccessMenu("scheduling")) {
            return PermissionResponses.forbidden("scheduling menu access");
        }
        try {
            return ResponseEntity.ok(Map.of(
                "partners",
                schedulingAiService.suggestSwapPartners(scheduleId)
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/what-if")
    public ResponseEntity<?> whatIf(@RequestBody Map<String, Object> body) {
        if (!currentUserService.canAccessMenu("scheduling")) {
            return PermissionResponses.forbidden("scheduling menu access");
        }
        LocalDate date = body.get("date") != null
            ? LocalDate.parse(String.valueOf(body.get("date")).substring(0, 10))
            : LocalDate.now();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> additions = body.get("additions") instanceof List<?>
            ? (List<Map<String, Object>>) body.get("additions")
            : List.of();
        return ResponseEntity.ok(schedulingAiService.whatIf(date, additions));
    }

    @PostMapping("/auto-schedule")
    public ResponseEntity<?> autoSchedule(@RequestBody(required = false) Map<String, String> body) {
        if (!currentUserService.canAccessMenu("scheduling")) {
            return PermissionResponses.forbidden("scheduling menu access");
        }
        LocalDate date = body != null && body.get("date") != null
            ? LocalDate.parse(body.get("date"))
            : LocalDate.now();
        try {
            return ResponseEntity.ok(schedulingService.autoSchedule(date));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
