package com.hwo.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "resource")
public class Resource {

    @Id
    private String id;
    private String name;
    private String type;
    private int available;
    @Column(name = "in_use")
    private int inUse;
    @Column(name = "department_id")
    private String departmentId;
    private String sku;
    private String location;
    private String supplier;
    @Column(name = "reorder_level")
    private int reorderLevel;
    @Column(name = "unit_cost")
    private int unitCost;
    @Column(name = "maintenance_status")
    private String maintenanceStatus;
    private String notes;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public int getAvailable() { return available; }
    public void setAvailable(int available) { this.available = available; }
    public int getInUse() { return inUse; }
    public void setInUse(int inUse) { this.inUse = inUse; }
    public String getDepartmentId() { return departmentId; }
    public void setDepartmentId(String departmentId) { this.departmentId = departmentId; }
    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }
    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }
    public String getSupplier() { return supplier; }
    public void setSupplier(String supplier) { this.supplier = supplier; }
    public int getReorderLevel() { return reorderLevel; }
    public void setReorderLevel(int reorderLevel) { this.reorderLevel = reorderLevel; }
    public int getUnitCost() { return unitCost; }
    public void setUnitCost(int unitCost) { this.unitCost = unitCost; }
    public String getMaintenanceStatus() { return maintenanceStatus; }
    public void setMaintenanceStatus(String maintenanceStatus) { this.maintenanceStatus = maintenanceStatus; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
