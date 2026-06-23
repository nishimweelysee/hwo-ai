package com.hwo.repository;

import com.hwo.entity.WellnessIntervention;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface WellnessInterventionRepository extends JpaRepository<WellnessIntervention, String> {

    List<WellnessIntervention> findAllByOrderByRecommendedAtDesc();

    List<WellnessIntervention> findByStaffIdOrderByRecommendedAtDesc(String staffId);

    List<WellnessIntervention> findByStaffIdIsNullOrderByRecommendedAtDesc();
}
