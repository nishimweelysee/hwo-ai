package com.hwo.repository;

import com.hwo.entity.OnCallSchedule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface OnCallScheduleRepository extends JpaRepository<OnCallSchedule, String> {

    List<OnCallSchedule> findByDateBetween(LocalDateTime start, LocalDateTime end);
}
