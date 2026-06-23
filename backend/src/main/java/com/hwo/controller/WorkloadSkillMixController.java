package com.hwo.controller;

import com.hwo.repository.StaffRepository;
import com.hwo.repository.StaffRoleRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/workload")
public class WorkloadSkillMixController {

    private final StaffRoleRepository staffRoleRepository;
    private final StaffRepository staffRepository;

    public WorkloadSkillMixController(StaffRoleRepository staffRoleRepository, StaffRepository staffRepository) {
        this.staffRoleRepository = staffRoleRepository;
        this.staffRepository = staffRepository;
    }

    @GetMapping("/skill-mix")
    public ResponseEntity<List<Map<String, Object>>> getSkillMix() {
        List<Map<String, Object>> data = staffRoleRepository.findByActiveTrueOrderByNameAsc().stream()
            .map(role -> {
                long byName = staffRepository.countByRole(role.getName());
                long byCode = role.getCode() != null && !role.getCode().isBlank()
                    ? staffRepository.countByRole(role.getCode()) : 0;
                // Staff store either role name or code — sum both naming conventions.
                long count = byName + byCode;
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("role", role.getName());
                row.put("code", role.getCode());
                row.put("category", role.getCategory());
                row.put("count", count);
                return row;
            })
            .filter(row -> ((Number) row.get("count")).longValue() > 0)
            .collect(Collectors.toList());
        return ResponseEntity.ok(data);
    }
}
