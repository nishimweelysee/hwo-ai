package com.hwo.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "workload_record")
public class WorkloadRecord {

    @Id
    private String id;
    private String departmentId;
    private LocalDateTime date;
    private Integer hour;
    private double workload;
    private Integer patientVolume;
    @Column(name = "staff_on_duty")
    private Integer staffOnDuty;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "departmentId", insertable = false, updatable = false)
    private Department department;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getDepartmentId() { return departmentId; }
    public void setDepartmentId(String departmentId) { this.departmentId = departmentId; }
    public LocalDateTime getDate() { return date; }
    public void setDate(LocalDateTime date) { this.date = date; }
    public Integer getHour() { return hour; }
    public void setHour(Integer hour) { this.hour = hour; }
    public double getWorkload() { return workload; }
    public void setWorkload(double workload) { this.workload = workload; }
    public Integer getPatientVolume() { return patientVolume; }
    public void setPatientVolume(Integer patientVolume) { this.patientVolume = patientVolume; }
    public Integer getStaffOnDuty() { return staffOnDuty; }
    public void setStaffOnDuty(Integer staffOnDuty) { this.staffOnDuty = staffOnDuty; }
    public Department getDepartment() { return department; }
}
