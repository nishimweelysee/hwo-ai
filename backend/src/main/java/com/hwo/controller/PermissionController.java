package com.hwo.controller;

import com.hwo.domain.RolePermissions;
import com.hwo.service.CurrentUserService;
import com.hwo.service.PermissionService;
import com.hwo.service.SettingsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/permissions")
public class PermissionController {

    private final PermissionService permissionService;
    private final CurrentUserService currentUserService;
    private final SettingsService settingsService;

    public PermissionController(PermissionService permissionService,
                                CurrentUserService currentUserService,
                                SettingsService settingsService) {
        this.permissionService = permissionService;
        this.currentUserService = currentUserService;
        this.settingsService = settingsService;
    }

    @GetMapping
    public ResponseEntity<?> currentUserPermissions() {
        return currentUserService.currentUser()
            .map(user -> ResponseEntity.ok(permissionService.forUser(user)))
            .orElse(ResponseEntity.status(401).body(Map.of("error", "Unauthorized")));
    }

    @GetMapping("/config")
    public ResponseEntity<?> permissionConfig() {
        return currentUserService.currentUser()
            .filter(user -> currentUserService.canManageSettings())
            .map(user -> ResponseEntity.ok(permissionService.getPermissionConfig()))
            .orElse(forbidden());
    }

    @PatchMapping("/config")
    public ResponseEntity<?> updatePermissionConfig(@RequestBody Map<String, ?> body) {
        return currentUserService.currentUser()
            .filter(user -> currentUserService.canManageSettings())
            .map(user -> {
                Map<String, Object> updated = settingsService.updateSection("permissions", body);
                permissionService.syncActiveRoles();
                Map<String, Object> response = new LinkedHashMap<>();
                response.put("success", true);
                response.put("permissions", updated);
                response.put("config", permissionService.getPermissionConfig());
                return ResponseEntity.ok(response);
            })
            .orElse(forbidden());
    }

    private ResponseEntity<Map<String, Object>> forbidden() {
        return ResponseEntity.status(403).body(Map.of("error", "Permission denied: settings:manage required"));
    }
}
