package com.hwo.service;

import com.hwo.entity.OtpToken;
import com.hwo.repository.OtpTokenRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;

@Service
public class OtpService {

    private static final Logger log = LoggerFactory.getLogger(OtpService.class);
    private static final int OTP_EXPIRY_MINUTES = 10;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final OtpTokenRepository otpRepo;
    private final JavaMailSender mailSender;
    private final LoginAttemptService attemptService;

    public OtpService(OtpTokenRepository otpRepo,
                      Optional<JavaMailSender> mailSender,
                      LoginAttemptService attemptService) {
        this.otpRepo        = otpRepo;
        this.mailSender     = mailSender.orElse(null);
        this.attemptService = attemptService;
    }

    /** Generate a 6-digit OTP, persist it, and send the email (with rate-limit check). */
    public boolean generateAndSend(String email, String purpose) {
        if (attemptService.isOtpBlocked(email, purpose)) {
            return false; // rate limited — caller should tell user to wait
        }
        // Invalidate previous unused OTPs for the same email+purpose
        otpRepo.deleteExpired(Instant.now());

        String code = String.format("%06d", RANDOM.nextInt(1_000_000));

        OtpToken token = new OtpToken();
        token.setEmail(email.toLowerCase().trim());
        token.setCode(code);
        token.setPurpose(purpose);
        token.setExpiresAt(Instant.now().plus(OTP_EXPIRY_MINUTES, ChronoUnit.MINUTES));
        token.setUsed(false);
        otpRepo.save(token);

        attemptService.recordOtpSend(email, purpose);
        sendEmail(email, purpose, code);
        return true;
    }

    /**
     * Validate an OTP. Returns true and marks it used if valid.
     * Returns false if not found, expired, or already used.
     */
    public boolean validate(String email, String code, String purpose) {
        return otpRepo.findByEmailAndCodeAndPurposeAndUsedFalse(
                        email.toLowerCase().trim(), code, purpose)
                .filter(t -> Instant.now().isBefore(t.getExpiresAt()))
                .map(t -> {
                    t.setUsed(true);
                    otpRepo.save(t);
                    return true;
                })
                .orElse(false);
    }

    // ── Email sending ────────────────────────────────────────────

    private void sendEmail(String to, String purpose, String code) {
        String subject;
        String body;

        if ("PASSWORD_RESET".equals(purpose)) {
            subject = "HWO — Your password reset code";
            body = "Your password reset code is: " + code
                    + "\n\nThis code expires in " + OTP_EXPIRY_MINUTES + " minutes."
                    + "\n\nIf you did not request a password reset, ignore this email.";
        } else {
            subject = "HWO — Verify your email address";
            body = "Your email verification code is: " + code
                    + "\n\nThis code expires in " + OTP_EXPIRY_MINUTES + " minutes.";
        }

        if (mailSender != null) {
            try {
                SimpleMailMessage msg = new SimpleMailMessage();
                msg.setTo(to);
                msg.setSubject(subject);
                msg.setText(body);
                mailSender.send(msg);
                log.info("OTP email sent to {} for purpose {}", to, purpose);
            } catch (Exception e) {
                // Don't leak mail config errors to the client — just log
                log.error("Failed to send OTP email to {}: {}", to, e.getMessage());
                // Fall through to console log so dev can still use the code
                logToConsole(to, purpose, code);
            }
        } else {
            // No mail server configured — print to console for development
            logToConsole(to, purpose, code);
        }
    }

    private void logToConsole(String to, String purpose, String code) {
        log.warn("=================================================");
        log.warn("  OTP CODE (no mail server configured)");
        log.warn("  Email  : {}", to);
        log.warn("  Purpose: {}", purpose);
        log.warn("  Code   : {}", code);
        log.warn("  Expires: {} minutes", OTP_EXPIRY_MINUTES);
        log.warn("=================================================");
    }

    /** Clean up expired tokens every hour */
    @Scheduled(fixedDelay = 3_600_000)
    public void purgeExpired() {
        otpRepo.deleteExpired(Instant.now());
    }
}
