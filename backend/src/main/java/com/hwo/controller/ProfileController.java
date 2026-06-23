package com.hwo.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hwo.entity.User;
import com.hwo.entity.UserProfile;
import com.hwo.repository.UserRepository;
import com.hwo.repository.UserProfileRepository;
import com.hwo.service.CurrentUserService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api")
public class ProfileController {

    private final UserRepository userRepository;
    private final UserProfileRepository userProfileRepository;
    private final CurrentUserService currentUserService;
    private final ObjectMapper objectMapper;
    private final PasswordEncoder passwordEncoder;

    public ProfileController(UserRepository userRepository,
                             UserProfileRepository userProfileRepository,
                             CurrentUserService currentUserService,
                             ObjectMapper objectMapper,
                             PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.userProfileRepository = userProfileRepository;
        this.currentUserService = currentUserService;
        this.objectMapper = objectMapper;
        this.passwordEncoder = passwordEncoder;
    }

    @GetMapping("/profile")
    public ResponseEntity<?> getProfile() {
        Optional<User> userOpt = currentUserService.currentUser();
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }
        User u = userOpt.get();
        Optional<UserProfile> profile = userProfileRepository.findByUserId(u.getId());
        Map<String, Object> result = new HashMap<>();
        result.put("id", u.getId());
        result.put("email", u.getEmail());
        result.put("name", u.getName());
        result.put("role", u.getRole());
        result.put("organization", u.getOrganization());
        profile.ifPresent(p -> {
            result.put("phone", p.getPhone());
            result.put("department", p.getDepartment());
            result.put("preferences", parsePreferences(p.getPreferences()));
        });
        return ResponseEntity.ok(result);
    }

    @PatchMapping("/profile")
    public ResponseEntity<?> updateProfile(@RequestBody Map<String, Object> body) {
        Optional<String> userIdOpt = currentUserService.currentUserId();
        if (userIdOpt.isEmpty()) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }
        String userId = userIdOpt.get();
        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        User u = userOpt.get();
        if (body.get("name") != null) u.setName(String.valueOf(body.get("name")).trim());
        if (body.get("password") != null) {
            String password = String.valueOf(body.get("password"));
            if (!password.isBlank()) {
                u.setPassword(passwordEncoder.encode(password));
            }
        }
        userRepository.save(u);
        Optional<UserProfile> profileOpt = userProfileRepository.findByUserId(userId);
        if (body.get("phone") != null || body.get("department") != null || body.get("preferences") != null) {
            UserProfile p = profileOpt.orElseGet(() -> {
                UserProfile np = new UserProfile();
                np.setId(java.util.UUID.randomUUID().toString());
                np.setUserId(userId);
                np.setUpdatedAt(java.time.LocalDateTime.now());
                return np;
            });
            if (body.get("phone") != null) p.setPhone(String.valueOf(body.get("phone")));
            if (body.get("department") != null) p.setDepartment(String.valueOf(body.get("department")));
            if (body.get("preferences") != null) {
                try {
                    p.setPreferences(objectMapper.writeValueAsString(body.get("preferences")));
                } catch (Exception e) {
                    return ResponseEntity.badRequest().body(Map.of("error", "Invalid preferences format"));
                }
            }
            p.setUpdatedAt(java.time.LocalDateTime.now());
            userProfileRepository.save(p);
        }
        return ResponseEntity.ok(Map.of("success", true));
    }

    private Object parsePreferences(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return objectMapper.readValue(raw, new TypeReference<Map<String, Object>>() {});
        } catch (Exception ignored) {
            return raw;
        }
    }
}
