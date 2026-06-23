package com.hwo.controller;

import com.hwo.service.PredictionService;
import com.hwo.service.CurrentUserService;
import com.hwo.web.PermissionResponses;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class PredictionsController {

    private final PredictionService predictionService;
    private final CurrentUserService currentUserService;

    public PredictionsController(PredictionService predictionService, CurrentUserService currentUserService) {
        this.predictionService = predictionService;
        this.currentUserService = currentUserService;
    }

    @GetMapping("/predictions")
    public ResponseEntity<Map<String, Object>> getPredictions(@RequestParam(required = false) String modelId) {
        return ResponseEntity.ok(predictionService.getPredictions(modelId));
    }

    @PostMapping("/predictions/retrain")
    public ResponseEntity<?> trainPredictions() {
        if (!currentUserService.canManageSettings()) {
            return PermissionResponses.settingsRequired();
        }
        try {
            return ResponseEntity.ok(predictionService.trainAllModels());
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Training failed: " + e.getMessage()));
        }
    }

    @GetMapping("/predictions/models")
    public ResponseEntity<Map<String, Object>> predictionModels() {
        return ResponseEntity.ok(predictionService.listModels());
    }

    @GetMapping("/predictions/compare")
    public ResponseEntity<?> comparePredictions(@RequestParam String modelA, @RequestParam String modelB) {
        try {
            return ResponseEntity.ok(predictionService.compareModels(modelA, modelB));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/predictions/health")
    public ResponseEntity<Map<String, Object>> predictionHealth() {
        return ResponseEntity.ok(predictionService.getModelHealth());
    }

    @GetMapping("/predictions/export")
    public ResponseEntity<String> exportPredictions(@RequestParam(required = false) String modelId) {
        String csv = predictionService.exportPredictions(modelId);
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"predictions-export.csv\"")
            .contentType(MediaType.parseMediaType("text/csv"))
            .body(csv);
    }
}
