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
public class OnCallController {

    private final SchedulingService schedulingService;
    private final CurrentUserService currentUserService;

    public OnCallController(SchedulingService schedulingService, CurrentUserService currentUserService) {
        this.schedulingService = schedulingService;
        this.currentUserService = currentUserService;
    }

    @GetMapping("/on-call")
    public ResponseEntity<List<Map<String, Object>>> getOnCall(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        LocalDate d = date != null ? date : LocalDate.now();
        return ResponseEntity.ok(schedulingService.listOnCall(d));
    }

    @PostMapping("/on-call")
    public ResponseEntity<?> createOnCall(@RequestBody Map<String, Object> body) {
        if (!currentUserService.canAccessMenu("scheduling")) {
            return PermissionResponses.forbidden("scheduling menu access");
        }
        try {
            return ResponseEntity.ok(schedulingService.createOnCall(body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PatchMapping("/on-call/{id}")
    public ResponseEntity<?> updateOnCall(@PathVariable String id, @RequestBody Map<String, Object> body) {
        if (!currentUserService.canAccessMenu("scheduling")) {
            return PermissionResponses.forbidden("scheduling menu access");
        }
        try {
            return ResponseEntity.ok(schedulingService.updateOnCall(id, body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/on-call/{id}")
    public ResponseEntity<?> deleteOnCall(@PathVariable String id) {
        if (!currentUserService.canAccessMenu("scheduling")) {
            return PermissionResponses.forbidden("scheduling menu access");
        }
        try {
            schedulingService.deleteOnCall(id);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
