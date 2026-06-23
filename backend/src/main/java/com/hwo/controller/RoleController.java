package com.hwo.controller;

import com.hwo.entity.StaffRole;
import com.hwo.repository.StaffRepository;
import com.hwo.repository.StaffRoleRepository;
import com.hwo.service.CurrentUserService;
import com.hwo.web.PermissionResponses;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/roles")
public class RoleController {

    private final StaffRoleRepository staffRoleRepository;
    private final StaffRepository staffRepository;
    private final CurrentUserService currentUserService;

    public RoleController(StaffRoleRepository staffRoleRepository, StaffRepository staffRepository,
                          CurrentUserService currentUserService) {
        this.staffRoleRepository = staffRoleRepository;
        this.staffRepository = staffRepository;
        this.currentUserService = currentUserService;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> listRoles(
            @RequestParam(required = false, defaultValue = "false") boolean activeOnly) {
        List<StaffRole> roles = activeOnly
            ? staffRoleRepository.findByActiveTrueOrderByNameAsc()
            : staffRoleRepository.findAllByOrderByNameAsc();
        return ResponseEntity.ok(roles.stream().map(this::toMap).collect(Collectors.toList()));
    }

    @PostMapping
    public ResponseEntity<?> createRole(@RequestBody Map<String, ?> body) {
        if (!currentUserService.canManageSettings()) {
            return PermissionResponses.settingsRequired();
        }
        String name = stringValue(body.get("name"));
        if (name == null || name.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Role name is required"));
        }
        if (staffRoleRepository.existsByNameIgnoreCase(name.trim())) {
            return ResponseEntity.badRequest().body(Map.of("error", "Role name already exists"));
        }
        String code = resolveCode(body, name);
        if (staffRoleRepository.existsByCodeIgnoreCase(code)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Role code already exists"));
        }

        StaffRole role = new StaffRole();
        role.setId(UUID.randomUUID().toString());
        role.setName(name.trim());
        role.setCode(code);
        role.setCategory(stringValue(body.get("category")) != null ? stringValue(body.get("category")) : "clinical");
        role.setDescription(stringValue(body.get("description")));
        role.setActive(body.get("active") == null || Boolean.parseBoolean(String.valueOf(body.get("active"))));
        staffRoleRepository.save(role);
        return ResponseEntity.ok(toMap(role));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> updateRole(@PathVariable String id, @RequestBody Map<String, ?> body) {
        if (!currentUserService.canManageSettings()) {
            return PermissionResponses.settingsRequired();
        }
        return staffRoleRepository.findById(id)
            .map(role -> {
                if (body.containsKey("name")) {
                    String name = stringValue(body.get("name"));
                    if (name == null || name.isBlank()) {
                        return ResponseEntity.badRequest().body(Map.of("error", "Role name is required"));
                    }
                    role.setName(name.trim());
                }
                if (body.containsKey("code")) {
                    role.setCode(stringValue(body.get("code")));
                }
                if (body.containsKey("category")) {
                    role.setCategory(stringValue(body.get("category")));
                }
                if (body.containsKey("description")) {
                    role.setDescription(stringValue(body.get("description")));
                }
                if (body.containsKey("active")) {
                    role.setActive(Boolean.parseBoolean(String.valueOf(body.get("active"))));
                }
                staffRoleRepository.save(role);
                return ResponseEntity.ok(toMap(role));
            })
            .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteRole(@PathVariable String id) {
        if (!currentUserService.canManageSettings()) {
            return PermissionResponses.settingsRequired();
        }
        return staffRoleRepository.findById(id)
            .map(role -> {
                long assigned = staffRepository.countByRole(role.getName());
                if (assigned == 0 && role.getCode() != null) {
                    assigned = staffRepository.countByRole(role.getCode());
                }
                if (assigned > 0) {
                    return ResponseEntity.badRequest().body(Map.of(
                        "error", "Cannot delete role assigned to staff",
                        "staffCount", assigned
                    ));
                }
                staffRoleRepository.delete(role);
                return ResponseEntity.ok(Map.of("success", true));
            })
            .orElse(ResponseEntity.notFound().build());
    }

    private Map<String, Object> toMap(StaffRole role) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", role.getId());
        map.put("name", role.getName());
        map.put("code", role.getCode() != null ? role.getCode() : "");
        map.put("category", role.getCategory() != null ? role.getCategory() : "clinical");
        map.put("description", role.getDescription() != null ? role.getDescription() : "");
        map.put("active", role.isActive());
        map.put("staffCount", staffRepository.countByRole(role.getName()));
        return map;
    }

    private String resolveCode(Map<String, ?> body, String name) {
        String code = stringValue(body.get("code"));
        if (code != null && !code.isBlank()) {
            return code.trim().toUpperCase();
        }
        String normalized = name.replaceAll("[^A-Za-z0-9]", "");
        if (normalized.isEmpty()) {
            return "ROLE";
        }
        return normalized.toUpperCase().substring(0, Math.min(8, normalized.length()));
    }

    private String stringValue(Object value) {
        return value == null ? null : String.valueOf(value);
    }
}
