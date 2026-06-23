package com.hwo.controller;

import com.hwo.service.CurrentUserService;
import com.hwo.service.PushNotificationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/mobile")
public class MobilePushController {

    private final PushNotificationService pushNotificationService;
    private final CurrentUserService currentUserService;

    public MobilePushController(PushNotificationService pushNotificationService,
                                  CurrentUserService currentUserService) {
        this.pushNotificationService = pushNotificationService;
        this.currentUserService = currentUserService;
    }

    @PostMapping("/push-token")
    public ResponseEntity<Map<String, Object>> registerPushToken(@RequestBody Map<String, String> body) {
        String userId = currentUserService.currentUserId()
            .orElseThrow(() -> new IllegalArgumentException("Sign in required"));
        return ResponseEntity.ok(pushNotificationService.registerToken(
            userId,
            body.get("token"),
            body.get("platform")
        ));
    }

    @DeleteMapping("/push-token")
    public ResponseEntity<Map<String, Object>> unregisterPushToken(@RequestBody Map<String, String> body) {
        String userId = currentUserService.currentUserId()
            .orElseThrow(() -> new IllegalArgumentException("Sign in required"));
        pushNotificationService.unregisterToken(userId, body.get("token"));
        return ResponseEntity.ok(Map.of("success", true));
    }
}
