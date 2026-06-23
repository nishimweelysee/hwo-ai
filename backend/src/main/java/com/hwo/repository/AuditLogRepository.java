package com.hwo.repository;

import com.hwo.entity.AuditLog;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface AuditLogRepository extends JpaRepository<AuditLog, String> {

    @Query("SELECT a FROM AuditLog a LEFT JOIN FETCH a.user ORDER BY a.createdAt DESC")
    List<AuditLog> findAllByOrderByCreatedAtDesc(Pageable pageable);

    @Query("SELECT a FROM AuditLog a LEFT JOIN FETCH a.user WHERE a.type = ?1 ORDER BY a.createdAt DESC")
    List<AuditLog> findByTypeOrderByCreatedAtDesc(String type, Pageable pageable);

    List<AuditLog> findByActionContainingIgnoreCaseOrDetailsContainingIgnoreCaseOrderByCreatedAtDesc(String action, String details, Pageable pageable);

    long countByType(String type);
}
