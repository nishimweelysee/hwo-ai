package com.hwo.repository;

import com.hwo.entity.OtpToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

public interface OtpTokenRepository extends JpaRepository<OtpToken, String> {

    Optional<OtpToken> findByEmailAndCodeAndPurposeAndUsedFalse(
            String email, String code, String purpose);

    /** Clean up expired tokens */
    @Modifying
    @Transactional
    @Query("DELETE FROM OtpToken o WHERE o.expiresAt < :now")
    void deleteExpired(Instant now);
}
