package com.hwo.repository;

import com.hwo.entity.StaffRole;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StaffRoleRepository extends JpaRepository<StaffRole, String> {
    List<StaffRole> findAllByOrderByNameAsc();
    List<StaffRole> findByActiveTrueOrderByNameAsc();
    boolean existsByNameIgnoreCase(String name);
    boolean existsByCodeIgnoreCase(String code);
}
