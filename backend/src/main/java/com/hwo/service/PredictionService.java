package com.hwo.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hwo.entity.Department;
import com.hwo.entity.PredictionModel;
import com.hwo.entity.WorkloadRecord;
import com.hwo.repository.DepartmentRepository;
import com.hwo.repository.PredictionModelRepository;
import com.hwo.repository.WorkloadRecordRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class PredictionService {

    private static final String[] MONTH_NAMES = {
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    };

    private final AiServiceClient aiServiceClient;
    private final PredictionModelRepository predictionModelRepository;
    private final WorkloadRecordRepository workloadRecordRepository;
    private final DepartmentRepository departmentRepository;
    private final SettingsService settingsService;
    private final ObjectMapper objectMapper;

    public PredictionService(AiServiceClient aiServiceClient,
                             PredictionModelRepository predictionModelRepository,
                             WorkloadRecordRepository workloadRecordRepository,
                             DepartmentRepository departmentRepository,
                             SettingsService settingsService,
                             ObjectMapper objectMapper) {
        this.aiServiceClient = aiServiceClient;
        this.predictionModelRepository = predictionModelRepository;
        this.workloadRecordRepository = workloadRecordRepository;
        this.departmentRepository = departmentRepository;
        this.settingsService = settingsService;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> getPredictions(String modelId) {
        PredictionModel model = resolveModel(modelId);
        List<MonthlyPoint> monthlyData = aggregateMonthlyWorkload();
        Map<String, Object> config = parseConfig(model);

        List<Map<String, Object>> workloadTrend = buildWorkloadTrend(monthlyData, config);
        List<Map<String, Object>> forecastData = buildForecastData(config, monthlyData.size());
        Map<String, Object> metrics = buildMetrics(model, config);
        List<Map<String, Object>> featureImportance = extractFeatureImportance(config);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("metrics", metrics);
        result.put("workloadTrend", workloadTrend);
        result.put("forecastData", forecastData);
        result.put("featureImportance", featureImportance);
        result.put("modelTrained", model != null && config != null && !config.isEmpty());
        result.put("modelHealth", getModelHealth());
        if (model != null) {
            result.put("modelId", model.getId());
            result.put("modelName", model.getName());
            result.put("version", model.getVersion());
            result.put("modelType", model.getType());
            result.put("granularity", model.getGranularity());
            result.put("scope", model.getScope());
        }
        return result;
    }

    /** Model accuracy for KPI cards — no forecast computation. */
    public Integer getPredictionAccuracyPercent() {
        PredictionModel model = resolveModel(null);
        if (model == null || model.getAccuracy() == null) {
            return null;
        }
        return (int) Math.round(model.getAccuracy());
    }

    /** Metrics only (dashboard) — avoids building forecast series. */
    public Map<String, Object> getPredictionMetricsSnapshot() {
        PredictionModel model = resolveModel(null);
        Map<String, Object> config = parseConfig(model);
        return buildMetrics(model, config);
    }

    /** Lightweight monthly forecast for dashboard using stored model coefficients. */
    public List<Map<String, Object>> getStaffingForecastSnapshot() {
        PredictionModel model = resolveModel(null);
        Map<String, Object> config = parseConfig(model);
        if (config.isEmpty()) {
            return List.of();
        }
        int dataSize = aggregateMonthlyWorkload().size();
        return buildLocalForecastFallback(config, dataSize);
    }

    public Map<String, Object> trainModel() {
        return trainAllModels();
    }

    public Map<String, Object> trainAllModels() {
        if (!aiServiceClient.isHealthy()) {
            throw new IllegalStateException("AI service is unavailable. Start it on port 8000.");
        }

        List<Map<String, Object>> series = buildUnifiedDailyTrainingSeries();
        int minPoints = minTrainingPoints("daily");
        if (series.size() < minPoints) {
            throw new IllegalStateException(
                "Need at least " + minPoints + " daily workload points across all departments (have " + series.size() + ")");
        }

        Map<String, Object> result = trainUnifiedModel(series, minPoints);
        result.put("modelHealth", getModelHealth());
        return result;
    }

    public Map<String, Object> getModelHealth() {
        Map<String, Object> health = new LinkedHashMap<>();
        health.put("aiServiceHealthy", aiServiceClient.isHealthy());
        Optional<PredictionModel> active = resolveActiveSystemModel();
        health.put("systemModelActive", active.isPresent());
        health.put("globalModelActive", active.isPresent());
        health.put("departmentModelsActive", 0);
        health.put("schedulingAiActive", isSchedulingAiActive());
        health.put("minTrainingPoints", minTrainingPoints("daily"));
        health.put("forecastHorizonDays", forecastHorizon());
        health.put("modelComplexity", modelComplexity());
        active.ifPresent(model -> {
            health.put("activeModelId", model.getId());
            health.put("activeModelName", model.getName());
            health.put("activeModelVersion", model.getVersion());
            health.put("modelGranularity", model.getGranularity());
            health.put("modelScope", model.getScope());
            health.put("globalModelId", model.getId());
            health.put("globalModelR2", model.getR2());
            health.put("globalModelMae", model.getMae());
            health.put("globalModelRmse", model.getRmse());
            health.put("globalModelType", model.getType());
            health.put("globalTrainingDataPoints", model.getTrainingDataPoints());
            health.put("globalLastTrained", model.getLastTrained() != null
                ? model.getLastTrained().toLocalDate().toString() : null);
            Map<String, Object> config = parseConfig(model);
            if (config.get("cvMae") != null) {
                health.put("globalCvMae", config.get("cvMae"));
            }
            if (config.get("improvementVsNaive") != null) {
                health.put("improvementVsNaive", config.get("improvementVsNaive"));
            }
        });
        health.put("departmentsIncluded", (int) departmentRepository.findAll().stream()
            .filter(Department::isActive).count());
        return health;
    }

    public boolean isSchedulingAiActive() {
        return aiServiceClient.isHealthy() && resolveActiveSystemModel().isPresent();
    }

    private Map<String, Object> trainUnifiedModel(List<Map<String, Object>> series, int minPoints) {
        Map<String, Object> trainResult = aiServiceClient.train(series, "daily", modelComplexity());
        Map<String, Object> config = buildConfigFromTrainResult(trainResult, "daily");

        String version = nextModelVersion();
        PredictionModel model = new PredictionModel();
        model.setId(UUID.randomUUID().toString());
        model.setName(buildModelName(version));
        model.setVersion(version);
        model.setType(String.valueOf(trainResult.getOrDefault("model_type", "ensemble-daily")));
        model.setMae(asDouble(trainResult.get("mae")));
        model.setRmse(asDouble(trainResult.get("rmse")));
        model.setR2(asDouble(trainResult.get("r2")));
        model.setAccuracy(calculateAccuracy(model.getR2(), model.getMae()));
        model.setLastTrained(LocalDateTime.now());
        model.setDepartmentId(null);
        model.setScope("system");
        model.setGranularity("daily");
        model.setActive(true);
        model.setTrainingDataPoints(series.size());
        model.setHorizon(forecastHorizon());
        try {
            model.setConfig(objectMapper.writeValueAsString(config));
        } catch (Exception e) {
            throw new IllegalStateException("Failed to persist model configuration", e);
        }
        deactivateAllModels();
        predictionModelRepository.save(model);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("modelId", model.getId());
        response.put("modelName", model.getName());
        response.put("modelType", model.getType());
        response.put("version", version);
        response.put("scope", "system");
        response.put("granularity", "daily");
        response.put("mae", model.getMae());
        response.put("rmse", model.getRmse());
        response.put("r2", model.getR2());
        response.put("cvMae", asDouble(trainResult.get("cv_mae")));
        response.put("accuracy", model.getAccuracy());
        response.put("trainingDataPoints", series.size());
        response.put("departmentsIncluded", departmentRepository.findAll().stream().filter(Department::isActive).count());
        response.put("baselineNaiveMae", asDouble(trainResult.get("baseline_naive_mae")));
        response.put("baselineMovingAvgMae", asDouble(trainResult.get("baseline_moving_avg_mae")));
        response.put("improvementVsNaive", asDouble(trainResult.get("improvement_vs_naive")));
        response.put("featureImportance", extractFeatureImportance(config));
        response.put("departmentModelsTrained", 0);
        return response;
    }

    private void deactivateAllModels() {
        for (PredictionModel existing : predictionModelRepository.findByActiveTrue()) {
            existing.setActive(false);
            predictionModelRepository.save(existing);
        }
    }

    private String buildModelName(String version) {
        return sanitizeSystemPrefix(settingsService.getOrganizationName()) + "-v" + version;
    }

    private String sanitizeSystemPrefix(String name) {
        String base = name != null && !name.isBlank() ? name : "HWO";
        String cleaned = base.replaceAll("[^a-zA-Z0-9\\s-]", "").trim().replaceAll("\\s+", "-");
        if (cleaned.isBlank()) {
            cleaned = "HWO";
        }
        return cleaned.length() > 48 ? cleaned.substring(0, 48) : cleaned;
    }

    private String nextModelVersion() {
        int maxPatch = predictionModelRepository.findByScopeOrderByLastTrainedDesc("system").stream()
            .map(PredictionModel::getVersion)
            .filter(v -> v != null && v.matches("\\d+\\.\\d+\\.\\d+"))
            .mapToInt(v -> Integer.parseInt(v.substring(v.lastIndexOf('.') + 1)))
            .max()
            .orElse(-1);
        return "1.0." + (maxPatch + 1);
    }

    private List<Map<String, Object>> buildUnifiedDailyTrainingSeries() {
        Map<LocalDate, List<Double>> byDate = new TreeMap<>();
        for (WorkloadRecord record : workloadRecordRepository.findAllWithDepartment()) {
            if (record.getDate() == null) {
                continue;
            }
            byDate.computeIfAbsent(record.getDate().toLocalDate(), ignored -> new ArrayList<>())
                .add(record.getWorkload());
        }
        return byDate.entrySet().stream()
            .map(entry -> Map.<String, Object>of(
                "date", entry.getKey().toString(),
                "value", entry.getValue().stream().mapToDouble(Double::doubleValue).average().orElse(0)
            ))
            .collect(Collectors.toList());
    }

    private Optional<PredictionModel> resolveActiveSystemModel() {
        Optional<PredictionModel> system = predictionModelRepository
            .findFirstByScopeAndGranularityAndActiveTrue("system", "daily");
        if (system.isPresent()) {
            return system;
        }
        return predictionModelRepository.findFirstByScopeAndGranularityAndActiveTrue("global", "monthly");
    }

    private int minTrainingPoints() {
        int configured = settingsService.getInt("ai", "minTrainingRecords");
        return configured >= 8 ? configured : 8;
    }

    private int minTrainingPoints(String granularity) {
        int configured = minTrainingPoints();
        if ("daily".equals(granularity)) {
            return Math.max(8, Math.min(configured, 30));
        }
        return Math.max(8, Math.min(configured, 24));
    }

    private int forecastHorizon() {
        int configured = settingsService.getInt("ai", "forecastHorizonDays");
        return configured > 0 ? Math.min(configured, 24) : 6;
    }

    private String modelComplexity() {
        Object configured = settingsService.getSection("ai").get("modelComplexity");
        if (configured == null || String.valueOf(configured).isBlank()) {
            return "auto";
        }
        String value = String.valueOf(configured).toLowerCase();
        return switch (value) {
            case "ridge", "ensemble", "auto" -> value;
            default -> "auto";
        };
    }

    public Map<String, Object> listModels() {
        List<Map<String, Object>> models = predictionModelRepository.findAllByOrderByLastTrainedDesc().stream()
            .map(this::toModelInfo)
            .collect(Collectors.toList());
        return Map.of("models", models);
    }

    public Map<String, Object> compareModels(String modelAId, String modelBId) {
        PredictionModel modelA = predictionModelRepository.findById(modelAId)
            .orElseThrow(() -> new IllegalArgumentException("Model A not found"));
        PredictionModel modelB = predictionModelRepository.findById(modelBId)
            .orElseThrow(() -> new IllegalArgumentException("Model B not found"));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("modelA", toModelInfo(modelA));
        result.put("modelB", toModelInfo(modelB));
        result.put("winner", Map.of(
            "accuracy", winner(modelA.getAccuracy(), modelB.getAccuracy()),
            "mae", winner(modelA.getMae(), modelB.getMae(), true),
            "rmse", winner(modelA.getRmse(), modelB.getRmse(), true)
        ));
        return result;
    }

    public String exportPredictions(String modelId) {
        Map<String, Object> predictions = getPredictions(modelId);
        StringBuilder csv = new StringBuilder("section,month,actual,predicted,low,high\n");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> trend = (List<Map<String, Object>>) predictions.getOrDefault("workloadTrend", List.of());
        for (Map<String, Object> row : trend) {
            csv.append("historical,")
                .append(row.get("month")).append(",")
                .append(row.get("actual")).append(",")
                .append(row.get("predicted")).append(",,,\n");
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> forecast = (List<Map<String, Object>>) predictions.getOrDefault("forecastData", List.of());
        for (Map<String, Object> row : forecast) {
            csv.append("forecast,")
                .append(row.get("month")).append(",,")
                .append(row.get("predicted")).append(",")
                .append(row.get("low")).append(",")
                .append(row.get("high")).append("\n");
        }
        return csv.toString();
    }

    public Map<String, Object> forecastDepartmentDaily(String departmentId, LocalDate targetDate) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("departmentId", departmentId);
        result.put("targetDate", targetDate.toString());

        Optional<PredictionModel> activeModel = resolveActiveSystemModel();
        if (activeModel.isPresent() && aiServiceClient.isHealthy()) {
            try {
                Map<String, Object> config = parseConfig(activeModel.get());
                List<Map<String, Object>> series = buildDepartmentTrainingSeries(departmentId);
                Map<String, Object> request = buildPredictPointRequest(config, targetDate, series);
                Map<String, Object> aiResult = aiServiceClient.predictPoint(request);
                result.put("predicted", Math.round(asDouble(aiResult.get("predicted"))));
                result.put("low", Math.round(asDouble(aiResult.get("low"))));
                result.put("high", Math.round(asDouble(aiResult.get("high"))));
                result.put("trend", String.valueOf(aiResult.getOrDefault("trend", departmentTrendLabel(departmentId))));
                result.put("modelTrained", true);
                result.put("source", aiResult.getOrDefault("source", "system-model"));
                result.put("modelId", activeModel.get().getId());
                result.put("modelName", activeModel.get().getName());
                result.put("modelVersion", activeModel.get().getVersion());
                result.put("modelR2", activeModel.get().getR2());
                return result;
            } catch (Exception ignored) {
                // fall through
            }
        }

        List<Map<String, Object>> series = buildDepartmentTrainingSeries(departmentId);
        if (series.size() >= minTrainingPoints("daily") && aiServiceClient.isHealthy()) {
            try {
                Map<String, Object> request = new LinkedHashMap<>();
                request.put("data", series);
                request.put("target_date", targetDate.toString());
                departmentRepository.findById(departmentId)
                    .map(Department::getName)
                    .ifPresent(name -> request.put("department", name));
                Map<String, Object> aiResult = aiServiceClient.forecastSeries(request);
                result.put("predicted", Math.round(asDouble(aiResult.get("predicted"))));
                result.put("low", Math.round(asDouble(aiResult.get("low"))));
                result.put("high", Math.round(asDouble(aiResult.get("high"))));
                result.put("trend", aiResult.getOrDefault("trend", "stable"));
                result.put("modelTrained", true);
                result.put("source", "ridge-daily-ephemeral");
                return result;
            } catch (Exception ignored) {
                // fall through
            }
        }

        double fallback = fallbackDepartmentLoad(departmentId, targetDate);
        result.put("predicted", Math.round(fallback));
        result.put("low", Math.round(Math.max(0, fallback - 5)));
        result.put("high", Math.round(Math.min(100, fallback + 5)));
        result.put("trend", departmentTrendLabel(departmentId));
        result.put("modelTrained", false);
        result.put("source", "heuristic");
        return result;
    }

    private Map<String, Object> buildPredictPointRequest(Map<String, Object> config, LocalDate targetDate,
                                                         List<Map<String, Object>> trainingSeries) {
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("target_date", targetDate.toString());
        request.put("granularity", config.getOrDefault("granularity", "daily"));
        request.put("coefficients", config.getOrDefault("coefficients", List.of()));
        request.put("scale_params", config.get("scaleParams"));
        request.put("residual_std", asDouble(config.get("residualStd")));
        request.put("last_index", asInt(config.get("lastIndex"), 0));
        request.put("last_date", config.get("lastDate"));
        Object artifact = config.get("modelArtifact");
        if (artifact instanceof String artifactValue && !artifactValue.isBlank() && !trainingSeries.isEmpty()) {
            request.put("model_artifact", artifactValue);
            request.put("model_type", config.getOrDefault("modelType", config.get("model_type")));
            request.put("training_values", trainingSeries.stream()
                .map(point -> asDouble(point.get("value")))
                .collect(Collectors.toList()));
            request.put("training_dates", trainingSeries.stream()
                .map(point -> String.valueOf(point.get("date")))
                .collect(Collectors.toList()));
        }
        return request;
    }

    private List<Map<String, Object>> buildDepartmentTrainingSeries(String departmentId) {
        Map<LocalDate, List<Double>> byDate = new TreeMap<>();
        for (WorkloadRecord record : workloadRecordRepository.findAllWithDepartment()) {
            if (!departmentId.equals(record.getDepartmentId()) || record.getDate() == null) {
                continue;
            }
            LocalDate day = record.getDate().toLocalDate();
            byDate.computeIfAbsent(day, ignored -> new ArrayList<>()).add(record.getWorkload());
        }

        if (byDate.size() >= 8) {
            return byDate.entrySet().stream()
                .map(entry -> Map.<String, Object>of(
                    "date", entry.getKey().toString(),
                    "value", entry.getValue().stream().mapToDouble(Double::doubleValue).average().orElse(0)
                ))
                .collect(Collectors.toList());
        }

        Map<String, List<Double>> byMonth = new LinkedHashMap<>();
        for (WorkloadRecord record : workloadRecordRepository.findAllWithDepartment()) {
            if (!departmentId.equals(record.getDepartmentId()) || record.getDate() == null) {
                continue;
            }
            String key = record.getDate().getYear() + "-" + record.getDate().getMonthValue();
            byMonth.computeIfAbsent(key, ignored -> new ArrayList<>()).add(record.getWorkload());
        }
        return byMonth.entrySet().stream()
            .sorted(Map.Entry.comparingByKey())
            .map(entry -> {
                String[] parts = entry.getKey().split("-");
                LocalDate date = LocalDate.of(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]), 15);
                double avg = entry.getValue().stream().mapToDouble(Double::doubleValue).average().orElse(0);
                return Map.<String, Object>of("date", date.toString(), "value", avg);
            })
            .collect(Collectors.toList());
    }

    private double fallbackDepartmentLoad(String departmentId, LocalDate targetDate) {
        List<WorkloadRecord> records = workloadRecordRepository.findAllWithDepartment().stream()
            .filter(r -> departmentId.equals(r.getDepartmentId()))
            .filter(r -> r.getDate() != null)
            .collect(Collectors.toList());
        double base = records.stream().mapToDouble(WorkloadRecord::getWorkload).average().orElse(75);
        int dow = targetDate.getDayOfWeek().getValue();
        double dowAdjust = dow <= 5 ? 3 : -2;
        return Math.max(0, Math.min(100, base + dowAdjust));
    }

    private String departmentTrendLabel(String departmentId) {
        LocalDate end = LocalDate.now();
        double recent = averageWorkloadBetween(departmentId, end.minusDays(7), end);
        double prior = averageWorkloadBetween(departmentId, end.minusDays(14), end.minusDays(8));
        if (prior <= 0) return "stable";
        double change = (recent - prior) / prior;
        if (change > 0.08) return "rising";
        if (change < -0.08) return "falling";
        return "stable";
    }

    private double averageWorkloadBetween(String departmentId, LocalDate start, LocalDate end) {
        return workloadRecordRepository.findAllWithDepartment().stream()
            .filter(r -> departmentId.equals(r.getDepartmentId()))
            .filter(r -> r.getDate() != null)
            .filter(r -> {
                LocalDate d = r.getDate().toLocalDate();
                return !d.isBefore(start) && !d.isAfter(end);
            })
            .mapToDouble(WorkloadRecord::getWorkload)
            .average()
            .orElse(0);
    }

    private PredictionModel resolveModel(String modelId) {
        if (modelId != null && !modelId.isBlank()) {
            return predictionModelRepository.findById(modelId).orElse(null);
        }
        return resolveActiveSystemModel().orElse(null);
    }

    private Optional<PredictionModel> resolveActiveModel(String scope, String departmentId, String granularity) {
        Optional<PredictionModel> system = resolveActiveSystemModel();
        if (system.isPresent()) {
            return system;
        }
        if ("department".equals(scope) && departmentId != null) {
            return predictionModelRepository.findFirstByDepartmentIdAndGranularityAndActiveTrue(departmentId, granularity);
        }
        return predictionModelRepository.findFirstByScopeAndGranularityAndActiveTrue(scope, granularity);
    }

    private List<MonthlyPoint> aggregateMonthlyWorkload() {
        List<WorkloadRecord> records = workloadRecordRepository.findAllByOrderByDateAsc();
        Map<String, List<Double>> byMonth = new LinkedHashMap<>();

        for (WorkloadRecord record : records) {
            if (record.getDate() == null) {
                continue;
            }
            String key = record.getDate().getYear() + "-" + record.getDate().getMonthValue();
            byMonth.computeIfAbsent(key, ignored -> new ArrayList<>()).add(record.getWorkload());
        }

        return byMonth.entrySet().stream()
            .sorted(Map.Entry.comparingByKey())
            .map(entry -> {
                String[] parts = entry.getKey().split("-");
                int year = Integer.parseInt(parts[0]);
                int month = Integer.parseInt(parts[1]);
                double avg = entry.getValue().stream().mapToDouble(Double::doubleValue).average().orElse(0);
                return new MonthlyPoint(LocalDate.of(year, month, 1), avg, month - 1);
            })
            .collect(Collectors.toList());
    }

    private Map<String, Object> buildConfigFromTrainResult(Map<String, Object> trainResult, String granularity) {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("coefficients", trainResult.get("coefficients"));
        config.put("scaleParams", trainResult.get("scale_params"));
        config.put("residualStd", trainResult.get("residual_std"));
        config.put("lastIndex", trainResult.get("last_index"));
        config.put("lastDate", trainResult.get("last_date"));
        config.put("granularity", trainResult.getOrDefault("granularity", granularity));
        config.put("modelType", trainResult.get("model_type"));
        Object artifact = trainResult.get("model_artifact");
        if (artifact != null) {
            config.put("modelArtifact", artifact);
        }
        config.put("r2", trainResult.get("r2"));
        config.put("cvMae", trainResult.get("cv_mae"));
        config.put("baselineNaiveMae", trainResult.get("baseline_naive_mae"));
        config.put("baselineMovingAvgMae", trainResult.get("baseline_moving_avg_mae"));
        config.put("improvementVsNaive", trainResult.get("improvement_vs_naive"));
        config.put("featureImportance", trainResult.get("feature_importance"));
        config.put("biasCorrection", trainResult.get("bias_correction"));
        config.put("residualQ90", trainResult.get("residual_q90"));
        config.put("trainingPoints", trainResult.get("training_points"));
        return config;
    }

    private Map<String, Object> parseConfig(PredictionModel model) {
        if (model == null || model.getConfig() == null || model.getConfig().isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(model.getConfig(), new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }

    private List<Map<String, Object>> buildWorkloadTrend(List<MonthlyPoint> monthlyData, Map<String, Object> config) {
        if (isDailyArtifactModel(config) && aiServiceClient.isHealthy()) {
            return buildArtifactWorkloadTrend(monthlyData, config);
        }
        List<Map<String, Object>> trend = new ArrayList<>();
        for (int i = 0; i < monthlyData.size(); i++) {
            MonthlyPoint point = monthlyData.get(i);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("month", MONTH_NAMES[point.monthIndex()]);
            row.put("actual", Math.round(point.value()));
            row.put("predicted", Math.round(predictValue(i, config)));
            trend.add(row);
        }
        return trend;
    }

    private boolean isDailyArtifactModel(Map<String, Object> config) {
        if (config == null || config.isEmpty()) {
            return false;
        }
        Object artifact = config.get("modelArtifact");
        return "daily".equals(String.valueOf(config.getOrDefault("granularity", "")))
            && artifact instanceof String value && !value.isBlank();
    }

    private List<Map<String, Object>> buildArtifactWorkloadTrend(List<MonthlyPoint> monthlyData,
                                                                  Map<String, Object> config) {
        List<Map<String, Object>> trainingSeries = buildUnifiedDailyTrainingSeries();
        List<Map<String, Object>> trend = new ArrayList<>();
        int maxAiPoints = 18;
        int startIdx = Math.max(0, monthlyData.size() - maxAiPoints);
        for (int i = startIdx; i < monthlyData.size(); i++) {
            MonthlyPoint point = monthlyData.get(i);
            LocalDate monthEnd = point.date().withDayOfMonth(point.date().lengthOfMonth());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("month", MONTH_NAMES[point.monthIndex()]);
            row.put("actual", Math.round(point.value()));
            try {
                Map<String, Object> request = buildPredictPointRequest(config, monthEnd, trainingSeries);
                Map<String, Object> aiResult = aiServiceClient.predictPoint(request);
                row.put("predicted", Math.round(asDouble(aiResult.get("predicted"))));
            } catch (Exception ignored) {
                row.put("predicted", Math.round(predictValue(i, config)));
            }
            trend.add(row);
        }
        return trend;
    }

    private List<Map<String, Object>> buildForecastData(Map<String, Object> config, int dataSize) {
        if (config.isEmpty()) {
            return List.of();
        }

        Object artifact = config.get("modelArtifact");
        if (artifact instanceof String artifactValue && !artifactValue.isBlank()
            && "daily".equals(String.valueOf(config.getOrDefault("granularity", "")))) {
            return buildDailyArtifactForecast(config);
        }

        int lastIndex = asInt(config.get("lastIndex"), Math.max(0, dataSize - 1));
        @SuppressWarnings("unchecked")
        List<Number> coefficients = (List<Number>) config.get("coefficients");
        if (coefficients == null || coefficients.size() != 4) {
            return List.of();
        }

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("coefficients", coefficients.stream().map(Number::doubleValue).collect(Collectors.toList()));
        request.put("last_index", lastIndex);
        request.put("horizon", forecastHorizon());
        request.put("residual_std", asDouble(config.get("residualStd")));
        request.put("scale_params", config.get("scaleParams"));

        if (!aiServiceClient.isHealthy()) {
            return buildLocalForecastFallback(config, dataSize);
        }
        try {
            List<Map<String, Object>> forecast = aiServiceClient.forecast(request);
            return forecast.stream()
                .map(point -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("month", point.get("month"));
                    row.put("predicted", Math.round(asDouble(point.get("predicted"))));
                    row.put("low", Math.round(asDouble(point.get("low"))));
                    row.put("high", Math.round(asDouble(point.get("high"))));
                    return row;
                })
                .collect(Collectors.toList());
        } catch (Exception e) {
            return buildLocalForecastFallback(config, dataSize);
        }
    }

    private List<Map<String, Object>> buildLocalForecastFallback(Map<String, Object> config, int dataSize) {
        int horizon = forecastHorizon();
        int lastIndex = asInt(config.get("lastIndex"), Math.max(0, dataSize - 1));
        double residual = asDouble(config.get("residualStd"));
        List<Map<String, Object>> forecast = new ArrayList<>();
        for (int i = 1; i <= horizon; i++) {
            int idx = lastIndex + i;
            double pred = predictValue(idx, config);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("month", MONTH_NAMES[idx % 12]);
            row.put("predicted", Math.round(pred));
            row.put("low", Math.round(Math.max(0, pred - residual)));
            row.put("high", Math.round(Math.min(100, pred + residual)));
            forecast.add(row);
        }
        return forecast;
    }

    private List<Map<String, Object>> buildDailyArtifactForecast(Map<String, Object> config) {
        if (!aiServiceClient.isHealthy()) {
            return List.of();
        }
        List<Map<String, Object>> trainingSeries = buildUnifiedDailyTrainingSeries();
        if (trainingSeries.isEmpty()) {
            return List.of();
        }
        Object lastDateObj = config.get("lastDate");
        if (lastDateObj == null) {
            return List.of();
        }
        LocalDate lastDate = LocalDate.parse(String.valueOf(lastDateObj));
        int horizonMonths = Math.max(1, Math.min(forecastHorizon(), 24));
        Map<String, List<Double>> predsByMonth = new LinkedHashMap<>();
        Map<String, List<Double>> lowsByMonth = new LinkedHashMap<>();
        Map<String, List<Double>> highsByMonth = new LinkedHashMap<>();

        for (int monthOffset = 1; monthOffset <= horizonMonths; monthOffset++) {
            LocalDate target = lastDate.plusMonths(monthOffset);
            if (target.getDayOfMonth() != lastDate.getDayOfMonth()) {
                int day = Math.min(lastDate.getDayOfMonth(), target.lengthOfMonth());
                target = target.withDayOfMonth(day);
            }
            try {
                Map<String, Object> request = buildPredictPointRequest(config, target, trainingSeries);
                Map<String, Object> aiResult = aiServiceClient.predictPoint(request);
                String month = MONTH_NAMES[target.getMonthValue() - 1];
                predsByMonth.computeIfAbsent(month, ignored -> new ArrayList<>())
                    .add(asDouble(aiResult.get("predicted")));
                lowsByMonth.computeIfAbsent(month, ignored -> new ArrayList<>())
                    .add(asDouble(aiResult.get("low")));
                highsByMonth.computeIfAbsent(month, ignored -> new ArrayList<>())
                    .add(asDouble(aiResult.get("high")));
            } catch (Exception ignored) {
                // skip month
            }
        }

        List<Map<String, Object>> forecast = new ArrayList<>();
        for (String month : predsByMonth.keySet()) {
            List<Double> preds = predsByMonth.get(month);
            List<Double> lows = lowsByMonth.getOrDefault(month, preds);
            List<Double> highs = highsByMonth.getOrDefault(month, preds);
            double pred = preds.stream().mapToDouble(Double::doubleValue).average().orElse(0);
            double low = lows.stream().mapToDouble(Double::doubleValue).average().orElse(pred);
            double high = highs.stream().mapToDouble(Double::doubleValue).average().orElse(pred);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("month", month);
            row.put("predicted", Math.round(pred));
            row.put("low", Math.round(Math.max(0, low)));
            row.put("high", Math.round(Math.min(100, high)));
            forecast.add(row);
        }
        return forecast;
    }

    private Map<String, Object> buildMetrics(PredictionModel model, Map<String, Object> config) {
        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("accuracy", model != null ? model.getAccuracy() : null);
        metrics.put("mae", model != null ? model.getMae() : null);
        metrics.put("rmse", model != null ? model.getRmse() : null);
        metrics.put("r2", config.get("r2"));
        metrics.put("lastTrained", model != null && model.getLastTrained() != null
            ? model.getLastTrained().toLocalDate().toString()
            : null);
        metrics.put("baselineNaiveMae", config.get("baselineNaiveMae"));
        metrics.put("baselineMovingAvgMae", config.get("baselineMovingAvgMae"));
        metrics.put("improvementVsNaive", config.get("improvementVsNaive"));
        metrics.put("cvMae", config.get("cvMae"));
        metrics.put("modelType", model != null ? model.getType() : config.get("modelType"));
        metrics.put("residualStd", config.get("residualStd"));
        metrics.put("biasCorrection", config.get("biasCorrection"));
        if (model != null) {
            metrics.put("scope", model.getScope());
            metrics.put("granularity", model.getGranularity());
            metrics.put("active", model.isActive());
            metrics.put("trainingDataPoints", model.getTrainingDataPoints());
            metrics.put("modelName", model.getName());
            metrics.put("version", model.getVersion());
        }
        return metrics;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> extractFeatureImportance(Map<String, Object> config) {
        Object value = config.get("featureImportance");
        if (value == null) {
            value = config.get("feature_importance");
        }
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> source)) {
                continue;
            }
            Object feature = source.get("feature");
            Object importance = source.get("importance");
            if (feature == null || importance == null) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("feature", String.valueOf(feature));
            row.put("importance", asDouble(importance));
            rows.add(row);
        }
        return rows;
    }

    private double predictValue(int index, Map<String, Object> config) {
        @SuppressWarnings("unchecked")
        List<Number> coefficients = (List<Number>) config.get("coefficients");
        if (coefficients == null || coefficients.size() != 4) {
            return 0;
        }

        double[] features = buildFeatures(index);
        applyScaling(features, config);
        double prediction = 0;
        for (int i = 0; i < coefficients.size(); i++) {
            prediction += features[i] * coefficients.get(i).doubleValue();
        }
        return Math.max(0, Math.min(100, prediction));
    }

    private double[] buildFeatures(int index) {
        int monthIdx = index % 12;
        return new double[] {
            1,
            index,
            Math.sin(2 * Math.PI * monthIdx / 12.0),
            Math.cos(2 * Math.PI * monthIdx / 12.0)
        };
    }

    @SuppressWarnings("unchecked")
    private void applyScaling(double[] features, Map<String, Object> config) {
        Object scaleParams = config.get("scaleParams");
        if (!(scaleParams instanceof Map<?, ?> params)) {
            return;
        }
        List<Number> mean = (List<Number>) params.get("mean");
        List<Number> std = (List<Number>) params.get("std");
        if (mean == null || std == null) {
            return;
        }
        for (int i = 0; i < features.length; i++) {
            double divisor = std.size() > i ? Math.max(std.get(i).doubleValue(), 1e-8) : 1;
            double offset = mean.size() > i ? mean.get(i).doubleValue() : 0;
            features[i] = (features[i] - offset) / divisor;
        }
        features[0] = 1;
    }

    private Map<String, Object> toModelInfo(PredictionModel model) {
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("id", model.getId());
        info.put("name", model.getName());
        info.put("version", model.getVersion());
        info.put("type", model.getType());
        info.put("accuracy", model.getAccuracy());
        info.put("mae", model.getMae());
        info.put("rmse", model.getRmse());
        info.put("lastTrained", model.getLastTrained() != null
            ? model.getLastTrained().toLocalDate().toString()
            : null);
        info.put("scope", model.getScope());
        info.put("granularity", model.getGranularity());
        info.put("departmentId", model.getDepartmentId());
        info.put("active", model.isActive());
        info.put("r2", model.getR2());
        info.put("trainingDataPoints", model.getTrainingDataPoints());
        return info;
    }

    private String winner(Double a, Double b) {
        return winner(a, b, false);
    }

    private String winner(Double a, Double b, boolean lowerIsBetter) {
        if (a == null && b == null) {
            return "tie";
        }
        if (a == null) {
            return "modelB";
        }
        if (b == null) {
            return "modelA";
        }
        if (a.equals(b)) {
            return "tie";
        }
        boolean aWins = lowerIsBetter ? a < b : a > b;
        return aWins ? "modelA" : "modelB";
    }

    private double calculateAccuracy(Double r2, Double mae) {
        if (r2 != null && r2 > 0) {
            return Math.max(0, Math.min(100, r2 * 100));
        }
        if (mae != null) {
            return Math.max(0, Math.min(100, (1 - mae / 25.0) * 100));
        }
        return 0;
    }

    private double asDouble(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        return 0;
    }

    private int asInt(Object value, int fallback) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        return fallback;
    }

    private record MonthlyPoint(LocalDate date, double value, int monthIndex) {}
}
