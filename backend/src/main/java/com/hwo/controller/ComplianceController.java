package com.hwo.controller;

import com.hwo.service.ComplianceService;
import com.hwo.service.CurrentUserService;
import com.hwo.web.PermissionResponses;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/compliance")
public class ComplianceController {

    private final ComplianceService complianceService;
    private final CurrentUserService currentUserService;

    public ComplianceController(ComplianceService complianceService,
                                CurrentUserService currentUserService) {
        this.complianceService = complianceService;
        this.currentUserService = currentUserService;
    }

    @GetMapping("/overview")
    public ResponseEntity<Map<String, Object>> overview(
            @RequestParam(required = false) String recordType) {
        if (!currentUserService.canAccessMenu("compliance")) {
            return PermissionResponses.forbidden("compliance menu access");
        }
        return ResponseEntity.ok(complianceService.getOverview(
            currentUserService.canAccessMenu("compliance"), recordType));
    }

    @GetMapping("/meta")
    public ResponseEntity<Map<String, Object>> meta() {
        if (!currentUserService.canAccessMenu("compliance")) {
            return PermissionResponses.forbidden("compliance menu access");
        }
        return ResponseEntity.ok(complianceService.getMeta(currentUserService.canAccessMenu("compliance")));
    }

    @GetMapping({"", "/"})
    public ResponseEntity<Map<String, Object>> dashboard() {
        if (!currentUserService.canAccessMenu("compliance")) {
            return PermissionResponses.forbidden("compliance menu access");
        }
        return ResponseEntity.ok(complianceService.getDashboard());
    }

    @GetMapping("/templates")
    public ResponseEntity<Map<String, Object>> templates() {
        if (!currentUserService.canAccessMenu("compliance")) {
            return PermissionResponses.forbidden("compliance menu access");
        }
        return ResponseEntity.ok(Map.of("templates", complianceService.listTemplates()));
    }

    @GetMapping("/history")
    public ResponseEntity<?> history(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String recordType) {
        if (!currentUserService.canAccessMenu("compliance")) {
            return PermissionResponses.forbidden("compliance menu access");
        }
        return ResponseEntity.ok(complianceService.listHistory(startDate, endDate, recordType));
    }

    @PostMapping("/scan")
    public ResponseEntity<?> runScan() {
        if (!currentUserService.canAccessMenu("compliance")) {
            return PermissionResponses.forbidden("compliance menu access");
        }
        return ResponseEntity.ok(complianceService.runScan());
    }

    @PostMapping("/submit")
    public ResponseEntity<?> submit(@RequestBody Map<String, String> body) {
        if (!currentUserService.canAccessMenu("compliance")) {
            return PermissionResponses.forbidden("compliance menu access");
        }
        String submissionId = body.get("submissionId");
        String templateId = body.get("templateId");
        String submittedBy = currentUserService.currentUserId().orElse(null);
        return ResponseEntity.ok(complianceService.submitReport(submissionId, templateId, submittedBy));
    }

    @GetMapping("/export/{submissionId}")
    public ResponseEntity<?> export(@PathVariable String submissionId) {
        if (!currentUserService.canAccessMenu("compliance")) {
            return PermissionResponses.forbidden("compliance menu access");
        }
        String csv = complianceService.buildExportCsv(submissionId);
        String filename = submissionId + "_compliance_report.csv";
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
            .contentType(MediaType.parseMediaType("text/csv"))
            .body(csv);
    }
}
