package com.hwo.repository;

import com.hwo.entity.PredictionModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PredictionModelRepository extends JpaRepository<PredictionModel, String> {

    List<PredictionModel> findAllByOrderByLastTrainedDesc();

    Optional<PredictionModel> findFirstByScopeAndGranularityAndActiveTrue(String scope, String granularity);

    Optional<PredictionModel> findFirstByDepartmentIdAndGranularityAndActiveTrue(String departmentId, String granularity);

    List<PredictionModel> findByScopeAndGranularityAndActiveTrue(String scope, String granularity);

    List<PredictionModel> findByScopeOrderByLastTrainedDesc(String scope);

    List<PredictionModel> findByActiveTrue();

    List<PredictionModel> findByDepartmentIdAndGranularityAndActiveTrue(String departmentId, String granularity);
}
