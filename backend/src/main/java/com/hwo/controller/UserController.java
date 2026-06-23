package com.hwo.controller;

import com.hwo.entity.User;
import com.hwo.service.CurrentUserService;
import com.hwo.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;
    private final CurrentUserService currentUserService;

    public UserController(UserService userService, CurrentUserService currentUserService) {
        this.userService = userService;
        this.currentUserService = currentUserService;
    }

    @GetMapping("/overview")
    public ResponseEntity<?> overview() {
        if (currentUserService.currentAdmin().isEmpty()) return forbidden();
        return ResponseEntity.ok(userService.getOverview());
    }

    @GetMapping("/meta")
    public ResponseEntity<?> meta() {
        if (currentUserService.currentAdmin().isEmpty()) {
            return forbidden();
        }
        return ResponseEntity.ok(userService.getManagementMeta());
    }

    @GetMapping
    public ResponseEntity<?> listUsers(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "15") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String userType,
            @RequestParam(required = false) String status) {
        if (currentUserService.currentAdmin().isEmpty()) return forbidden();
        return ResponseEntity.ok(userService.listUsersPage(page, size, search, userType, status));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getUser(@PathVariable String id) {
        if (currentUserService.currentAdmin().isEmpty()) return forbidden();
        return ResponseEntity.ok(userService.getUser(id));
    }

    @PostMapping
    public ResponseEntity<?> createUser(@RequestBody Map<String, Object> body) {
        if (currentUserService.currentAdmin().isEmpty()) return forbidden();
        Map<String, Object> created = userService.createUser(body, true);
        return ResponseEntity.ok(Map.of("success", true, "user", created));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> updateUser(@PathVariable String id, @RequestBody Map<String, Object> body) {
        User admin = currentUserService.currentAdmin().orElse(null);
        if (admin == null) return forbidden();
        Map<String, Object> updated = userService.updateUser(id, body, admin.getId());
        return ResponseEntity.ok(Map.of("success", true, "user", updated));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deactivateUser(@PathVariable String id) {
        User admin = currentUserService.currentAdmin().orElse(null);
        if (admin == null) return forbidden();
        userService.deactivateUser(id, admin.getId());
        return ResponseEntity.ok(Map.of("success", true));
    }

    private ResponseEntity<Map<String, Object>> forbidden() {
        return ResponseEntity.status(403).body(Map.of("error", "Permission denied: users:manage required"));
    }
}
