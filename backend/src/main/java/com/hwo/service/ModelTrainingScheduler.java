package com.hwo.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.DayOfWeek;
import java.time.LocalDate;

@Component
public class ModelTrainingScheduler {

    private static final Logger log = LoggerFactory.getLogger(ModelTrainingScheduler.class);

    private final PredictionService predictionService;
    private final SettingsService settingsService;

    public ModelTrainingScheduler(PredictionService predictionService, SettingsService settingsService) {
        this.predictionService = predictionService;
        this.settingsService = settingsService;
    }

    @Scheduled(cron = "0 0 3 * * *")
    public void autoRetrainModels() {
        if (!settingsService.getBoolean("ai", "autoRetrainEnabled", false)) {
            return;
        }
        String configuredDay = String.valueOf(
            settingsService.getSection("ai").getOrDefault("autoRetrainDayOfWeek", "Sunday"));
        DayOfWeek targetDay = parseDayOfWeek(configuredDay);
        if (LocalDate.now().getDayOfWeek() != targetDay) {
            return;
        }
        try {
            log.info("Starting scheduled ML retrain for unified system model");
            predictionService.trainAllModels();
            log.info("Scheduled ML retrain completed");
        } catch (Exception e) {
            log.warn("Scheduled ML retrain failed: {}", e.getMessage());
        }
    }

    private DayOfWeek parseDayOfWeek(String value) {
        try {
            return DayOfWeek.valueOf(value.toUpperCase());
        } catch (Exception e) {
            return DayOfWeek.SUNDAY;
        }
    }
}
