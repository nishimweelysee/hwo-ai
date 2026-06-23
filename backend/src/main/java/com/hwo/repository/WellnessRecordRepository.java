package com.hwo.repository;

import com.hwo.entity.WellnessRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface WellnessRecordRepository extends JpaRepository<WellnessRecord, String> {

    List<WellnessRecord> findTop1ByStaffIdOrderByDateDesc(String staffId);

    List<WellnessRecord> findByStaffIdOrderByDateDesc(String staffId);

    List<WellnessRecord> findAllByOrderByDateDesc();

    long countByDateAfter(java.time.LocalDateTime date);

    @Query(value = """
        SELECT w.* FROM wellness_record w
        INNER JOIN (
            SELECT staff_id, MAX(date) AS max_date
            FROM wellness_record
            GROUP BY staff_id
        ) latest ON w.staff_id = latest.staff_id AND w.date = latest.max_date
        """, nativeQuery = true)
    List<WellnessRecord> findLatestPerStaff();

    @Query("SELECT w FROM WellnessRecord w LEFT JOIN FETCH w.staff s LEFT JOIN FETCH s.department")
    List<WellnessRecord> findAllWithStaffAndDepartment();
}
