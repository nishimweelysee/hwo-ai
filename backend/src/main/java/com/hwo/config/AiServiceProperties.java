package com.hwo.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "ai.service")
public class AiServiceProperties {

    private String url = "http://localhost:8000";
    /** Connect timeout for AI service HTTP calls (ms). */
    private int connectTimeoutMs = 5_000;
    /** Read timeout for AI service HTTP calls (ms). Training can take several minutes on large data. */
    private int readTimeoutMs = 300_000;
    /**
     * Read timeout for interactive AI calls (health, predict, forecast) in ms.
     * Kept short so page loads fail fast and fall back to the local model instead
     * of holding request threads for minutes when the AI service is slow/unreachable.
     */
    private int interactiveReadTimeoutMs = 8_000;

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public int getConnectTimeoutMs() {
        return connectTimeoutMs;
    }

    public void setConnectTimeoutMs(int connectTimeoutMs) {
        this.connectTimeoutMs = connectTimeoutMs;
    }

    public int getReadTimeoutMs() {
        return readTimeoutMs;
    }

    public void setReadTimeoutMs(int readTimeoutMs) {
        this.readTimeoutMs = readTimeoutMs;
    }

    public int getInteractiveReadTimeoutMs() {
        return interactiveReadTimeoutMs;
    }

    public void setInteractiveReadTimeoutMs(int interactiveReadTimeoutMs) {
        this.interactiveReadTimeoutMs = interactiveReadTimeoutMs;
    }
}
