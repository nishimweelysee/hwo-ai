package com.hwo.repository;

import com.hwo.entity.Department;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface DepartmentRepository extends JpaRepository<Department, String> {

    @Query("SELECT d FROM Department d ORDER BY d.name")
    List<Department> findAllOrderByName();

    java.util.Optional<Department> findByCodeIgnoreCase(String code);
}
