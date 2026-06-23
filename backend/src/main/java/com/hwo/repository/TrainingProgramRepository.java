package com.hwo.repository;

import com.hwo.entity.TrainingProgram;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TrainingProgramRepository extends JpaRepository<TrainingProgram, String> {

    List<TrainingProgram> findByActiveTrueOrderByNameAsc();

    List<TrainingProgram> findAllByOrderByNameAsc();
}
