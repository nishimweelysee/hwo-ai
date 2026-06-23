package com.hwo.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "wellness_record")
public class WellnessRecord {

    @Id
    private String id;
    private String staffId;
    private LocalDateTime date;
    private double overtime;
    private String riskLevel;
    private Double score;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "staffId", insertable = false, updatable = false)
    private Staff staff;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getStaffId() { return staffId; }
    public void setStaffId(String staffId) { this.staffId = staffId; }
    public LocalDateTime getDate() { return date; }
    public void setDate(LocalDateTime date) { this.date = date; }
    public double getOvertime() { return overtime; }
    public void setOvertime(double overtime) { this.overtime = overtime; }
    public String getRiskLevel() { return riskLevel; }
    public void setRiskLevel(String riskLevel) { this.riskLevel = riskLevel; }
    public Double getScore() { return score; }
    public void setScore(Double score) { this.score = score; }
    public Staff getStaff() { return staff; }
}
