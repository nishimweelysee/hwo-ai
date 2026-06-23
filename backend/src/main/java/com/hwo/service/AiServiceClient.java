package com.hwo.service;

import com.hwo.config.AiServiceProperties;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AiServiceClient {

    /** Long read timeout — used only for model training, which can take minutes. */
    private final RestTemplate restTemplate;
    /** Short read timeout — used for interactive calls so slow AI fails fast. */
    private final RestTemplate interactiveRestTemplate;
    private final AiServiceProperties properties;
    /**
     * Last-known AI health, refreshed by a background scheduler (see {@link #refreshHealth()}).
     * Reads never hit the network, so page loads never block on AI responsiveness.
     * Optimistic at startup until the first probe runs.
     */
    private volatile boolean cachedHealthy = true;

    public AiServiceClient(@Qualifier("aiRestTemplate") RestTemplate restTemplate,
                           @Qualifier("aiInteractiveRestTemplate") RestTemplate interactiveRestTemplate,
                           AiServiceProperties properties) {
        this.restTemplate = restTemplate;
        this.interactiveRestTemplate = interactiveRestTemplate;
        this.properties = properties;
    }

    /** Non-blocking: returns the latest health probed in the background. */
    public boolean isHealthy() {
        return cachedHealthy;
    }

    /**
     * Periodically probes the AI service so {@link #isHealthy()} stays current without
     * ever blocking a request thread (previously every caller could stall on this ping).
     */
    @Scheduled(fixedDelay = 10_000L, initialDelay = 0L)
    public void refreshHealth() {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> response = interactiveRestTemplate.getForObject(
                properties.getUrl() + "/health", Map.class);
            cachedHealthy = response != null && "ok".equals(response.get("status"));
        } catch (RestClientException e) {
            cachedHealthy = false;
        }
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> train(List<Map<String, Object>> dataPoints, String granularity, String modelComplexity) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("data", dataPoints);
        body.put("granularity", granularity != null ? granularity : "monthly");
        body.put("model_complexity", modelComplexity != null ? modelComplexity : "auto");
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);
        Map<String, Object> response = restTemplate.postForObject(
            properties.getUrl() + "/train", request, Map.class);
        if (response == null) {
            throw new IllegalStateException("AI service returned empty training response");
        }
        return response;
    }

    public Map<String, Object> train(List<Map<String, Object>> dataPoints, String granularity) {
        return train(dataPoints, granularity, "auto");
    }

    public Map<String, Object> train(List<Map<String, Object>> dataPoints) {
        return train(dataPoints, "monthly", "auto");
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> forecast(Map<String, Object> requestBody) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(requestBody, headers);
        Map<String, Object> response = interactiveRestTemplate.postForObject(
            properties.getUrl() + "/forecast", request, Map.class);
        if (response == null || !(response.get("forecast") instanceof List<?> forecast)) {
            throw new IllegalStateException("AI service returned empty forecast response");
        }
        return (List<Map<String, Object>>) forecast;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> forecastSeries(Map<String, Object> requestBody) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(requestBody, headers);
        Map<String, Object> response = interactiveRestTemplate.postForObject(
            properties.getUrl() + "/forecast-series", request, Map.class);
        if (response == null) {
            throw new IllegalStateException("AI service returned empty series forecast response");
        }
        return response;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> predictPoint(Map<String, Object> requestBody) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(requestBody, headers);
        Map<String, Object> response = interactiveRestTemplate.postForObject(
            properties.getUrl() + "/predict-point", request, Map.class);
        if (response == null) {
            throw new IllegalStateException("AI service returned empty predict-point response");
        }
        return response;
    }

    /**
     * Batch variant of {@link #predictPoint(Map)} — one round-trip for many target
     * dates. Returns the ordered list under the {@code "points"} key.
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> predictPoints(Map<String, Object> requestBody) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(requestBody, headers);
        Map<String, Object> response = interactiveRestTemplate.postForObject(
            properties.getUrl() + "/predict-points", request, Map.class);
        if (response == null || !(response.get("points") instanceof List<?> points)) {
            throw new IllegalStateException("AI service returned empty predict-points response");
        }
        return (List<Map<String, Object>>) points;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> rankAssignees(Map<String, Object> requestBody) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(requestBody, headers);
        Map<String, Object> response = interactiveRestTemplate.postForObject(
            properties.getUrl() + "/rank-assignees", request, Map.class);
        if (response == null || !(response.get("rankings") instanceof List<?>)) {
            throw new IllegalStateException("AI service returned empty ranking response");
        }
        return response;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> predictWellnessRisk(Map<String, Object> requestBody) {
        return postForMap("/wellness/predict-risk", requestBody);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> recommendWellnessInterventions(Map<String, Object> requestBody) {
        return postForMap("/wellness/recommend-interventions", requestBody);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> analyzeWellnessFeedback(Map<String, Object> requestBody) {
        return postForMap("/wellness/analyze-feedback", requestBody);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> predictInventoryDemand(Map<String, Object> requestBody) {
        return postForMap("/inventory/predict-demand", requestBody);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> optimizeInventoryReorders(Map<String, Object> requestBody) {
        return postForMap("/inventory/optimize-reorders", requestBody);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> analyzeInventoryPortfolio(Map<String, Object> requestBody) {
        return postForMap("/inventory/analyze-portfolio", requestBody);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> rankInventoryProcurement(Map<String, Object> requestBody) {
        return postForMap("/inventory/rank-procurement", requestBody);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> prioritizeSkillsTraining(Map<String, Object> requestBody) {
        return postForMap("/skills/prioritize-training", requestBody);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> analyzeSkillsGaps(Map<String, Object> requestBody) {
        return postForMap("/skills/analyze-gaps", requestBody);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> recommendSkillsDevelopment(Map<String, Object> requestBody) {
        return postForMap("/skills/recommend-development", requestBody);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> getWellnessModelInfo() {
        Map<String, Object> response = interactiveRestTemplate.getForObject(
            properties.getUrl() + "/wellness/model-info", Map.class);
        if (response == null) {
            throw new IllegalStateException("AI service returned empty wellness model info");
        }
        return response;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> postForMap(String path, Map<String, Object> requestBody) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(requestBody, headers);
        Map<String, Object> response = interactiveRestTemplate.postForObject(
            properties.getUrl() + path, request, Map.class);
        if (response == null) {
            throw new IllegalStateException("AI service returned empty response for " + path);
        }
        return response;
    }
}
