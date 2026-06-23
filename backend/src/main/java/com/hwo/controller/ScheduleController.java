package com.hwo.controller;

import com.hwo.service.CurrentUserService;
import com.hwo.service.SchedulingService;
import com.hwo.web.PermissionResponses;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class ScheduleController {

    private final SchedulingService schedulingService;
    private final CurrentUserService currentUserService;

    public ScheduleController(SchedulingService schedulingService, CurrentUserService currentUserService) {
        this.schedulingService = schedulingService;
        this.currentUserService = currentUserService;
    }

    @GetMapping("/schedules")
    public ResponseEntity<List<Map<String, Object>>> getSchedules(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        LocalDate d = date != null ? date : LocalDate.now();
        return ResponseEntity.ok(schedulingService.listSchedules(d));
    }

    @GetMapping("/schedules/summary")
    public ResponseEntity<Map<String, Object>> getScheduleSummary(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        LocalDate d = date != null ? date : LocalDate.now();
        return ResponseEntity.ok(schedulingService.scheduleSummary(d));
    }

    @GetMapping("/schedules/{id}")
    public ResponseEntity<?> getSchedule(@PathVariable String id) {
        return schedulingService.getSchedule(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/schedules")
    public ResponseEntity<?> createSchedule(@RequestBody Map<String, Object> body) {
        if (!currentUserService.canAccessMenu("scheduling")) {
            return PermissionResponses.forbidden("scheduling menu access");
        }
        try {
            return ResponseEntity.ok(schedulingService.createSchedule(body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PatchMapping("/schedules/{id}")
    public ResponseEntity<?> updateSchedule(@PathVariable String id, @RequestBody Map<String, Object> body) {
        if (!currentUserService.canAccessMenu("scheduling")) {
            return PermissionResponses.forbidden("scheduling menu access");
        }
        try {
            return ResponseEntity.ok(schedulingService.updateSchedule(id, body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/schedules/{id}")
    public ResponseEntity<?> deleteSchedule(@PathVariable String id) {
        if (!currentUserService.canAccessMenu("scheduling")) {
            return PermissionResponses.forbidden("scheduling menu access");
        }
        try {
            schedulingService.deleteSchedule(id);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/schedules/publish")
    public ResponseEntity<?> publishSchedule(@RequestBody(required = false) Map<String, String> body) {
        if (!currentUserService.canAccessMenu("scheduling")) {
            return PermissionResponses.forbidden("scheduling menu access");
        }
        LocalDate date = body != null && body.get("date") != null
            ? LocalDate.parse(body.get("date"))
            : LocalDate.now();
        return ResponseEntity.ok(schedulingService.publishSchedule(date));
    }

    @PostMapping("/schedules/swap")
    public ResponseEntity<?> requestSwap(@RequestBody Map<String, String> body) {
        String scheduleId = body.get("scheduleId");
        if (scheduleId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "scheduleId required"));
        }
        if (!currentUserService.canAccessMenu("scheduling")
            && !currentUserService.canRequestSwapOnOwnShift(scheduleId)) {
            return PermissionResponses.forbidden("scheduling menu access");
        }
        try {
            return ResponseEntity.ok(schedulingService.requestSwap(scheduleId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/schedules/{id}/swap")
    public ResponseEntity<?> resolveSwap(@PathVariable String id, @RequestBody Map<String, String> body) {
        if (!currentUserService.canAccessMenu("scheduling")) {
            return PermissionResponses.forbidden("scheduling menu access");
        }
        try {
            return ResponseEntity.ok(schedulingService.resolveSwap(id, body.get("action"), body.get("staffId")));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
