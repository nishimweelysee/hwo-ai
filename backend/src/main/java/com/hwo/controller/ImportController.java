package com.hwo.controller;

import com.hwo.service.ImportService;
import com.hwo.service.CurrentUserService;
import com.hwo.web.PermissionResponses;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/import")
public class ImportController {

    private final ImportService importService;
    private final CurrentUserService currentUserService;

    public ImportController(ImportService importService, CurrentUserService currentUserService) {
        this.importService = importService;
        this.currentUserService = currentUserService;
    }

    @GetMapping("/templates")
    public ResponseEntity<List<Map<String, Object>>> listTemplates() {
        return ResponseEntity.ok(importService.listTemplateMetadata());
    }

    @GetMapping("/meta")
    public ResponseEntity<Map<String, Object>> importMeta() {
        return ResponseEntity.ok(importService.getMeta());
    }

    @GetMapping("/history")
    public ResponseEntity<List<Map<String, Object>>> importHistory(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return ResponseEntity.ok(importService.listImportHistory(startDate, endDate));
    }

    @GetMapping("/samples/{type}")
    public ResponseEntity<String> downloadSample(
            @PathVariable String type,
            @RequestParam(defaultValue = "20000") int rows) {
        try {
            String csv = importService.generateBulkSampleCsv(type, rows);
            if (csv == null) {
                return ResponseEntity.notFound().build();
            }
            String filename = type + "_sample_" + rows + ".csv";
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(csv);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @GetMapping("/templates/{type}")
    public ResponseEntity<String> downloadTemplate(@PathVariable String type) {
        String csv = importService.buildTemplateCsv(type);
        if (csv == null) {
            return ResponseEntity.notFound().build();
        }
        String filename = type + "_import_template.csv";
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
            .contentType(MediaType.parseMediaType("text/csv"))
            .body(csv);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> importData(
            @RequestParam("file") MultipartFile file,
            @RequestParam("type") String type) {
        if (!currentUserService.canManageData()) {
            return PermissionResponses.dataManageRequired();
        }
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "File is required"));
        }
        try {
            Map<String, Object> result = importService.importFile(file, type);
            if (result.containsKey("error")) {
                return ResponseEntity.badRequest().body(result);
            }
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Import failed: " + e.getMessage()));
        }
    }
}
