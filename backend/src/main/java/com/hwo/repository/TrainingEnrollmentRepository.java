package com.hwo.repository;

import com.hwo.entity.TrainingEnrollment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TrainingEnrollmentRepository extends JpaRepository<TrainingEnrollment, String> {

    List<TrainingEnrollment> findByProgramId(String programId);

    List<TrainingEnrollment> findByStaffId(String staffId);

    long countByProgramIdAndStatus(String programId, String status);

    long countByStatus(String status);
}
