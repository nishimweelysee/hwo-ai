package com.hwo.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "prediction_model")
public class PredictionModel {

    @Id
    private String id;
    private String name;
    private String type;
    private Double accuracy;
    private Double mae;
    private Double rmse;
    private Double r2;
    private LocalDateTime lastTrained;
    private String departmentId;
    private String scope;
    private String granularity;
    private String version;
    private boolean active;
    private Integer trainingDataPoints;
    private Integer horizon;

    @Column(columnDefinition = "TEXT")
    private String config;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public Double getAccuracy() { return accuracy; }
    public void setAccuracy(Double accuracy) { this.accuracy = accuracy; }
    public Double getMae() { return mae; }
    public void setMae(Double mae) { this.mae = mae; }
    public Double getRmse() { return rmse; }
    public void setRmse(Double rmse) { this.rmse = rmse; }
    public Double getR2() { return r2; }
    public void setR2(Double r2) { this.r2 = r2; }
    public LocalDateTime getLastTrained() { return lastTrained; }
    public void setLastTrained(LocalDateTime lastTrained) { this.lastTrained = lastTrained; }
    public String getDepartmentId() { return departmentId; }
    public void setDepartmentId(String departmentId) { this.departmentId = departmentId; }
    public String getScope() { return scope; }
    public void setScope(String scope) { this.scope = scope; }
    public String getGranularity() { return granularity; }
    public void setGranularity(String granularity) { this.granularity = granularity; }
    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public Integer getTrainingDataPoints() { return trainingDataPoints; }
    public void setTrainingDataPoints(Integer trainingDataPoints) { this.trainingDataPoints = trainingDataPoints; }
    public Integer getHorizon() { return horizon; }
    public void setHorizon(Integer horizon) { this.horizon = horizon; }
    public String getConfig() { return config; }
    public void setConfig(String config) { this.config = config; }
}
