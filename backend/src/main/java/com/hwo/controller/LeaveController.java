package com.hwo.controller;

import com.hwo.service.CurrentUserService;
import com.hwo.service.SchedulingService;
import com.hwo.web.PermissionResponses;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class LeaveController {

    private final SchedulingService schedulingService;
    private final CurrentUserService currentUserService;

    public LeaveController(SchedulingService schedulingService, CurrentUserService currentUserService) {
        this.schedulingService = schedulingService;
        this.currentUserService = currentUserService;
    }

    @GetMapping("/leave")
    public ResponseEntity<List<Map<String, Object>>> getLeave(
            @RequestParam(required = false) Integer limit) {
        return ResponseEntity.ok(schedulingService.listLeave(limit));
    }

    @PostMapping("/leave")
    public ResponseEntity<?> createLeave(@RequestBody Map<String, Object> body) {
        if (!currentUserService.canAccessMenu("scheduling")) {
            return PermissionResponses.forbidden("scheduling menu access");
        }
        try {
            return ResponseEntity.ok(schedulingService.createLeave(body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PatchMapping("/leave/{id}")
    public ResponseEntity<?> updateLeave(@PathVariable String id, @RequestBody Map<String, Object> body) {
        if (!currentUserService.canAccessMenu("scheduling")) {
            return PermissionResponses.forbidden("scheduling menu access");
        }
        try {
            return ResponseEntity.ok(schedulingService.updateLeave(id, body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/leave/{id}")
    public ResponseEntity<?> deleteLeave(@PathVariable String id) {
        if (!currentUserService.canAccessMenu("scheduling")) {
            return PermissionResponses.forbidden("scheduling menu access");
        }
        try {
            schedulingService.deleteLeave(id);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
