package com.hwo.repository;

import com.hwo.entity.MobilePushToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MobilePushTokenRepository extends JpaRepository<MobilePushToken, String> {

    Optional<MobilePushToken> findByToken(String token);

    List<MobilePushToken> findByUserId(String userId);

    void deleteByUserIdAndToken(String userId, String token);
}
