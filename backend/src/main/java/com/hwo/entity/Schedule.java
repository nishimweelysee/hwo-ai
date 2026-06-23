package com.hwo.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "schedule")
public class Schedule {

    @Id
    private String id;
    private String staffId;
    private String departmentId;
    private LocalDateTime date;
    private String shift;
    private String status;
    private boolean swapRequested;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "staffId", insertable = false, updatable = false)
    private Staff staff;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "departmentId", insertable = false, updatable = false)
    private Department department;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getStaffId() { return staffId; }
    public void setStaffId(String staffId) { this.staffId = staffId; }
    public String getDepartmentId() { return departmentId; }
    public void setDepartmentId(String departmentId) { this.departmentId = departmentId; }
    public LocalDateTime getDate() { return date; }
    public void setDate(LocalDateTime date) { this.date = date; }
    public String getShift() { return shift; }
    public void setShift(String shift) { this.shift = shift; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public boolean isSwapRequested() { return swapRequested; }
    public void setSwapRequested(boolean swapRequested) { this.swapRequested = swapRequested; }
    public Staff getStaff() { return staff; }
    public Department getDepartment() { return department; }
}
