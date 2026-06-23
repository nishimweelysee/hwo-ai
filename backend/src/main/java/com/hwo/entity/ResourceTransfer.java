package com.hwo.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "resource_transfer")
public class ResourceTransfer {

    @Id
    private String id;
    private String resourceId;
    private String fromDepartmentId;
    private String toDepartmentId;
    private int quantity;
    private String status;
    private String requestedBy;
    private String notes;
    private LocalDateTime createdAt;
    private LocalDateTime completedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getResourceId() { return resourceId; }
    public void setResourceId(String resourceId) { this.resourceId = resourceId; }
    public String getFromDepartmentId() { return fromDepartmentId; }
    public void setFromDepartmentId(String fromDepartmentId) { this.fromDepartmentId = fromDepartmentId; }
    public String getToDepartmentId() { return toDepartmentId; }
    public void setToDepartmentId(String toDepartmentId) { this.toDepartmentId = toDepartmentId; }
    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getRequestedBy() { return requestedBy; }
    public void setRequestedBy(String requestedBy) { this.requestedBy = requestedBy; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(LocalDateTime completedAt) { this.completedAt = completedAt; }
}
