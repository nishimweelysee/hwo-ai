package com.hwo.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "app_setting")
public class AppSetting {

    @Id
    private String key;

    @Column(columnDefinition = "TEXT")
    private String value;

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }
    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }
}
