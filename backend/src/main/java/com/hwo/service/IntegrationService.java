package com.hwo.service;

import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class IntegrationService {

    private static final Duration HEALTH_TIMEOUT = Duration.ofSeconds(4);

    private final SettingsService settingsService;
    private final HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(HEALTH_TIMEOUT)
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build();

    public IntegrationService(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    public Map<String, Object> buildLineage(long workloadCount, long staffCount, long manualImportCount) {
        Map<String, Object> his = buildSourceStatus("HIS", "his", workloadCount);
        Map<String, Object> hr = buildSourceStatus("HR System", "hr", staffCount);
        Map<String, Object> manual = new LinkedHashMap<>();
        manual.put("name", "Manual Import");
        manual.put("status", manualImportCount > 0 ? "active" : "idle");
        manual.put("statusLabel", manualImportCount > 0 ? "Active" : "No imports yet");
        manual.put("connected", false);
        manual.put("records", manualImportCount);
        manual.put("localRecords", manualImportCount);
        manual.put("syncedRecords", 0);
        manual.put("message", manualImportCount > 0
            ? manualImportCount + " records imported via CSV upload."
            : "Upload CSV templates from Data Collection to import records.");

        return Map.of("sources", java.util.List.of(his, hr, manual));
    }

    public Map<String, Object> buildDataIntegrationFields(long workloadCount, long staffCount) {
        Map<String, Object> his = buildSourceStatus("HIS", "his", workloadCount);
        Map<String, Object> hr = buildSourceStatus("HR System", "hr", staffCount);

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("hisConnected", his.get("connected"));
        fields.put("hrConnected", hr.get("connected"));
        fields.put("hisStatus", his.get("status"));
        fields.put("hrStatus", hr.get("status"));
        fields.put("hisStatusLabel", his.get("statusLabel"));
        fields.put("hrStatusLabel", hr.get("statusLabel"));
        fields.put("hisMessage", his.get("message"));
        fields.put("hrMessage", hr.get("message"));
        fields.put("hisLocalRecords", his.get("localRecords"));
        fields.put("hrLocalRecords", hr.get("localRecords"));
        fields.put("hisSyncedRecords", his.get("syncedRecords"));
        fields.put("hrSyncedRecords", hr.get("syncedRecords"));
        return fields;
    }

    public Map<String, Object> testIntegrations() {
        Map<String, Object> integrations = settingsService.getIntegrationsSettings();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("his", probe("his", integrations));
        result.put("hr", probe("hr", integrations));
        return result;
    }

    private Map<String, Object> buildSourceStatus(String label, String key, long localRecords) {
        Map<String, Object> integrations = settingsService.getIntegrationsSettings();
        Map<String, Object> probe = probe(key, integrations);

        boolean enabled = Boolean.TRUE.equals(probe.get("enabled"));
        boolean connected = Boolean.TRUE.equals(probe.get("connected"));
        String endpoint = stringValue(probe.get("endpoint"));
        String probeStatus = String.valueOf(probe.get("status"));

        String status;
        if (connected) {
            status = "connected";
        } else if (enabled && !endpoint.isBlank()) {
            status = "disconnected";
        } else if (localRecords > 0) {
            status = "local_data";
        } else {
            status = probeStatus;
        }

        String statusLabel = switch (status) {
            case "connected" -> "Connected";
            case "local_data" -> "Local data";
            case "disconnected" -> "Disconnected";
            case "not_configured" -> "Not configured";
            default -> status;
        };

        String message = String.valueOf(probe.get("message"));
        if ("local_data".equals(status)) {
            message = "Integration is not active. " + localRecords + " record(s) stored locally (seed data, manual entry, or CSV import).";
        } else if ("disconnected".equals(status) && localRecords > 0) {
            message = message + " " + localRecords + " local record(s) remain in the database.";
        }

        Map<String, Object> source = new LinkedHashMap<>();
        source.put("name", label);
        source.put("status", status);
        source.put("statusLabel", statusLabel);
        source.put("connected", connected);
        source.put("records", localRecords);
        source.put("localRecords", localRecords);
        source.put("syncedRecords", 0);
        source.put("endpoint", endpoint);
        source.put("message", message.trim());
        return source;
    }

    private Map<String, Object> probe(String key, Map<String, Object> integrations) {
        boolean enabled = settingsService.getBoolean("integrations", key + "Enabled", false);
        String url = stringValue(integrations.get(key + "Url"));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("enabled", enabled);
        result.put("endpoint", url);

        if (!enabled) {
            result.put("status", "not_configured");
            result.put("statusLabel", "Not configured");
            result.put("connected", false);
            result.put("message", "Integration is disabled in Configuration → Integrations.");
            return result;
        }
        if (url.isBlank()) {
            result.put("status", "not_configured");
            result.put("statusLabel", "Not configured");
            result.put("connected", false);
            result.put("message", "Integration is enabled but no endpoint URL is configured.");
            return result;
        }

        HealthCheck health = ping(url);
        if (health.reachable()) {
            result.put("status", "connected");
            result.put("statusLabel", "Connected");
            result.put("connected", true);
            result.put("message", "Endpoint reachable (" + health.statusCode() + "). Sync has not pulled records yet.");
        } else {
            result.put("status", "disconnected");
            result.put("statusLabel", "Disconnected");
            result.put("connected", false);
            result.put("message", "Could not reach endpoint: " + health.message());
        }
        return result;
    }

    private HealthCheck ping(String url) {
        try {
            URI uri = URI.create(url.trim());
            if (uri.getScheme() == null || (!uri.getScheme().equalsIgnoreCase("http") && !uri.getScheme().equalsIgnoreCase("https"))) {
                return HealthCheck.failed("URL must start with http:// or https://");
            }
            HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(HEALTH_TIMEOUT)
                .GET()
                .build();
            HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            int code = response.statusCode();
            if (code >= 200 && code < 500) {
                return HealthCheck.ok(code);
            }
            return HealthCheck.failed("HTTP " + code);
        } catch (Exception e) {
            return HealthCheck.failed(e.getMessage() != null ? e.getMessage() : "Connection failed");
        }
    }

    private String stringValue(Object value) {
        return value != null ? String.valueOf(value).trim() : "";
    }

    private record HealthCheck(boolean reachable, int statusCode, String message) {
        static HealthCheck ok(int statusCode) {
            return new HealthCheck(true, statusCode, "OK");
        }

        static HealthCheck failed(String message) {
            return new HealthCheck(false, 0, message);
        }
    }
}
