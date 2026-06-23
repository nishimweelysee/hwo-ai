package com.hwo.repository;

import com.hwo.entity.DataImport;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface DataImportRepository extends JpaRepository<DataImport, String> {

    List<DataImport> findAllByOrderByImportedAtDesc();

    List<DataImport> findByImportedAtBetweenOrderByImportedAtDesc(LocalDateTime start, LocalDateTime end);

    Optional<DataImport> findFirstByOrderByImportedAtDesc();
}
