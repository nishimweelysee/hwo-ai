package com.hwo.repository;

import com.hwo.entity.WorkloadRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface WorkloadRecordRepository extends JpaRepository<WorkloadRecord, String> {

    List<WorkloadRecord> findAllByOrderByDateAsc();

    @Query("SELECT w FROM WorkloadRecord w LEFT JOIN FETCH w.department ORDER BY w.date ASC")
    List<WorkloadRecord> findAllWithDepartment();

    boolean existsByDepartmentIdAndDate(String departmentId, java.time.LocalDateTime date);
}
