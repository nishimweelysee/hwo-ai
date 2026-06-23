package com.hwo.repository;

import com.hwo.entity.ResourceStockMovement;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ResourceStockMovementRepository extends JpaRepository<ResourceStockMovement, String> {

    List<ResourceStockMovement> findByResourceIdOrderByCreatedAtDesc(String resourceId);

    List<ResourceStockMovement> findAllByOrderByCreatedAtDesc();
}
