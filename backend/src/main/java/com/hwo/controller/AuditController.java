package com.hwo.controller;

import com.hwo.entity.AuditLog;
import com.hwo.entity.User;
import com.hwo.repository.AuditLogRepository;
import com.hwo.service.CurrentUserService;
import com.hwo.web.PermissionResponses;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/audit")
public class AuditController {

    private final AuditLogRepository auditLogRepository;
    private final CurrentUserService currentUserService;

    public AuditController(AuditLogRepository auditLogRepository, CurrentUserService currentUserService) {
        this.auditLogRepository = auditLogRepository;
        this.currentUserService = currentUserService;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getLogs(
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "50") int limit) {
        List<AuditLog> logs = type != null
            ? auditLogRepository.findByTypeOrderByCreatedAtDesc(type, PageRequest.of(0, limit))
            : auditLogRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, Math.min(limit, 50)));
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("hh:mm a");
        List<Map<String, Object>> data = logs.stream()
            .map(l -> {
                Map<String, Object> m = new HashMap<>();
                m.put("id", l.getId());
                m.put("time", l.getCreatedAt() != null ? l.getCreatedAt().format(fmt) : "");
                m.put("user", l.getUser() != null ? l.getUser().getEmail() : "system");
                m.put("action", l.getAction());
                m.put("type", l.getType());
                return m;
            })
            .collect(Collectors.toList());
        return ResponseEntity.ok(data);
    }

    @PostMapping
    public ResponseEntity<?> createLog(@RequestBody Map<String, String> body) {
        if (!currentUserService.canManageSettings()) {
            return PermissionResponses.settingsRequired();
        }
        AuditLog log = new AuditLog();
        log.setId(UUID.randomUUID().toString());
        log.setUserId(body.get("userId"));
        log.setAction(body.getOrDefault("action", ""));
        log.setType(body.getOrDefault("type", "read"));
        log.setResource(body.get("resource"));
        log.setDetails(body.get("details"));
        log.setCreatedAt(LocalDateTime.now());
        auditLogRepository.save(log);
        return ResponseEntity.ok(Map.of("status", "created"));
    }
}
