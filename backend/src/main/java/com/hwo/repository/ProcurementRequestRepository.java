package com.hwo.repository;

import com.hwo.entity.ProcurementRequest;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProcurementRequestRepository extends JpaRepository<ProcurementRequest, String> {

    List<ProcurementRequest> findAllByOrderByCreatedAtDesc();
}
