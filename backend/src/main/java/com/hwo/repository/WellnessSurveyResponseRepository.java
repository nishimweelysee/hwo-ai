package com.hwo.repository;

import com.hwo.entity.WellnessSurveyResponse;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;

public interface WellnessSurveyResponseRepository extends JpaRepository<WellnessSurveyResponse, String> {

    long countDistinctStaffIdBySubmittedAtAfter(LocalDateTime since);

    long countDistinctSessionIdBySubmittedAtAfter(LocalDateTime since);
}
