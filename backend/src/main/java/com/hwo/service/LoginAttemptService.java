package com.hwo.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory rate limiter for login attempts.
 * Tracks per-IP and per-email failed attempts.
 * Lockout after MAX_ATTEMPTS within the window.
 */
@Service
public class LoginAttemptService {

    private static final int  MAX_ATTEMPTS    = 5;
    private static final long WINDOW_MS       = 15 * 60 * 1000L; // 15 minutes
    private static final int  MAX_OTP_SENDS   = 3;
    private static final long OTP_WINDOW_MS   = 10 * 60 * 1000L; // 10 minutes

    // key → [attemptCount, windowStartMs]
    private final Map<String, long[]> loginAttempts = new ConcurrentHashMap<>();
    private final Map<String, long[]> otpSends      = new ConcurrentHashMap<>();

    // ── Login attempt tracking ────────────────────────────────────

    public boolean isLoginBlocked(String ip, String email) {
        return isBlocked(loginAttempts, ipKey(ip), MAX_ATTEMPTS, WINDOW_MS)
            || isBlocked(loginAttempts, emailKey(email), MAX_ATTEMPTS, WINDOW_MS);
    }

    public void recordFailedLogin(String ip, String email) {
        increment(loginAttempts, ipKey(ip), WINDOW_MS);
        increment(loginAttempts, emailKey(email), WINDOW_MS);
    }

    public void resetLoginAttempts(String ip, String email) {
        loginAttempts.remove(ipKey(ip));
        loginAttempts.remove(emailKey(email));
    }

    public long secondsUntilLoginUnlock(String ip, String email) {
        return Math.max(
            secondsUntilUnlock(loginAttempts, ipKey(ip), WINDOW_MS),
            secondsUntilUnlock(loginAttempts, emailKey(email), WINDOW_MS)
        );
    }

    // ── OTP resend rate limiting ──────────────────────────────────

    public boolean isOtpBlocked(String email, String purpose) {
        return isBlocked(otpSends, otpKey(email, purpose), MAX_OTP_SENDS, OTP_WINDOW_MS);
    }

    public void recordOtpSend(String email, String purpose) {
        increment(otpSends, otpKey(email, purpose), OTP_WINDOW_MS);
    }

    public long secondsUntilOtpUnlock(String email, String purpose) {
        return secondsUntilUnlock(otpSends, otpKey(email, purpose), OTP_WINDOW_MS);
    }

    // ── Internals ─────────────────────────────────────────────────

    private boolean isBlocked(Map<String, long[]> map, String key, int max, long windowMs) {
        long[] entry = map.get(key);
        if (entry == null) return false;
        long count = entry[0], windowStart = entry[1];
        if (Instant.now().toEpochMilli() - windowStart > windowMs) {
            map.remove(key);
            return false;
        }
        return count >= max;
    }

    private void increment(Map<String, long[]> map, String key, long windowMs) {
        long now = Instant.now().toEpochMilli();
        map.compute(key, (k, entry) -> {
            if (entry == null || now - entry[1] > windowMs) {
                return new long[]{1, now};
            }
            entry[0]++;
            return entry;
        });
    }

    private long secondsUntilUnlock(Map<String, long[]> map, String key, long windowMs) {
        long[] entry = map.get(key);
        if (entry == null) return 0;
        long elapsed = Instant.now().toEpochMilli() - entry[1];
        long remaining = windowMs - elapsed;
        return remaining > 0 ? (remaining / 1000) : 0;
    }

    private String ipKey(String ip)    { return "IP:" + ip; }
    private String emailKey(String e)  { return "EMAIL:" + e; }
    private String otpKey(String e, String p) { return "OTP:" + p + ":" + e; }

    /** Purge stale entries every 30 minutes */
    @Scheduled(fixedDelay = 1_800_000)
    public void purgeStale() {
        long now = Instant.now().toEpochMilli();
        loginAttempts.entrySet().removeIf(e -> now - e.getValue()[1] > WINDOW_MS);
        otpSends.entrySet().removeIf(e -> now - e.getValue()[1] > OTP_WINDOW_MS);
    }
}
