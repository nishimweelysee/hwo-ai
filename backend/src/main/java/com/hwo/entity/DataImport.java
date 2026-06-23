package com.hwo.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "data_import")
public class DataImport {

    @Id
    private String id;
    private String filename;
    private String type;
    private int validCount;
    private int duplicateCount;
    private int errorCount;
    private int quality;
    private String status;
    @Column(name = "imported_by")
    private String importedBy;
    @Column(name = "error_details")
    private String errorDetails;
    @Column(name = "imported_at")
    private LocalDateTime importedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getFilename() { return filename; }
    public void setFilename(String filename) { this.filename = filename; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public int getValidCount() { return validCount; }
    public void setValidCount(int validCount) { this.validCount = validCount; }
    public int getDuplicateCount() { return duplicateCount; }
    public void setDuplicateCount(int duplicateCount) { this.duplicateCount = duplicateCount; }
    public int getErrorCount() { return errorCount; }
    public void setErrorCount(int errorCount) { this.errorCount = errorCount; }
    public int getQuality() { return quality; }
    public void setQuality(int quality) { this.quality = quality; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getImportedBy() { return importedBy; }
    public void setImportedBy(String importedBy) { this.importedBy = importedBy; }
    public String getErrorDetails() { return errorDetails; }
    public void setErrorDetails(String errorDetails) { this.errorDetails = errorDetails; }
    public LocalDateTime getImportedAt() { return importedAt; }
    public void setImportedAt(LocalDateTime importedAt) { this.importedAt = importedAt; }
}
