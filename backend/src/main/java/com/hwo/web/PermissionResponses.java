package com.hwo.web;

import org.springframework.http.ResponseEntity;

import java.util.Map;

public final class PermissionResponses {

    private PermissionResponses() {}

    public static ResponseEntity<Map<String, Object>> forbidden(String permission) {
        return ResponseEntity.status(403).body(Map.of("error", "Permission denied: " + permission + " required"));
    }

    public static ResponseEntity<Map<String, Object>> settingsRequired() {
        return forbidden("settings:manage");
    }

    public static ResponseEntity<Map<String, Object>> dataManageRequired() {
        return forbidden("data:manage");
    }

    public static ResponseEntity<Map<String, Object>> auditExportRequired() {
        return forbidden("audit:export");
    }

    public static ResponseEntity<Map<String, Object>> usersManageRequired() {
        return forbidden("users:manage");
    }
}
