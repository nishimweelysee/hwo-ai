package com.hwo.service;

import com.hwo.entity.MobilePushToken;
import com.hwo.entity.User;
import com.hwo.repository.MobilePushTokenRepository;
import com.hwo.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.*;

@Service
public class PushNotificationService {

    private static final Logger log = LoggerFactory.getLogger(PushNotificationService.class);
    private static final String EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

    private final MobilePushTokenRepository pushTokenRepository;
    private final UserRepository userRepository;
    private final RestTemplate restTemplate;

    public PushNotificationService(MobilePushTokenRepository pushTokenRepository,
                                   UserRepository userRepository,
                                   RestTemplate restTemplate) {
        this.pushTokenRepository = pushTokenRepository;
        this.userRepository = userRepository;
        this.restTemplate = restTemplate;
    }

    @Transactional
    public Map<String, Object> registerToken(String userId, String token, String platform) {
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException("Push token is required");
        }
        MobilePushToken existing = pushTokenRepository.findByToken(token).orElse(null);
        if (existing != null) {
            existing.setUserId(userId);
            existing.setPlatform(platform != null ? platform : "unknown");
            existing.setUpdatedAt(LocalDateTime.now());
            pushTokenRepository.save(existing);
        } else {
            MobilePushToken row = new MobilePushToken();
            row.setId(UUID.randomUUID().toString());
            row.setUserId(userId);
            row.setToken(token);
            row.setPlatform(platform != null ? platform : "unknown");
            row.setUpdatedAt(LocalDateTime.now());
            pushTokenRepository.save(row);
        }
        return Map.of("success", true);
    }

    @Transactional
    public void unregisterToken(String userId, String token) {
        if (token != null && !token.isBlank()) {
            pushTokenRepository.deleteByUserIdAndToken(userId, token);
        }
    }

    public void notifyUser(String userId, String title, String body, Map<String, Object> data) {
        List<MobilePushToken> tokens = pushTokenRepository.findByUserId(userId);
        if (tokens.isEmpty()) return;
        sendExpoPush(tokens.stream().map(MobilePushToken::getToken).toList(), title, body, data);
    }

    public void notifyStaff(String staffId, String title, String body, Map<String, Object> data) {
        userRepository.findByStaffId(staffId).ifPresent(user -> notifyUser(user.getId(), title, body, data));
    }

    private void sendExpoPush(List<String> tokens, String title, String body, Map<String, Object> data) {
        if (tokens.isEmpty()) return;
        try {
            List<Map<String, Object>> messages = new ArrayList<>();
            for (String token : tokens) {
                Map<String, Object> message = new LinkedHashMap<>();
                message.put("to", token);
                message.put("title", title);
                message.put("body", body);
                message.put("sound", "default");
                if (data != null && !data.isEmpty()) {
                    message.put("data", data);
                }
                messages.add(message);
            }
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setAccept(List.of(MediaType.APPLICATION_JSON));
            restTemplate.postForEntity(EXPO_PUSH_URL, new HttpEntity<>(messages, headers), String.class);
        } catch (Exception ex) {
            log.warn("Failed to send Expo push notification: {}", ex.getMessage());
        }
    }
}
