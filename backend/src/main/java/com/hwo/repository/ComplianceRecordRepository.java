package com.hwo.repository;

import com.hwo.entity.ComplianceRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface ComplianceRecordRepository extends JpaRepository<ComplianceRecord, String> {

    List<ComplianceRecord> findTop20ByOrderByRecordedAtDesc();

    Optional<ComplianceRecord> findFirstByRecordTypeOrderByRecordedAtDesc(String recordType);

    List<ComplianceRecord> findByRecordTypeOrderByRecordedAtDesc(String recordType);

    List<ComplianceRecord> findByRecordedAtBetweenOrderByRecordedAtDesc(LocalDateTime start, LocalDateTime end);

    List<ComplianceRecord> findByRecordTypeAndRecordedAtBetweenOrderByRecordedAtDesc(
        String recordType, LocalDateTime start, LocalDateTime end);

    long countByRecordTypeAndStatus(String recordType, String status);

    Optional<ComplianceRecord> findFirstBySubmissionIdOrderByRecordedAtDesc(String submissionId);
}
