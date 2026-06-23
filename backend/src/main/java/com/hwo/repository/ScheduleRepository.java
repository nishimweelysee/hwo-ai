package com.hwo.repository;

import com.hwo.entity.Schedule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface ScheduleRepository extends JpaRepository<Schedule, String> {

    List<Schedule> findByDateBetween(LocalDateTime start, LocalDateTime end);

    @Query("""
        SELECT DISTINCT s FROM Schedule s
        LEFT JOIN FETCH s.staff st
        LEFT JOIN FETCH st.department
        LEFT JOIN FETCH s.department
        WHERE s.date >= :start AND s.date < :end
        """)
    List<Schedule> findDaySchedulesWithDetails(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    List<Schedule> findByStaffIdAndDateBetween(String staffId, LocalDateTime start, LocalDateTime end);

    long countByStaffIdAndDateBetween(String staffId, LocalDateTime start, LocalDateTime end);
}
