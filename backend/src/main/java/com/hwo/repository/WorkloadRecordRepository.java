package com.hwo.repository;

import com.hwo.entity.WorkloadRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface WorkloadRecordRepository extends JpaRepository<WorkloadRecord, String> {

    List<WorkloadRecord> findAllByOrderByDateAsc();

    @Query("SELECT w FROM WorkloadRecord w LEFT JOIN FETCH w.department ORDER BY w.date ASC")
    List<WorkloadRecord> findAllWithDepartment();

    /** Records within a date window — used for trend calculations to avoid full-table scans. */
    @Query("SELECT w FROM WorkloadRecord w WHERE w.date >= :start AND w.date < :end")
    List<WorkloadRecord> findByDateRange(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    boolean existsByDepartmentIdAndDate(String departmentId, java.time.LocalDateTime date);
}
