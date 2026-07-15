package com.hwo.controller;

import com.hwo.entity.AuditLog;
import com.hwo.entity.Department;
import com.hwo.entity.User;
import com.hwo.repository.AuditLogRepository;
import com.hwo.repository.DepartmentRepository;
import com.hwo.repository.UserRepository;
import com.hwo.security.JwtService;
import com.hwo.service.LoginAttemptService;
import com.hwo.service.OtpService;
import com.hwo.service.SettingsService;
import com.hwo.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final DepartmentRepository departmentRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final SettingsService settingsService;
    private final UserService userService;
    private final OtpService otpService;
    private final LoginAttemptService loginAttemptService;
    private final AuditLogRepository auditLogRepository;

    public AuthController(UserRepository userRepository,
                          DepartmentRepository departmentRepository,
                          PasswordEncoder passwordEncoder,
                          JwtService jwtService,
                          SettingsService settingsService,
                          UserService userService,
                          OtpService otpService,
                          LoginAttemptService loginAttemptService,
                          AuditLogRepository auditLogRepository) {
        this.userRepository      = userRepository;
        this.departmentRepository = departmentRepository;
        this.passwordEncoder     = passwordEncoder;
        this.jwtService          = jwtService;
        this.settingsService     = settingsService;
        this.userService         = userService;
        this.otpService          = otpService;
        this.loginAttemptService = loginAttemptService;
        this.auditLogRepository  = auditLogRepository;
    }

    @GetMapping("/registration-config")
    public ResponseEntity<Map<String, Object>> registrationConfig() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("organization", settingsService.getSection("organization"));
        body.put("userRoles", settingsService.getSection("userRoles"));
        body.put("departments", departmentRepository.findAllOrderByName().stream()
            .filter(Department::isActive)
            .map(d -> {
                Map<String, String> m = new LinkedHashMap<>();
                m.put("id", d.getId());
                m.put("name", d.getName());
                m.put("code", d.getCode() != null ? d.getCode() : "");
                return m;
            })
            .toList());
        body.put("shiftTypes", settingsService.getShiftTypes());
        return ResponseEntity.ok(body);
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body,
                                   HttpServletRequest request) {
        String email    = body.get("email");
        String password = body.get("password");
        if (email == null || password == null)
            return ResponseEntity.badRequest().body(Map.of("error", "Email and password required"));

        String ip = getClientIp(request);

        // Rate limit check
        if (loginAttemptService.isLoginBlocked(ip, email)) {
            long wait = loginAttemptService.secondsUntilLoginUnlock(ip, email);
            audit(null, "LOGIN_BLOCKED", "AUTH",
                  "Too many failed attempts for " + email + " from " + ip, ip);
            return ResponseEntity.status(429).body(Map.of(
                "error", "Too many failed attempts. Try again in " + (wait / 60 + 1) + " minute(s)."));
        }

        var userOpt = userRepository.findByEmail(email.toLowerCase().trim())
            .filter(User::isActive)
            .filter(u -> passwordEncoder.matches(password, u.getPassword()));

        if (userOpt.isEmpty()) {
            loginAttemptService.recordFailedLogin(ip, email);
            audit(null, "LOGIN_FAILED", "AUTH", "Failed login attempt for " + email, ip);
            return ResponseEntity.status(401).body(Map.of("error", "Invalid credentials or account deactivated"));
        }

        User u = userOpt.get();
        loginAttemptService.resetLoginAttempts(ip, email);
        audit(u.getId(), "LOGIN", "AUTH", "Successful login for " + email, ip);
        return authResponse(u);
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> body,
                                      HttpServletRequest request) {
        if (body.get("email") == null || body.get("password") == null || body.get("name") == null)
            return ResponseEntity.badRequest().body(Map.of("error", "Email, password, name required"));

        // Password strength validation
        String pwError = validatePassword(body.get("password"));
        if (pwError != null)
            return ResponseEntity.badRequest().body(Map.of("error", pwError));

        try {
            User savedUser = userService.createUserEntity(new HashMap<>(body), false);
            String ip = getClientIp(request);
            audit(savedUser.getId(), "REGISTER", "AUTH", "New account: " + savedUser.getEmail(), ip);

            // Send email verification OTP
            otpService.generateAndSend(savedUser.getEmail(), "EMAIL_VERIFY");

            Map<String, Object> resp = authResponseBody(savedUser);
            resp.put("emailVerificationSent", true);
            return ResponseEntity.ok(resp);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/session")
    public ResponseEntity<?> session(@RequestHeader(value = "Authorization", required = false) String auth) {
        if (auth == null || !auth.startsWith("Bearer ")) {
            return ResponseEntity.ok(noSessionResponse());
        }
        String token = auth.substring(7);
        var claims = jwtService.validateToken(token);
        if (claims == null) return ResponseEntity.ok(noSessionResponse());
        String userId = claims.getSubject();
        return userRepository.findById(userId)
            .map(u -> {
                Map<String, Object> body = new HashMap<>();
                body.put("user", userService.toSessionMap(u));
                return ResponseEntity.ok(body);
            })
            .orElse(ResponseEntity.ok(noSessionResponse()));
    }

    @PostMapping("/signout")
    public ResponseEntity<?> signout() {
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/mobile-login")
    public ResponseEntity<?> mobileLogin(@RequestBody Map<String, String> body,
                                         HttpServletRequest request) {
        return login(body, request);
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody Map<String, String> body,
                                            HttpServletRequest request) {
        String email = body.get("email");
        if (email == null || email.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "Email required"));

        String ip = getClientIp(request);

        // Check OTP rate limit before looking up the user
        if (loginAttemptService.isOtpBlocked(email, "PASSWORD_RESET")) {
            long wait = loginAttemptService.secondsUntilOtpUnlock(email, "PASSWORD_RESET");
            return ResponseEntity.status(429).body(Map.of(
                "error", "Too many code requests. Try again in " + (wait / 60 + 1) + " minute(s)."));
        }

        userRepository.findByEmail(email.toLowerCase().trim())
                .filter(User::isActive)
                .ifPresent(u -> {
                    boolean sent = otpService.generateAndSend(u.getEmail(), "PASSWORD_RESET");
                    if (sent) audit(u.getId(), "PASSWORD_RESET_REQUESTED", "AUTH",
                                    "Reset code sent to " + u.getEmail(), ip);
                });

        return ResponseEntity.ok(Map.of("message", "If the email exists, a reset code has been sent"));
    }

    @PostMapping("/verify-otp")
    public ResponseEntity<?> verifyOtp(@RequestBody Map<String, String> body) {
        String email   = body.get("email");
        String code    = body.get("code");
        String purpose = body.getOrDefault("purpose", "PASSWORD_RESET");

        if (email == null || code == null)
            return ResponseEntity.badRequest().body(Map.of("error", "Email and code required"));

        boolean valid = otpService.validate(email, code, purpose);
        if (!valid)
            return ResponseEntity.status(400).body(Map.of("error", "Invalid or expired code"));

        return ResponseEntity.ok(Map.of("valid", true));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody Map<String, String> body,
                                           HttpServletRequest request) {
        String email    = body.get("email");
        String code     = body.get("code");
        String password = body.get("password");

        if (email == null || code == null || password == null)
            return ResponseEntity.badRequest().body(Map.of("error", "Email, code, and password required"));

        String pwError = validatePassword(password);
        if (pwError != null)
            return ResponseEntity.badRequest().body(Map.of("error", pwError));

        boolean valid = otpService.validate(email, code, "PASSWORD_RESET");
        if (!valid)
            return ResponseEntity.status(400).body(Map.of("error", "Invalid or expired code"));

        return userRepository.findByEmail(email.toLowerCase().trim())
                .map(u -> {
                    u.setPassword(passwordEncoder.encode(password));
                    userRepository.save(u);
                    audit(u.getId(), "PASSWORD_RESET", "AUTH",
                          "Password reset for " + u.getEmail(), getClientIp(request));
                    return ResponseEntity.ok(Map.of("message", "Password updated successfully"));
                })
                .orElse(ResponseEntity.status(404).body(Map.of("error", "Account not found")));
    }

    @PostMapping("/send-verification")
    public ResponseEntity<?> sendVerification(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        if (email == null || email.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "Email required"));

        if (loginAttemptService.isOtpBlocked(email, "EMAIL_VERIFY")) {
            long wait = loginAttemptService.secondsUntilOtpUnlock(email, "EMAIL_VERIFY");
            return ResponseEntity.status(429).body(Map.of(
                "error", "Too many code requests. Try again in " + (wait / 60 + 1) + " minute(s)."));
        }

        userRepository.findByEmail(email.toLowerCase().trim())
                .filter(User::isActive)
                .ifPresent(u -> otpService.generateAndSend(u.getEmail(), "EMAIL_VERIFY"));

        return ResponseEntity.ok(Map.of("message", "Verification code sent"));
    }

    @PostMapping("/verify-email")
    public ResponseEntity<?> verifyEmail(@RequestBody Map<String, String> body,
                                         HttpServletRequest request) {
        String email = body.get("email");
        String code  = body.get("code");

        if (email == null || code == null)
            return ResponseEntity.badRequest().body(Map.of("error", "Email and code required"));

        boolean valid = otpService.validate(email, code, "EMAIL_VERIFY");
        if (!valid)
            return ResponseEntity.status(400).body(Map.of("error", "Invalid or expired code"));

        userRepository.findByEmail(email.toLowerCase().trim())
                .ifPresent(u -> audit(u.getId(), "EMAIL_VERIFIED", "AUTH",
                                      "Email verified: " + u.getEmail(), getClientIp(request)));

        return ResponseEntity.ok(Map.of("verified", true));
    }

    private ResponseEntity<Map<String, Object>> authResponse(User user) {
        return ResponseEntity.ok(authResponseBody(user));
    }

    private Map<String, Object> authResponseBody(User user) {
        Map<String, Object> response = new HashMap<>();
        response.put("token", jwtService.createToken(user.getId(), user.getEmail()));
        response.put("user", userService.toSessionMap(user));
        return response;
    }

    private Map<String, Object> noSessionResponse() {
        Map<String, Object> body = new HashMap<>();
        body.put("user", null);
        return body;
    }

    /** Validate password strength. Returns error message or null if OK. */
    private String validatePassword(String password) {
        if (password == null || password.length() < 8)
            return "Password must be at least 8 characters";
        if (!password.matches(".*[A-Z].*"))
            return "Password must contain at least one uppercase letter";
        if (!password.matches(".*[0-9].*"))
            return "Password must contain at least one number";
        return null;
    }

    /** Write an audit log entry for auth events. */
    private void audit(String userId, String action, String type, String details, String ip) {
        try {
            AuditLog entry = new AuditLog();
            entry.setId(UUID.randomUUID().toString());
            entry.setUserId(userId);
            entry.setAction(action);
            entry.setType(type);
            entry.setResource("AUTH");
            entry.setDetails(details);
            entry.setIpAddress(ip);
            entry.setCreatedAt(LocalDateTime.now());
            auditLogRepository.save(entry);
        } catch (Exception ignored) { /* never fail a request due to audit logging */ }
    }

    /** Extract real client IP, handling proxies. */
    private String getClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
        return request.getRemoteAddr();
    }
}
