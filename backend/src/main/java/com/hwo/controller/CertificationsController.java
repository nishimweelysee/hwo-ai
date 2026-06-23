package com.hwo.controller;

import com.hwo.service.SkillService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/certifications")
public class CertificationsController {

    private final SkillService skillService;

    public CertificationsController(SkillService skillService) {
        this.skillService = skillService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getCertifications() {
        return ResponseEntity.ok(skillService.getDashboard());
    }

    @GetMapping("/meta")
    public ResponseEntity<Map<String, Object>> getMeta() {
        return ResponseEntity.ok(skillService.getMeta());
    }

    @GetMapping("/list")
    public ResponseEntity<List<Map<String, Object>>> listCertifications(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String departmentId) {
        return ResponseEntity.ok(skillService.listCertifications(search, status, departmentId));
    }

    @GetMapping("/export")
    public ResponseEntity<String> exportCertifications() {
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=certifications.csv")
            .contentType(MediaType.parseMediaType("text/csv"))
            .body(skillService.exportCertificationsCsv());
    }

    @GetMapping("/ai/health")
    public ResponseEntity<Map<String, Object>> aiHealth() {
        return ResponseEntity.ok(skillService.getAiHealth());
    }

    @GetMapping("/ai/development/{staffId}")
    public ResponseEntity<Map<String, Object>> staffDevelopment(@PathVariable String staffId) {
        return ResponseEntity.ok(skillService.getStaffDevelopment(staffId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getCertification(@PathVariable String id) {
        return ResponseEntity.ok(skillService.getCertification(id));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> createCertification(@RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(skillService.createCertification(body));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<Map<String, Object>> updateCertification(
            @PathVariable String id,
            @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(skillService.updateCertification(id, body));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deleteCertification(@PathVariable String id) {
        skillService.deleteCertification(id);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @GetMapping("/programs")
    public ResponseEntity<List<Map<String, Object>>> listPrograms() {
        return ResponseEntity.ok(skillService.listDevelopmentPrograms());
    }

    @PostMapping("/programs")
    public ResponseEntity<Map<String, Object>> createProgram(@RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(skillService.createProgram(body));
    }

    @PatchMapping("/programs/{id}")
    public ResponseEntity<Map<String, Object>> updateProgram(
            @PathVariable String id,
            @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(skillService.updateProgram(id, body));
    }

    @DeleteMapping("/programs/{id}")
    public ResponseEntity<Map<String, Object>> deleteProgram(@PathVariable String id) {
        skillService.deleteProgram(id);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/enrollments")
    public ResponseEntity<Map<String, Object>> enrollStaff(@RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(skillService.enrollStaff(body));
    }

    @PatchMapping("/enrollments/{id}/complete")
    public ResponseEntity<Map<String, Object>> completeEnrollment(@PathVariable String id) {
        return ResponseEntity.ok(skillService.completeEnrollment(id));
    }

    @DeleteMapping("/enrollments/{id}")
    public ResponseEntity<Map<String, Object>> deleteEnrollment(@PathVariable String id) {
        skillService.deleteEnrollment(id);
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
