package com.hwo.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "compliance_record")
public class ComplianceRecord {

    @Id
    private String id;
    private String requirement;
    private String status;
    private String value;
    @Column(name = "record_type")
    private String recordType;
    private String category;
    @Column(name = "submission_id")
    private String submissionId;
    private String regulator;
    @Column(name = "submitted_by")
    private String submittedBy;
    @Column(columnDefinition = "TEXT")
    private String details;
    @Column(name = "recorded_at")
    private LocalDateTime recordedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getRequirement() { return requirement; }
    public void setRequirement(String requirement) { this.requirement = requirement; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }
    public String getRecordType() { return recordType; }
    public void setRecordType(String recordType) { this.recordType = recordType; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getSubmissionId() { return submissionId; }
    public void setSubmissionId(String submissionId) { this.submissionId = submissionId; }
    public String getRegulator() { return regulator; }
    public void setRegulator(String regulator) { this.regulator = regulator; }
    public String getSubmittedBy() { return submittedBy; }
    public void setSubmittedBy(String submittedBy) { this.submittedBy = submittedBy; }
    public String getDetails() { return details; }
    public void setDetails(String details) { this.details = details; }
    public LocalDateTime getRecordedAt() { return recordedAt; }
    public void setRecordedAt(LocalDateTime recordedAt) { this.recordedAt = recordedAt; }
}
