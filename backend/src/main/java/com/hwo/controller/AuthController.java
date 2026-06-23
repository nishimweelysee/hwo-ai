package com.hwo.controller;

import com.hwo.entity.Department;
import com.hwo.entity.User;
import com.hwo.repository.DepartmentRepository;
import com.hwo.repository.UserRepository;
import com.hwo.security.JwtService;
import com.hwo.service.SettingsService;
import com.hwo.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final DepartmentRepository departmentRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final SettingsService settingsService;
    private final UserService userService;

    public AuthController(UserRepository userRepository,
                          DepartmentRepository departmentRepository,
                          PasswordEncoder passwordEncoder,
                          JwtService jwtService,
                          SettingsService settingsService,
                          UserService userService) {
        this.userRepository = userRepository;
        this.departmentRepository = departmentRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.settingsService = settingsService;
        this.userService = userService;
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
    public ResponseEntity<?> login(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        String password = body.get("password");
        if (email == null || password == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email and password required"));
        }
        return userRepository.findByEmail(email)
            .filter(User::isActive)
            .filter(u -> passwordEncoder.matches(password, u.getPassword()))
            .map(u -> authResponse(u))
            .orElse(ResponseEntity.status(401).body(Map.of("error", "Invalid credentials or account deactivated")));
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> body) {
        if (body.get("email") == null || body.get("password") == null || body.get("name") == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email, password, name required"));
        }
        try {
            User savedUser = userService.createUserEntity(new HashMap<>(body), false);
            return ResponseEntity.ok(authResponseBody(savedUser));
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
    public ResponseEntity<?> mobileLogin(@RequestBody Map<String, String> body) {
        return login(body);
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        if (email == null) return ResponseEntity.badRequest().body(Map.of("error", "Email required"));
        return ResponseEntity.ok(Map.of("message", "If the email exists, a reset link sent"));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody Map<String, String> body) {
        String token = body.get("token");
        String password = body.get("password");
        if (token == null || password == null) return ResponseEntity.badRequest().body(Map.of("error", "Token and password required"));
        return ResponseEntity.ok(Map.of("message", "Password reset"));
    }

    @PostMapping("/verify-email")
    public ResponseEntity<?> verifyEmail(@RequestBody Map<String, String> body) {
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
}
