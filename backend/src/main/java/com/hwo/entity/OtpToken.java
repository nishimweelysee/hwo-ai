package com.hwo.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "otp_tokens")
public class OtpToken {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    /** The email address this OTP was issued for */
    @Column(nullable = false)
    private String email;

    /** 6-digit OTP code */
    @Column(nullable = false)
    private String code;

    /**
     * Purpose: "PASSWORD_RESET" or "EMAIL_VERIFY"
     */
    @Column(nullable = false)
    private String purpose;

    /** When this OTP expires (10 minutes from creation) */
    @Column(nullable = false)
    private Instant expiresAt;

    /** Whether this OTP has already been used */
    private boolean used = false;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getPurpose() { return purpose; }
    public void setPurpose(String purpose) { this.purpose = purpose; }

    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }

    public boolean isUsed() { return used; }
    public void setUsed(boolean used) { this.used = used; }
}
