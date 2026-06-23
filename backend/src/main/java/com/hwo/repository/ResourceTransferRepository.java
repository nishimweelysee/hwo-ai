package com.hwo.repository;

import com.hwo.entity.ResourceTransfer;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ResourceTransferRepository extends JpaRepository<ResourceTransfer, String> {

    List<ResourceTransfer> findAllByOrderByCreatedAtDesc();
}
