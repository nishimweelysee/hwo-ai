package com.hwo.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "staff_role")
public class StaffRole {

    @Id
    private String id;
    private String name;
    private String code;
    private String category;
    private String description;
    @Column(nullable = true)
    private Boolean active = true;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public boolean isActive() { return active == null || active; }
    public void setActive(boolean active) { this.active = active; }
}
