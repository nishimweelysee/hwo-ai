package com.hwo.controller;

import com.hwo.service.SchedulingService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api/scheduling")
public class SchedulingOverviewController {

    private final SchedulingService schedulingService;

    public SchedulingOverviewController(SchedulingService schedulingService) {
        this.schedulingService = schedulingService;
    }

    @GetMapping("/meta")
    public ResponseEntity<Map<String, Object>> meta() {
        return ResponseEntity.ok(schedulingService.getSchedulingMeta());
    }

    @GetMapping("/overview")
    public ResponseEntity<Map<String, Object>> overview(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        LocalDate d = date != null ? date : LocalDate.now();
        return ResponseEntity.ok(schedulingService.getDayOverview(d));
    }
}
