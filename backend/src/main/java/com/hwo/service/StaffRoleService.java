package com.hwo.service;

import com.hwo.entity.StaffRole;
import com.hwo.repository.StaffRoleRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class StaffRoleService {

    private final StaffRoleRepository staffRoleRepository;

    public StaffRoleService(StaffRoleRepository staffRoleRepository) {
        this.staffRoleRepository = staffRoleRepository;
    }

    public List<StaffRole> getActiveRoles() {
        return staffRoleRepository.findByActiveTrueOrderByNameAsc();
    }

    public Optional<StaffRole> findByCodeOrName(String codeOrName) {
        if (codeOrName == null || codeOrName.isBlank()) return Optional.empty();
        return getActiveRoles().stream()
            .filter(r -> codeOrName.equalsIgnoreCase(r.getCode()) || codeOrName.equalsIgnoreCase(r.getName()))
            .findFirst();
    }

    public boolean isValidActiveRole(String codeOrName) {
        return findByCodeOrName(codeOrName).isPresent();
    }

    public String resolveRoleName(String codeOrName) {
        return findByCodeOrName(codeOrName)
            .map(StaffRole::getName)
            .orElse(codeOrName);
    }

    public void requireValidRole(String codeOrName) {
        if (!isValidActiveRole(codeOrName)) {
            throw new IllegalArgumentException("Invalid or inactive workforce role. Configure roles in Configuration.");
        }
    }

    public String defaultRoleName() {
        return getActiveRoles().stream()
            .map(StaffRole::getName)
            .findFirst()
            .orElse("Registered Nurse (RN)");
    }
}
