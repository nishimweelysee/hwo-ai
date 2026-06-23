package com.hwo.controller;

import com.hwo.service.ResourceService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/resources")
public class ResourceController {

    private final ResourceService resourceService;

    public ResourceController(ResourceService resourceService) {
        this.resourceService = resourceService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getResources() {
        return ResponseEntity.ok(resourceService.getDashboard());
    }

    @GetMapping("/meta")
    public ResponseEntity<Map<String, Object>> getMeta() {
        return ResponseEntity.ok(resourceService.getMeta());
    }

    @GetMapping("/inventory")
    public ResponseEntity<List<Map<String, Object>>> listInventory(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String departmentId) {
        return ResponseEntity.ok(resourceService.listInventory(search, type, departmentId));
    }

    @GetMapping("/inventory/export")
    public ResponseEntity<String> exportInventory() {
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=inventory.csv")
            .contentType(MediaType.parseMediaType("text/csv"))
            .body(resourceService.exportInventoryCsv());
    }

    @GetMapping("/inventory/{id}")
    public ResponseEntity<Map<String, Object>> getInventoryItem(@PathVariable String id) {
        return ResponseEntity.ok(resourceService.getInventoryItem(id));
    }

    @GetMapping("/reorder-suggestions")
    public ResponseEntity<List<Map<String, Object>>> reorderSuggestions() {
        return ResponseEntity.ok(resourceService.getReorderSuggestions());
    }

    @GetMapping("/ai/health")
    public ResponseEntity<Map<String, Object>> aiHealth() {
        return ResponseEntity.ok(resourceService.getAiHealth());
    }

    @GetMapping("/ai/demand/{id}")
    public ResponseEntity<Map<String, Object>> demandForecast(@PathVariable String id) {
        return ResponseEntity.ok(resourceService.getDemandForecast(id));
    }

    @GetMapping("/movements")
    public ResponseEntity<List<Map<String, Object>>> getMovements(
            @RequestParam(required = false) String resourceId) {
        return ResponseEntity.ok(resourceService.listMovements(resourceId));
    }

    @PostMapping("/inventory")
    public ResponseEntity<Map<String, Object>> createInventory(@RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(resourceService.createResource(body));
    }

    @PatchMapping("/inventory/{id}")
    public ResponseEntity<Map<String, Object>> updateInventory(
            @PathVariable String id,
            @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(resourceService.updateResource(id, body));
    }

    @DeleteMapping("/inventory/{id}")
    public ResponseEntity<Map<String, Object>> deleteInventory(@PathVariable String id) {
        resourceService.deleteResource(id);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/inventory/{id}/adjust")
    public ResponseEntity<Map<String, Object>> adjustInventory(
            @PathVariable String id,
            @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(resourceService.adjustStock(id, body));
    }

    @PostMapping("/transfers")
    public ResponseEntity<Map<String, Object>> createTransfer(@RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(resourceService.createTransfer(body));
    }

    @PatchMapping("/transfers/{id}")
    public ResponseEntity<Map<String, Object>> updateTransfer(
            @PathVariable String id,
            @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(resourceService.updateTransfer(id, body));
    }

    @DeleteMapping("/transfers/{id}")
    public ResponseEntity<Map<String, Object>> deleteTransfer(@PathVariable String id) {
        resourceService.deleteTransfer(id);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/procurement")
    public ResponseEntity<Map<String, Object>> createProcurement(@RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(resourceService.createProcurement(body));
    }

    @PostMapping("/procurement/from-suggestions")
    public ResponseEntity<List<Map<String, Object>>> createProcurementFromSuggestions(
            @RequestBody(required = false) Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<String> resourceIds = body != null && body.get("resourceIds") instanceof List<?> list
            ? (List<String>) list
            : List.of();
        return ResponseEntity.ok(resourceService.createProcurementFromSuggestions(resourceIds));
    }

    @PatchMapping("/procurement/{id}")
    public ResponseEntity<Map<String, Object>> updateProcurement(
            @PathVariable String id,
            @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(resourceService.updateProcurement(id, body));
    }

    @DeleteMapping("/procurement/{id}")
    public ResponseEntity<Map<String, Object>> deleteProcurement(@PathVariable String id) {
        resourceService.deleteProcurement(id);
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
