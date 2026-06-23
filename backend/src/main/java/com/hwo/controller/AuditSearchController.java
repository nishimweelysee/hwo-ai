package com.hwo.controller;

import com.hwo.entity.AuditLog;
import com.hwo.repository.AuditLogRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/audit")
public class AuditSearchController {

    private final AuditLogRepository auditLogRepository;

    public AuditSearchController(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    @GetMapping("/search")
    public ResponseEntity<List<Map<String, Object>>> search(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "50") int limit) {
        List<AuditLog> logs;
        if (q != null && !q.trim().isEmpty()) {
            logs = auditLogRepository.findByActionContainingIgnoreCaseOrDetailsContainingIgnoreCaseOrderByCreatedAtDesc(q.trim(), q.trim(), PageRequest.of(0, limit));
        } else if (type != null) {
            logs = auditLogRepository.findByTypeOrderByCreatedAtDesc(type, PageRequest.of(0, limit));
        } else {
            logs = auditLogRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, limit));
        }
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("hh:mm a");
        List<Map<String, Object>> data = logs.stream()
            .map(l -> {
                Map<String, Object> m = new HashMap<>();
                m.put("id", l.getId());
                m.put("time", l.getCreatedAt() != null ? l.getCreatedAt().format(fmt) : "");
                m.put("user", l.getUser() != null ? l.getUser().getEmail() : "system");
                m.put("action", l.getAction());
                m.put("type", l.getType());
                m.put("resource", l.getResource());
                m.put("details", l.getDetails());
                return m;
            })
            .collect(Collectors.toList());
        return ResponseEntity.ok(data);
    }
}
