package com.hwo.controller;

import com.hwo.entity.User;
import com.hwo.service.CurrentUserService;
import com.hwo.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/mobile")
public class MobileAuthController {

    private final CurrentUserService currentUserService;
    private final UserService userService;

    public MobileAuthController(CurrentUserService currentUserService, UserService userService) {
        this.currentUserService = currentUserService;
        this.userService = userService;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        return ResponseEntity.ok(Map.of(
            "status", "ok",
            "service", "hwo-backend"
        ));
    }

    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> me() {
        return currentUserService.currentUser()
            .map(this::authenticatedProfile)
            .orElseGet(() -> ResponseEntity.ok(Map.of("authenticated", false)));
    }

    private ResponseEntity<Map<String, Object>> authenticatedProfile(User user) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("authenticated", true);
        body.put("user", userService.toSessionMap(user));
        body.put("staffId", user.getStaffId() != null ? user.getStaffId() : "");
        return ResponseEntity.ok(body);
    }
}
