package com.hwo.repository;

import com.hwo.entity.ScheduledReport;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ScheduledReportRepository extends JpaRepository<ScheduledReport, String> {
}
