package com.hwo.repository;

import com.hwo.entity.Certification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

public interface CertificationRepository extends JpaRepository<Certification, String> {

    List<Certification> findByStaffId(String staffId);

    List<Certification> findByStaffIdIn(Collection<String> staffIds);
    long countByStatusAndExpiryDateBetween(String status, LocalDateTime start, LocalDateTime end);
    long countByStatusAndExpiryDateBefore(String status, LocalDateTime before);
}
