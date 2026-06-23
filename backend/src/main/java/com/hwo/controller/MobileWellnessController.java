package com.hwo.controller;

import com.hwo.entity.User;
import com.hwo.service.CurrentUserService;
import com.hwo.service.WellnessService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/mobile")
public class MobileWellnessController {

    private final WellnessService wellnessService;
    private final CurrentUserService currentUserService;

    public MobileWellnessController(WellnessService wellnessService,
                                    CurrentUserService currentUserService) {
        this.wellnessService = wellnessService;
        this.currentUserService = currentUserService;
    }

    @GetMapping("/wellness")
    public ResponseEntity<Map<String, Object>> getWellness(
            @RequestParam(required = false) String staffId) {
        String resolvedStaffId = staffId;
        if (resolvedStaffId == null || resolvedStaffId.isBlank()) {
            resolvedStaffId = currentUserService.currentUser()
                .map(User::getStaffId)
                .orElse(null);
        }
        Map<String, Object> result = wellnessService.getMobileWellness(resolvedStaffId);
        if (resolvedStaffId != null) {
            result.put("staffId", resolvedStaffId);
        }
        currentUserService.currentUser().ifPresent(user -> {
            result.put("userId", user.getId());
            result.put("email", user.getEmail());
        });
        return ResponseEntity.ok(result);
    }

    @GetMapping("/survey")
    public ResponseEntity<Map<String, Object>> getSurvey() {
        return ResponseEntity.ok(Map.of("questions", wellnessService.getSurveyQuestions()));
    }

    @PostMapping("/survey")
    public ResponseEntity<Map<String, Object>> submitSurvey(@RequestBody Map<String, ?> body) {
        String userId = currentUserService.currentUserId()
            .orElseThrow(() -> new IllegalArgumentException("Sign in required"));
        return ResponseEntity.ok(wellnessService.submitSurvey(userId, body));
    }

    @PostMapping("/checkin")
    public ResponseEntity<Map<String, Object>> mobileCheckin(@RequestBody Map<String, ?> body) {
        String userId = currentUserService.currentUserId()
            .orElseThrow(() -> new IllegalArgumentException("Sign in required"));
        return ResponseEntity.ok(wellnessService.submitCheckin(userId, body));
    }
}
