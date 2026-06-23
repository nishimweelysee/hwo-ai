package com.hwo.controller;

import com.hwo.service.CurrentUserService;
import com.hwo.service.SettingsService;
import com.hwo.web.PermissionResponses;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/settings")
public class ConfigurationController {

    private final SettingsService settingsService;
    private final CurrentUserService currentUserService;

    public ConfigurationController(SettingsService settingsService, CurrentUserService currentUserService) {
        this.settingsService = settingsService;
        this.currentUserService = currentUserService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getAllSettings() {
        return ResponseEntity.ok(settingsService.getAll());
    }

    @GetMapping("/{section}")
    public ResponseEntity<?> getSection(@PathVariable String section) {
        if (!settingsService.isValidSection(section)) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(settingsService.getSection(section));
    }

    @PatchMapping("/{section}")
    public ResponseEntity<Map<String, Object>> updateSection(
            @PathVariable String section,
            @RequestBody Map<String, ?> body) {
        if (!currentUserService.canManageSettings()) {
            return PermissionResponses.settingsRequired();
        }
        if (!settingsService.isValidSection(section)) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", "Unknown settings section: " + section);
            return ResponseEntity.badRequest().body(error);
        }
        Map<String, Object> updated = settingsService.updateSection(section, body);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("settings", updated);
        return ResponseEntity.ok(response);
    }
}
