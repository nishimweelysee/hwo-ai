package com.hwo.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "resource_stock_movement")
public class ResourceStockMovement {

    @Id
    private String id;
    private String resourceId;
    private String type;
    private int quantity;
    private int previousAvailable;
    private int newAvailable;
    private int previousInUse;
    private int newInUse;
    private String referenceId;
    private String notes;
    private String performedBy;
    private LocalDateTime createdAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getResourceId() { return resourceId; }
    public void setResourceId(String resourceId) { this.resourceId = resourceId; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }
    public int getPreviousAvailable() { return previousAvailable; }
    public void setPreviousAvailable(int previousAvailable) { this.previousAvailable = previousAvailable; }
    public int getNewAvailable() { return newAvailable; }
    public void setNewAvailable(int newAvailable) { this.newAvailable = newAvailable; }
    public int getPreviousInUse() { return previousInUse; }
    public void setPreviousInUse(int previousInUse) { this.previousInUse = previousInUse; }
    public int getNewInUse() { return newInUse; }
    public void setNewInUse(int newInUse) { this.newInUse = newInUse; }
    public String getReferenceId() { return referenceId; }
    public void setReferenceId(String referenceId) { this.referenceId = referenceId; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public String getPerformedBy() { return performedBy; }
    public void setPerformedBy(String performedBy) { this.performedBy = performedBy; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
