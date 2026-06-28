package com.hwo.controller;

import com.hwo.entity.WorkloadRecord;
import com.hwo.service.WorkloadChartService;
import com.hwo.service.WorkloadQueryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class WorkloadController {

    private final WorkloadQueryService workloadQueryService;
    private final WorkloadChartService workloadChartService;

    public WorkloadController(WorkloadQueryService workloadQueryService,
                              WorkloadChartService workloadChartService) {
        this.workloadQueryService = workloadQueryService;
        this.workloadChartService = workloadChartService;
    }

    @GetMapping("/workload")
    public ResponseEntity<?> getWorkload(@RequestParam(defaultValue = "byHour") String type) {
        if ("charts".equals(type)) {
            return ResponseEntity.ok(workloadChartService.buildCharts());
        }

        List<WorkloadRecord> records = workloadQueryService.findAllOrdered();

        if ("byHour".equals(type)) {
            return ResponseEntity.ok(workloadChartService.buildByHour(records));
        }

        if ("trend".equals(type)) {
            return ResponseEntity.ok(workloadChartService.buildTrend(records));
        }

        return ResponseEntity.ok(List.of());
    }
}
