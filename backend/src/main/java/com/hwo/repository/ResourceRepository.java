package com.hwo.repository;

import com.hwo.entity.Resource;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ResourceRepository extends JpaRepository<Resource, String> {

    Optional<Resource> findByDepartmentIdAndName(String departmentId, String name);

    List<Resource> findByName(String name);
}
