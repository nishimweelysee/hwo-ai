package com.hwo.repository;

import com.hwo.entity.GeneratedReport;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface GeneratedReportRepository extends JpaRepository<GeneratedReport, String> {

    List<GeneratedReport> findTop20ByOrderByCreatedAtDesc();
}
