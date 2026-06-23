package com.hwo.controller;

import com.hwo.service.CurrentUserService;
import com.hwo.service.WellnessService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/wellness")
public class WellnessController {

    private final WellnessService wellnessService;
    private final CurrentUserService currentUserService;

    public WellnessController(WellnessService wellnessService, CurrentUserService currentUserService) {
        this.wellnessService = wellnessService;
        this.currentUserService = currentUserService;
    }

    @GetMapping("/ai/health")
    public ResponseEntity<Map<String, Object>> aiHealth() {
        return ResponseEntity.ok(wellnessService.getAiHealth());
    }

    @GetMapping("/ai/model-info")
    public ResponseEntity<Map<String, Object>> aiModelInfo() {
        return ResponseEntity.ok(wellnessService.getBurnoutModelInfo());
    }

    @GetMapping("/ai/risk/{staffId}")
    public ResponseEntity<Map<String, Object>> predictRisk(@PathVariable String staffId) {
        return ResponseEntity.ok(wellnessService.predictStaffRisk(staffId));
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getWellness() {
        return ResponseEntity.ok(wellnessService.getWellnessSummary());
    }

    @GetMapping("/staff/{staffId}/shifts")
    public ResponseEntity<?> staffWeekShifts(@PathVariable String staffId) {
        try {
            return ResponseEntity.ok(wellnessService.getStaffRollingWeekShifts(staffId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getStats() {
        return ResponseEntity.ok(wellnessService.getWellnessStats());
    }

    @GetMapping("/meta")
    public ResponseEntity<Map<String, Object>> wellnessMeta() {
        return ResponseEntity.ok(wellnessService.getWellnessMeta());
    }

    @GetMapping("/survey")
    public ResponseEntity<Map<String, Object>> wellnessSurvey() {
        return ResponseEntity.ok(Map.of("questions", wellnessService.getSurveyQuestions()));
    }

    @PostMapping("/survey")
    public ResponseEntity<?> submitWellnessSurvey(@RequestBody Map<String, ?> body) {
        String userId = currentUserService.currentUserId()
            .orElseThrow(() -> new IllegalArgumentException("Unauthorized"));
        return ResponseEntity.ok(wellnessService.submitSurvey(userId, body));
    }

    @PostMapping("/checkin")
    public ResponseEntity<?> wellnessCheckin(@RequestBody Map<String, ?> body) {
        String userId = currentUserService.currentUserId()
            .orElseThrow(() -> new IllegalArgumentException("Unauthorized"));
        return ResponseEntity.ok(wellnessService.submitCheckin(userId, body));
    }

    @PostMapping("/feedback")
    public ResponseEntity<?> wellnessFeedback(@RequestBody Map<String, ?> body) {
        String userId = currentUserService.currentUserId().orElse("anonymous");
        return ResponseEntity.ok(wellnessService.submitFeedback(userId, body));
    }

    @GetMapping("/feedback")
    public ResponseEntity<List<Map<String, Object>>> listFeedback() {
        return ResponseEntity.ok(wellnessService.listFeedback());
    }

    @DeleteMapping("/feedback/{id}")
    public ResponseEntity<?> deleteFeedback(@PathVariable String id) {
        wellnessService.deleteFeedback(id);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @GetMapping("/records")
    public ResponseEntity<List<Map<String, Object>>> listRecords(
            @RequestParam(required = false) String staffId) {
        return ResponseEntity.ok(wellnessService.listRecords(staffId));
    }

    @GetMapping("/records/{id}")
    public ResponseEntity<Map<String, Object>> getRecord(@PathVariable String id) {
        return ResponseEntity.ok(wellnessService.getRecord(id));
    }

    @PostMapping("/records")
    public ResponseEntity<Map<String, Object>> createRecord(@RequestBody Map<String, ?> body) {
        return ResponseEntity.ok(wellnessService.createRecord(body));
    }

    @PutMapping("/records/{id}")
    public ResponseEntity<Map<String, Object>> updateRecord(
            @PathVariable String id, @RequestBody Map<String, ?> body) {
        return ResponseEntity.ok(wellnessService.updateRecord(id, body));
    }

    @DeleteMapping("/records/{id}")
    public ResponseEntity<?> deleteRecord(@PathVariable String id) {
        wellnessService.deleteRecord(id);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @GetMapping("/interventions")
    public ResponseEntity<List<Map<String, Object>>> listInterventions(
            @RequestParam(required = false) String staffId) {
        return ResponseEntity.ok(wellnessService.listInterventions(staffId));
    }

    @PostMapping("/interventions")
    public ResponseEntity<Map<String, Object>> createIntervention(@RequestBody Map<String, ?> body) {
        return ResponseEntity.ok(wellnessService.createIntervention(body));
    }

    @PutMapping("/interventions/{id}")
    public ResponseEntity<Map<String, Object>> updateIntervention(
            @PathVariable String id, @RequestBody Map<String, ?> body) {
        return ResponseEntity.ok(wellnessService.updateIntervention(id, body));
    }

    @PatchMapping("/interventions/{id}/complete")
    public ResponseEntity<Map<String, Object>> completeIntervention(@PathVariable String id) {
        return ResponseEntity.ok(wellnessService.completeIntervention(id));
    }

    @DeleteMapping("/interventions/{id}")
    public ResponseEntity<?> deleteIntervention(@PathVariable String id) {
        wellnessService.deleteIntervention(id);
        return ResponseEntity.ok(Map.of("success", true));
    }
}
