package com.hwo.controller;

import com.hwo.entity.User;
import com.hwo.service.CurrentUserService;
import com.hwo.service.WellnessService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/mobile")
public class MobileAlertsController {

    private final WellnessService wellnessService;
    private final CurrentUserService currentUserService;

    public MobileAlertsController(WellnessService wellnessService, CurrentUserService currentUserService) {
        this.wellnessService = wellnessService;
        this.currentUserService = currentUserService;
    }

    @GetMapping("/alerts")
    public ResponseEntity<Map<String, Object>> getAlerts(
            @RequestParam(required = false) String staffId) {
        String resolvedStaffId = staffId;
        if (resolvedStaffId == null || resolvedStaffId.isBlank()) {
            resolvedStaffId = currentUserService.currentUser()
                .map(User::getStaffId)
                .orElse(null);
        }
        return ResponseEntity.ok(wellnessService.getMobileAlerts(resolvedStaffId));
    }
}
