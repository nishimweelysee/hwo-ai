package com.hwo.repository;

import com.hwo.entity.WellnessFeedback;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface WellnessFeedbackRepository extends JpaRepository<WellnessFeedback, String> {

    List<WellnessFeedback> findAllByOrderByCreatedAtDesc();

    long countByCreatedAtAfter(java.time.LocalDateTime date);
}
